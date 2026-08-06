import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { safeJsonParse } from '@/lib/utils'

/**
 * GET /api/reports/top-items?months=3&limit=20
 * Returns top-selling items by quantity and revenue.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const months = parseInt(url.searchParams.get('months') || '3', 10)
    const limit = parseInt(url.searchParams.get('limit') || '20', 10)

    const invoices = await listRows<any>('Invoices')
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const filtered = invoices.filter((inv) => inv.date ? new Date(inv.date) >= cutoff : false)

    // Aggregate items
    const itemMap = new Map<string, { name: string; sku: string; qty: number; revenue: number; profit: number }>()
    for (const inv of filtered) {
      const items = safeJsonParse<any[]>(inv.itemsJson, [])
      for (const item of items) {
        const key = String(item.itemId || item.name || '')
        if (!key) continue
        if (!itemMap.has(key)) {
          itemMap.set(key, { name: String(item.name || ''), sku: String(item.sku || ''), qty: 0, revenue: 0, profit: 0 })
        }
        const e = itemMap.get(key)!
        e.qty += Number(item.quantity) || 0
        const amt = (Number(item.rate) || 0) * (Number(item.quantity) || 0) - (Number(item.discount) || 0)
        e.revenue += amt
        e.profit += amt - ((Number(item.costPrice) || 0) * (Number(item.quantity) || 0))
      }
    }

    const byQty = Array.from(itemMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit)
      .map((i, idx) => ({ rank: idx + 1, ...i, revenue: Math.round(i.revenue * 100) / 100, profit: Math.round(i.profit * 100) / 100 }))

    const byRevenue = Array.from(itemMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit)
      .map((i, idx) => ({ rank: idx + 1, ...i, revenue: Math.round(i.revenue * 100) / 100, profit: Math.round(i.profit * 100) / 100 }))

    return NextResponse.json({ byQty, byRevenue, months })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
