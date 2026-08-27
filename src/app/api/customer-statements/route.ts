import { NextRequest, NextResponse } from 'next/server'
import { listRows, getRow } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/customer-statements?customerId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Builds a unified customer account statement (ledger) with:
 *   - Opening balance (sum of all invoices + service jobs minus all payments before `from`)
 *   - All invoices in the date range (debits)
 *   - All service jobs in the date range (debits)
 *   - All invoice payments & service payments in the date range (credits)
 *   - Closing balance
 *   - Summary: total invoiced, total service jobs, total billed, total paid, outstanding
 *
 * Returns JSON.
 */

function parseDate(v: any): number {
  if (!v) return 0
  const d = new Date(v)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

function normalizePhone(raw: unknown): string {
  let p = String(raw ?? '').replace(/\D/g, '')
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2)
  if (p.length === 11 && p.startsWith('0')) p = p.slice(1)
  return p
}

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const customerId = url.searchParams.get('customerId')
    if (!customerId) return NextResponse.json({ error: 'customerId is required' }, { status: 400 })

    const now = new Date()
    const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1) // last 3 months
    const from = url.searchParams.get('from') || defaultFrom.toISOString().slice(0, 10)
    const to = url.searchParams.get('to') || now.toISOString().slice(0, 10)

    const fromMs = new Date(from + 'T00:00:00').getTime()
    const toMs = new Date(to + 'T23:59:59').getTime()

    const [customer, allInvoices, allPayments, allJobs, allServicePayments] = await Promise.all([
      getRow<any>('Customers', String(customerId)).catch(() => null),
      listRows<any>('Invoices').catch(() => []),
      listRows<any>('Payments').catch(() => []),
      listRows<any>('Jobs').catch(() => []),
      listRows<any>('ServicePayments').catch(() => []),
    ])

    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const custId = String(customer.id || customerId)
    const custPhone = normalizePhone(customer.phone)
    const custName = String(customer.name || '').trim().toLowerCase()

    // 1. Match customer invoices
    const customerInvoices = allInvoices.filter((inv) => {
      if (String(inv.customerId) === custId) return true
      if (custPhone && custPhone.length >= 10 && normalizePhone(inv.customerPhone) === custPhone) return true
      if (custName && custName.length >= 2 && String(inv.customerName || '').trim().toLowerCase() === custName) return true
      return false
    })

    // 2. Match customer invoice payments
    const customerInvoiceIds = new Set(customerInvoices.map((inv) => String(inv.id)))
    const customerInvoiceNumbers = new Set(customerInvoices.map((inv) => String(inv.number)).filter(Boolean))

    const customerPayments = allPayments.filter((p) => {
      if (p.invoiceId && (customerInvoiceIds.has(String(p.invoiceId)) || customerInvoiceNumbers.has(String(p.invoiceId)))) return true
      if (String(p.customerId) === custId) return true
      if (custPhone && custPhone.length >= 10 && normalizePhone(p.customerPhone) === custPhone) return true
      return false
    })

    // 3. Match customer service jobs
    const customerJobs = allJobs.filter((j) => {
      if (String(j.customerId) === custId) return true
      if (custPhone && custPhone.length >= 10 && (normalizePhone(j.customerMobile) === custPhone || normalizePhone(j.customerPhone) === custPhone)) return true
      if (custName && custName.length >= 2 && String(j.customerName || '').trim().toLowerCase() === custName) return true
      return false
    })

    // 4. Match customer service payments (including recorded + fallback from jobs)
    const customerJobIds = new Set(customerJobs.map((j) => String(j.jobId)).filter(Boolean))
    const customerJobRowIds = new Set(customerJobs.map((j) => String(j.id)).filter(Boolean))

    const recordedServicePayments = allServicePayments.filter((p) => {
      if (p.jobId && (customerJobIds.has(String(p.jobId)) || customerJobRowIds.has(String(p.jobId)))) return true
      if (custName && custName.length >= 2 && String(p.customerName || '').trim().toLowerCase() === custName) return true
      return false
    })

    const servicePaymentsList: any[] = [...recordedServicePayments]
    const jobsWithRecordedPayments = new Set(recordedServicePayments.map((p) => String(p.jobId)))

    for (const j of customerJobs) {
      const jKey = String(j.jobId || j.id)
      if (!jobsWithRecordedPayments.has(jKey)) {
        const adv = Number(j.advanceAmount) || 0
        const paid = Number(j.paidAmount) || 0
        if (adv > 0) {
          servicePaymentsList.push({
            id: `adv_${jKey}`,
            jobId: j.jobId,
            customerName: j.customerName,
            amount: adv,
            mode: j.advanceMode || j.paymentMode || 'Cash',
            type: 'Advance',
            date: j.createdAt || j.date || '',
            notes: 'Advance payment',
          })
        }
        if (paid > 0) {
          servicePaymentsList.push({
            id: `paid_${jKey}`,
            jobId: j.jobId,
            customerName: j.customerName,
            amount: paid,
            mode: j.paymentMode || 'Cash',
            type: j.paymentType || 'Final',
            date: j.completedDate || j.deliveredAt || j.updatedAt || j.createdAt || j.date || '',
            notes: 'Service payment',
          })
        }
      }
    }

    // Opening balance = (invoices + service jobs before `from`) - (invoice payments + service payments before `from`)
    const openingInvoices = customerInvoices.filter((inv) => parseDate(inv.date || inv.createdAt) < fromMs)
    const openingJobs = customerJobs.filter((j) => parseDate(j.createdAt || j.date || j.completedDate) < fromMs)

    const openingPayments = customerPayments.filter((p) => parseDate(p.date || p.createdAt) < fromMs)
    const openingServicePayments = servicePaymentsList.filter((p) => parseDate(p.date || p.createdAt) < fromMs)

    const openingInvoiced = openingInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const openingJobsAmount = openingJobs.reduce((s, j) => s + (Number(j.finalAmount) || Number(j.estimatedAmount) || 0), 0)
    const openingTotalDebits = openingInvoiced + openingJobsAmount

    const openingInvoicePaid = openingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const openingServicePaid = openingServicePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const openingTotalCredits = openingInvoicePaid + openingServicePaid

    const openingBalance = openingTotalDebits - openingTotalCredits

    // Transactions in date range
    const rangeInvoices = customerInvoices.filter((inv) => {
      const t = parseDate(inv.date || inv.createdAt)
      return t >= fromMs && t <= toMs
    })
    const rangeJobs = customerJobs.filter((j) => {
      const t = parseDate(j.createdAt || j.date || j.completedDate)
      return t >= fromMs && t <= toMs
    })
    const rangePayments = customerPayments.filter((p) => {
      const t = parseDate(p.date || p.createdAt)
      return t >= fromMs && t <= toMs
    })
    const rangeServicePayments = servicePaymentsList.filter((p) => {
      const t = parseDate(p.date || p.createdAt)
      return t >= fromMs && t <= toMs
    })

    // Merge into a single ledger sorted by date
    const ledger: any[] = []

    for (const inv of rangeInvoices) {
      ledger.push({
        date: inv.date || inv.createdAt || '',
        type: 'Invoice',
        number: String(inv.number || ''),
        description: `Invoice ${inv.number || ''}`,
        debit: Number(inv.grandTotal) || 0,
        credit: 0,
        reference: String(inv.id || ''),
      })
    }

    for (const j of rangeJobs) {
      const jobAmount = Number(j.finalAmount) || Number(j.estimatedAmount) || 0
      const details = [j.deviceType, j.brandModel, j.problemDesc].filter(Boolean).join(' - ')
      ledger.push({
        date: j.createdAt || j.date || '',
        type: 'Service Job',
        number: String(j.jobId || ''),
        description: `Service Job ${j.jobId || ''}${details ? ' (' + details + ')' : ''}`,
        debit: jobAmount,
        credit: 0,
        reference: String(j.id || j.jobId || ''),
        status: j.status || '',
      })
    }

    for (const p of rangePayments) {
      const inv = customerInvoices.find((i) => String(i.id) === String(p.invoiceId) || String(i.number) === String(p.invoiceId))
      ledger.push({
        date: p.date || p.createdAt || '',
        type: 'Payment',
        number: String(inv?.number || p.reference || ''),
        description: `Payment for Invoice ${inv?.number || ''} (${p.type || p.mode || 'Cash'})`,
        debit: 0,
        credit: Number(p.amount) || 0,
        reference: String(p.id || ''),
      })
    }

    for (const p of rangeServicePayments) {
      ledger.push({
        date: p.date || p.createdAt || '',
        type: 'Payment (Service)',
        number: String(p.jobId || ''),
        description: `Payment for Service ${p.jobId || ''} (${p.type || 'Service'} - ${p.mode || 'Cash'})${p.notes ? ' - ' + p.notes : ''}`,
        debit: 0,
        credit: Number(p.amount) || 0,
        reference: String(p.id || ''),
      })
    }

    ledger.sort((a, b) => parseDate(a.date) - parseDate(b.date))

    // Running balance
    let running = openingBalance
    const ledgerWithBalance = ledger.map((entry) => {
      running += entry.debit - entry.credit
      return { ...entry, balance: running }
    })

    const totalInvoiced = rangeInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const totalJobs = rangeJobs.reduce((s, j) => s + (Number(j.finalAmount) || Number(j.estimatedAmount) || 0), 0)
    const totalBilled = totalInvoiced + totalJobs

    const totalInvoicePaid = rangePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const totalJobPaid = rangeServicePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const totalPaid = totalInvoicePaid + totalJobPaid

    const closingBalance = openingBalance + totalBilled - totalPaid

    const allInvoiced = customerInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const allJobsAmount = customerJobs.reduce((s, j) => s + (Number(j.finalAmount) || Number(j.estimatedAmount) || 0), 0)
    const allDebits = allInvoiced + allJobsAmount

    const allInvoicePaid = customerPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const allJobPaid = servicePaymentsList.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const allCredits = allInvoicePaid + allJobPaid

    const totalOutstanding = allDebits - allCredits

    return NextResponse.json({
      customer: {
        id: String(customer.id || ''),
        name: String(customer.name || ''),
        phone: String(customer.phone || ''),
        email: String(customer.email || ''),
        address: String(customer.address || ''),
        gstNumber: String(customer.gstNumber || ''),
      },
      period: { from, to },
      openingBalance,
      closingBalance,
      summary: {
        totalInvoiced,
        totalJobs,
        totalBilled,
        totalInvoicePaid,
        totalJobPaid,
        totalPaid,
        netMovement: totalBilled - totalPaid,
        totalOutstanding,
      },
      counts: {
        invoices: rangeInvoices.length,
        jobs: rangeJobs.length,
        invoicePayments: rangePayments.length,
        servicePayments: rangeServicePayments.length,
        totalInvoices: customerInvoices.length,
        totalJobs: customerJobs.length,
      },
      ledger: ledgerWithBalance,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

