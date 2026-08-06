import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'


/**
 * GET /api/reports/sales-trend?range=monthly|weekly|daily&months=6
 * Returns daily/weekly/monthly sales + profit trend for charting.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const range = url.searchParams.get('range') || 'monthly'
    const months = parseInt(url.searchParams.get('months') || '6', 10)

    const invoices = await listRows<any>('Invoices')
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)

    const filtered = invoices.filter((inv) => {
      const d = inv.date ? new Date(inv.date) : null
      return d && d >= cutoff
    })

    // Group by date bucket
    const buckets = new Map<string, { sales: number; profit: number; count: number }>()
    for (const inv of filtered) {
      const d = new Date(inv.date)
      let key: string
      if (range === 'daily') {
        key = d.toISOString().slice(0, 10)
      } else if (range === 'weekly') {
        const week = getWeekKey(d)
        key = week
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      }
      if (!buckets.has(key)) buckets.set(key, { sales: 0, profit: 0, count: 0 })
      const b = buckets.get(key)!
      b.sales += Number(inv.grandTotal) || 0
      b.profit += Number(inv.profit) || 0
      b.count += 1
    }

    const trend = Array.from(buckets.entries())
      .map(([key, val]) => ({
        period: key,
        sales: Math.round(val.sales * 100) / 100,
        profit: Math.round(val.profit * 100) / 100,
        count: val.count,
      }))
      .sort((a, b) => a.period.localeCompare(b.period))

    return NextResponse.json({ trend, range })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

function getWeekKey(d: Date): string {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  return date.toISOString().slice(0, 10)
}
