import { NextRequest, NextResponse } from 'next/server'
import { listRows, getRow } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/customer-statements?customerId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Builds a COMBINED customer statement (ledger) with:
 *   - Opening balance (sum of all invoices/payments + service jobs/service payments before `from`)
 *   - All invoices in the date range (debits)
 *   - All Customer Service jobs in the date range (debits — finalAmount or estimatedAmount)
 *   - All invoice payments in the date range (credits)
 *   - All service payments in the date range (credits — linked via jobId)
 *   - Closing balance
 *   - Summary: total invoiced, total job charges, total paid (invoices), total service paid,
 *     outstanding — combined across invoices AND service jobs for the same customer.
 *
 * Jobs are linked to a customer by phone (digit-only match) primarily,
 * falling back to exact case-insensitive name match. This is the same
 * linkage a human would do at the counter — phone is the unique key.
 *
 * Returns JSON. The panel renders it; a future PDF can be added.
 */

function parseDate(v: any): number {
  if (!v) return 0
  const d = new Date(v)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

/** Strip everything except digits — used for phone matching. */
function digitsOnly(v: any): string {
  if (!v) return ''
  return String(v).replace(/\D/g, '')
}

/** Job amount = finalAmount if set, otherwise estimatedAmount. */
function jobAmount(j: any): number {
  const final = Number(j?.finalAmount) || 0
  if (final > 0) return final
  return Number(j?.estimatedAmount) || 0
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

    // v12.8 — COMBINED ledger: also pull Jobs + ServicePayments so the customer
    // statement shows BOTH sale invoices and Customer Service jobs on one account.
    const [customer, allInvoices, allPayments, allJobs, allServicePayments] = await Promise.all([
      getRow<any>('Customers', String(customerId)).catch(() => null),
      listRows<any>('Invoices').catch(() => []),
      listRows<any>('Payments').catch(() => []),
      listRows<any>('Jobs').catch(() => []),
      listRows<any>('ServicePayments').catch(() => []),
    ])

    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    // --- Invoice-side data (linked via customerId) ---
    const customerInvoices = allInvoices.filter((inv) => String(inv.customerId) === String(customerId))
    const customerPayments = allPayments.filter((p) => {
      const inv = customerInvoices.find((i) => String(i.id) === String(p.invoiceId))
      return !!inv
    })

    // --- Service-job-side data (linked via phone → customer.phone, fallback name) ---
    const custPhone = digitsOnly(customer.phone)
    const custName = String(customer.name || '').trim().toLowerCase()

    const customerJobs = allJobs.filter((j) => {
      // Match by phone (preferred) — strip non-digits and compare last 10 digits
      // to tolerate 91 prefix etc.
      const jobPhone = digitsOnly(j?.customerMobile)
      if (jobPhone && custPhone) {
        const jTail = jobPhone.slice(-10)
        const cTail = custPhone.slice(-10)
        if (jTail && cTail && jTail === cTail) return true
      }
      // Fallback: exact name match (case-insensitive, trimmed)
      if (custName && String(j?.customerName || '').trim().toLowerCase() === custName) return true
      return false
    })

    // Only collect non-empty jobIds so we never accidentally match a service
    // payment that itself has an empty jobId against an empty entry in the set.
    const customerJobIds = new Set(
      customerJobs
        .map((j) => String(j.jobId || j.id || ''))
        .filter((id) => id.length > 0)
    )
    const customerServicePayments = allServicePayments.filter((p) => {
      // Match by jobId first (most reliable) — guard against empty jobId.
      const pJobId = String(p.jobId || '')
      if (pJobId && customerJobIds.has(pJobId)) return true
      // Fallback: phone match against customer
      const pPhone = digitsOnly(p?.customerMobile || p?.phone)
      if (pPhone && custPhone && pPhone.slice(-10) === custPhone.slice(-10)) return true
      // Fallback: name match
      if (custName && String(p?.customerName || '').trim().toLowerCase() === custName) return true
      return false
    })

    // --- Opening balance = (invoiced + job charges) − (payments + service payments) before `from` ---
    const openingInvoices = customerInvoices.filter((inv) => parseDate(inv.date || inv.createdAt) < fromMs)
    const openingPayments = customerPayments.filter((p) => parseDate(p.date || p.createdAt) < fromMs)
    const openingJobs = customerJobs.filter((j) => {
      // Use completedDate if available (when the charge was finalized), else createdAt
      const t = parseDate(j.completedDate || j.createdAt)
      return t < fromMs
    })
    const openingServicePayments = customerServicePayments.filter((p) => parseDate(p.date || p.createdAt) < fromMs)

    const openingInvoiced = openingInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const openingJobCharges = openingJobs.reduce((s, j) => s + jobAmount(j), 0)
    const openingPaid = openingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const openingServicePaid = openingServicePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const openingBalance = (openingInvoiced + openingJobCharges) - (openingPaid + openingServicePaid)

    // --- Range transactions (in [from, to]) ---
    const rangeInvoices = customerInvoices.filter((inv) => {
      const t = parseDate(inv.date || inv.createdAt)
      return t >= fromMs && t <= toMs
    })
    const rangePayments = customerPayments.filter((p) => {
      const t = parseDate(p.date || p.createdAt)
      return t >= fromMs && t <= toMs
    })
    const rangeJobs = customerJobs.filter((j) => {
      const t = parseDate(j.completedDate || j.createdAt)
      return t >= fromMs && t <= toMs
    })
    const rangeServicePayments = customerServicePayments.filter((p) => {
      const t = parseDate(p.date || p.createdAt)
      return t >= fromMs && t <= toMs
    })

    // --- Merge into a single ledger sorted by date ---
    const ledger: any[] = []

    // 1. Sale invoices → debit (customer owes the grand total)
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

    // 2. Customer Service jobs → debit (customer owes the service charge)
    //    Skip jobs with zero amount (no estimate, no final) to keep ledger clean.
    for (const j of rangeJobs) {
      const amt = jobAmount(j)
      if (amt <= 0) continue
      const jobId = String(j.jobId || j.id || '')
      const device = String(j.deviceType || '').trim()
      const brand = String(j.brandModel || '').trim()
      const parts = [device, brand].filter(Boolean).join(' / ')
      const devSuffix = parts ? ` — ${parts}` : ''
      ledger.push({
        date: j.completedDate || j.createdAt || '',
        type: 'Service Job',
        number: jobId,
        description: `Service Job ${jobId}${devSuffix}`,
        debit: amt,
        credit: 0,
        reference: String(j.id || ''),
      })
    }

    // 3. Invoice payments → credit
    for (const p of rangePayments) {
      const inv = customerInvoices.find((i) => String(i.id) === String(p.invoiceId))
      ledger.push({
        date: p.date || p.createdAt || '',
        type: 'Payment',
        number: String(inv?.number || ''),
        description: `Payment for ${inv?.number || ''} (${p.type || 'Cash'})`,
        debit: 0,
        credit: Number(p.amount) || 0,
        reference: String(p.id || ''),
      })
    }

    // 4. Service payments → credit (advance / partial / final against a job)
    for (const p of rangeServicePayments) {
      const jobId = String(p.jobId || '')
      ledger.push({
        date: p.date || p.createdAt || '',
        type: 'Service Payment',
        number: jobId,
        description: `Payment for ${jobId || 'service'} (${p.type || p.mode || 'Cash'})`,
        debit: 0,
        credit: Number(p.amount) || 0,
        reference: String(p.id || ''),
      })
    }

    // Sort ascending by date; secondary sort by debit-then-credit so a debit
    // and credit on the same day display in a stable order.
    ledger.sort((a, b) => {
      const da = parseDate(a.date)
      const db = parseDate(b.date)
      if (da !== db) return da - db
      // Debits before credits on same date (charges before payments)
      if (a.debit > 0 && b.credit > 0) return -1
      if (a.credit > 0 && b.debit > 0) return 1
      return 0
    })

    // --- Running balance ---
    let running = openingBalance
    const ledgerWithBalance = ledger.map((entry) => {
      running += entry.debit - entry.credit
      return { ...entry, balance: running }
    })

    // --- Summary totals (range) ---
    const totalInvoiced = rangeInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const totalJobCharges = rangeJobs.reduce((s, j) => s + jobAmount(j), 0)
    const totalPaid = rangePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const totalServicePaid = rangeServicePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)

    const totalBilled = totalInvoiced + totalJobCharges
    const totalReceived = totalPaid + totalServicePaid
    const netMovement = totalBilled - totalReceived
    const closingBalance = openingBalance + netMovement

    // --- All-time outstanding (combined invoices + jobs − all payments) ---
    const allInvoiced = customerInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const allJobCharges = customerJobs.reduce((s, j) => s + jobAmount(j), 0)
    const allPaid = customerPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const allServicePaid = customerServicePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const totalOutstanding = (allInvoiced + allJobCharges) - (allPaid + allServicePaid)

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
        totalJobCharges,
        totalBilled,
        totalPaid,
        totalServicePaid,
        totalReceived,
        netMovement,
        totalOutstanding,
      },
      ledger: ledgerWithBalance,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
