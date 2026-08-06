import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'


/**
 * GET /api/service-payments
 * Query: ?from=2026-01-01&to=2026-12-31
 * Returns: { payments, totals: { upi, cash, total } }
 *
 * Note: engineerShare/adminShare were removed in v9.1. The full payment
 * amount now belongs to the shop owner (single-owner model).
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let payments = await listRows<any>('ServicePayments')
    if (from) {
      const fromD = new Date(from)
      payments = payments.filter((p) => new Date(p.date) >= fromD)
    }
    if (to) {
      const toD = new Date(to)
      toD.setHours(23, 59, 59, 999)
      payments = payments.filter((p) => new Date(p.date) <= toD)
    }

    payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const totals = payments.reduce((acc, p) => {
      const amt = Number(p.amount) || 0
      if (String(p.mode).toLowerCase() === 'upi') acc.upi += amt
      else acc.cash += amt
      acc.total += amt
      return acc
    }, { upi: 0, cash: 0, total: 0 })

    const result = payments.map((p) => ({
      ...p,
      amount: Number(p.amount) || 0,
      mode: String(p.mode || 'Cash'),
      type: String(p.type || ''),
      jobId: String(p.jobId || ''),
      customerName: String(p.customerName || ''),
    }))

    return NextResponse.json({ payments: result, totals })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
