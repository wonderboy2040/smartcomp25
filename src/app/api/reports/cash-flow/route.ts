import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'

/**
 * GET /api/reports/cash-flow?date=YYYY-MM-DD
 * Returns: opening cash, cash in (sales+service), cash out (expenses), closing cash.
 * Only considers mode=Cash transactions for the given date.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const dateStr = url.searchParams.get('date') || new Date().toISOString().slice(0, 10)
    const targetDate = new Date(dateStr)
    const targetDayStr = targetDate.toISOString().slice(0, 10)

    // Get all data once
    const [payments, expenses, servicePayments] = await Promise.all([
      listRows<any>('Payments'),
      listRows<any>('Expenses'),
      listRows<any>('ServicePayments'),
    ])

    const isSameDay = (d: string) => d && new Date(d).toISOString().slice(0, 10) === targetDayStr
    const isBeforeDay = (d: string) => d && new Date(d).toISOString().slice(0, 10) < targetDayStr

    // Cash IN today
    const cashSalesToday = payments
      .filter((p) => isSameDay(p.date) && String(p.type).toLowerCase() === 'cash')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)

    const cashServiceToday = servicePayments
      .filter((p) => isSameDay(p.date) && String(p.mode).toLowerCase() === 'cash')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)

    // Cash OUT today
    const cashExpensesToday = expenses
      .filter((e) => isSameDay(e.date) && String(e.mode).toLowerCase() === 'cash')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)

    // Opening cash = all cash in before today - all cash out before today
    const cashInBefore = payments
      .filter((p) => isBeforeDay(p.date) && String(p.type).toLowerCase() === 'cash')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const serviceInBefore = servicePayments
      .filter((p) => isBeforeDay(p.date) && String(p.mode).toLowerCase() === 'cash')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const cashOutBefore = expenses
      .filter((e) => isBeforeDay(e.date) && String(e.mode).toLowerCase() === 'cash')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const openingCash = cashInBefore + serviceInBefore - cashOutBefore

    const closingCash = openingCash + cashSalesToday + cashServiceToday - cashExpensesToday

    // UPI summary for the day
    const upiSalesToday = payments
      .filter((p) => isSameDay(p.date) && String(p.type).toLowerCase() === 'upi')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const upiServiceToday = servicePayments
      .filter((p) => isSameDay(p.date) && String(p.mode).toLowerCase() === 'upi')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const upiExpensesToday = expenses
      .filter((e) => isSameDay(e.date) && String(e.mode).toLowerCase() === 'upi')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)

    return NextResponse.json({
      date: targetDayStr,
      openingCash,
      cashIn: {
        sales: cashSalesToday,
        service: cashServiceToday,
        total: cashSalesToday + cashServiceToday,
      },
      cashOut: {
        expenses: cashExpensesToday,
        total: cashExpensesToday,
      },
      closingCash,
      upi: {
        in: upiSalesToday + upiServiceToday,
        out: upiExpensesToday,
        net: upiSalesToday + upiServiceToday - upiExpensesToday,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
