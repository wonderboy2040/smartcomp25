import { NextRequest, NextResponse } from 'next/server'
import { listRows, getRow } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/customer-statements?customerId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Builds a customer statement (ledger) with:
 *   - Opening balance (sum of all invoices/payments before `from`)
 *   - All invoices in the date range (debits)
 *   - All payments in the date range (credits)
 *   - Closing balance
 *   - Summary: total invoiced, total paid, outstanding
 *
 * Returns JSON. The panel renders it; a future PDF can be added.
 */

function parseDate(v: any): number {
  if (!v) return 0
  const d = new Date(v)
  return isNaN(d.getTime()) ? 0 : d.getTime()
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

    const [customer, allInvoices, allPayments] = await Promise.all([
      getRow<any>('Customers', String(customerId)).catch(() => null),
      listRows<any>('Invoices').catch(() => []),
      listRows<any>('Payments').catch(() => []),
    ])

    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const customerInvoices = allInvoices.filter((inv) => String(inv.customerId) === String(customerId))
    const customerPayments = allPayments.filter((p) => {
      const inv = customerInvoices.find((i) => String(i.id) === String(p.invoiceId))
      return !!inv
    })

    // Opening balance = total invoiced before `from` - total paid before `from`
    const openingInvoices = customerInvoices.filter((inv) => parseDate(inv.date || inv.createdAt) < fromMs)
    const openingPayments = customerPayments.filter((p) => parseDate(p.date || p.createdAt) < fromMs)
    const openingInvoiced = openingInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const openingPaid = openingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const openingBalance = openingInvoiced - openingPaid

    // Transactions in date range
    const rangeInvoices = customerInvoices.filter((inv) => {
      const t = parseDate(inv.date || inv.createdAt)
      return t >= fromMs && t <= toMs
    })
    const rangePayments = customerPayments.filter((p) => {
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
    ledger.sort((a, b) => parseDate(a.date) - parseDate(b.date))

    // Running balance
    let running = openingBalance
    const ledgerWithBalance = ledger.map((entry) => {
      running += entry.debit - entry.credit
      return { ...entry, balance: running }
    })

    const totalInvoiced = rangeInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const totalPaid = rangePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const closingBalance = openingBalance + totalInvoiced - totalPaid

    const allInvoiced = customerInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const allPaid = customerPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const totalOutstanding = allInvoiced - allPaid

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
        totalPaid,
        netMovement: totalInvoiced - totalPaid,
        totalOutstanding,
      },
      ledger: ledgerWithBalance,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
