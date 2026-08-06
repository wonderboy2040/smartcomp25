import { NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'


/**
 * GET /api/credit-control
 * Returns customer credit analysis: outstanding, aging, credit score, holds.
 *
 * For each customer:
 *   - creditBalance (current outstanding)
 *   - creditLimit (max allowed)
 *   - creditUtilization (%) = balance / limit
 *   - oldestUnpaidInvoice (days overdue)
 *   - agingBucket: 0-30, 31-60, 61-90, 90+
 *   - creditScore: A+ / A / B / C / D (based on payment history)
 *   - onHold: true if 90+ days overdue OR balance > limit
 *   - totalInvoices, paidInvoices, unpaidInvoices
 */
export async function GET() {
  try {
    const [customers, invoices, payments] = await Promise.all([
      listRows<any>('Customers'),
      listRows<any>('Invoices'),
      listRows<any>('Payments'),
    ])

    const now = Date.now()
    const DAY_MS = 24 * 60 * 60 * 1000

    const analysis = customers.map((c) => {
      const customerInvoices = invoices.filter((inv) => String(inv.customerId) === String(c.id))
      const customerPayments = payments.filter((p) =>
        customerInvoices.some((inv) => String(inv.id) === String(p.invoiceId))
      )

      const balance = Number(c.creditBalance) || 0
      const limit = Number(c.creditLimit) || 0
      const utilization = limit > 0 ? (balance / limit) * 100 : 0

      // Find oldest unpaid invoice
      const unpaidInvoices = customerInvoices.filter((inv) => Number(inv.amountDue) > 0)
      let oldestDays = 0
      if (unpaidInvoices.length > 0) {
        const oldest = unpaidInvoices
          .map((inv) => new Date(inv.date || inv.createdAt || Date.now()).getTime())
          .sort((a, b) => a - b)[0]
        oldestDays = Math.floor((now - oldest) / DAY_MS)
      }

      // Aging bucket
      let agingBucket = 'none'
      if (oldestDays > 90) agingBucket = '90+'
      else if (oldestDays > 60) agingBucket = '61-90'
      else if (oldestDays > 30) agingBucket = '31-60'
      else if (oldestDays > 0) agingBucket = '0-30'

      // Credit score calculation
      const totalInvoices = customerInvoices.length
      const paidOnTime = customerInvoices.filter((inv) => {
        if (Number(inv.amountDue) > 0) return false
        // Check if paid within credit days (default 30)
        const creditDays = Number(c.creditDays) || 30
        const invDate = new Date(inv.date || inv.createdAt || Date.now()).getTime()
        const payDate = customerPayments
          .filter((p) => String(p.invoiceId) === String(inv.id))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
        if (!payDate) return true
        return new Date(payDate.date).getTime() - invDate <= creditDays * DAY_MS
      }).length

      let creditScore = c.creditScore || 'B'
      if (totalInvoices >= 3) {
        const onTimeRate = paidOnTime / totalInvoices
        if (onTimeRate >= 0.95) creditScore = 'A+'
        else if (onTimeRate >= 0.85) creditScore = 'A'
        else if (onTimeRate >= 0.70) creditScore = 'B'
        else if (onTimeRate >= 0.50) creditScore = 'C'
        else creditScore = 'D'
      }

      // On hold: 90+ days OR balance exceeds limit (if limit set)
      const onHold = oldestDays > 90 || (limit > 0 && balance > limit)

      return {
        id: String(c.id),
        name: String(c.name || ''),
        phone: String(c.phone || ''),
        gstNumber: String(c.gstNumber || ''),
        creditBalance: balance,
        creditLimit: limit,
        creditDays: Number(c.creditDays) || 30,
        creditScore,
        utilization: Math.round(utilization * 100) / 100,
        agingBucket,
        oldestDays,
        onHold,
        totalInvoices,
        paidInvoices: totalInvoices - unpaidInvoices.length,
        unpaidInvoices: unpaidInvoices.length,
        unpaidInvoicesList: unpaidInvoices.map((inv) => ({
          id: String(inv.id),
          number: String(inv.number || ''),
          date: inv.date,
          amountDue: Number(inv.amountDue) || 0,
          days: Math.floor((now - new Date(inv.date || inv.createdAt || Date.now()).getTime()) / DAY_MS),
        })),
      }
    })

    // Summary
    const totalOutstanding = analysis.reduce((s, c) => s + c.creditBalance, 0)
    const customersWithDues = analysis.filter((c) => c.creditBalance > 0).length
    const onHoldCount = analysis.filter((c) => c.onHold).length
    const bucketCounts = {
      '0-30': analysis.filter((c) => c.agingBucket === '0-30').length,
      '31-60': analysis.filter((c) => c.agingBucket === '31-60').length,
      '61-90': analysis.filter((c) => c.agingBucket === '61-90').length,
      '90+': analysis.filter((c) => c.agingBucket === '90+').length,
    }
    const bucketAmounts = {
      '0-30': analysis.filter((c) => c.agingBucket === '0-30').reduce((s, c) => s + c.creditBalance, 0),
      '31-60': analysis.filter((c) => c.agingBucket === '31-60').reduce((s, c) => s + c.creditBalance, 0),
      '61-90': analysis.filter((c) => c.agingBucket === '61-90').reduce((s, c) => s + c.creditBalance, 0),
      '90+': analysis.filter((c) => c.agingBucket === '90+').reduce((s, c) => s + c.creditBalance, 0),
    }

    return NextResponse.json({
      customers: analysis.sort((a, b) => b.creditBalance - a.creditBalance),
      summary: {
        totalOutstanding,
        customersWithDues,
        onHoldCount,
        bucketCounts,
        bucketAmounts,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
