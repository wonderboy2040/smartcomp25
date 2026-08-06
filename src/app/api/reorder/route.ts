import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'

/**
 * GET /api/reorder
 * Smart stock reorder suggestions.
 *
 * Algorithm:
 *   - For each item, compute "sales velocity" = units sold in last 30 days
 *   - Estimate "days until out of stock" = currentQty / max(velocity, 1)
 *   - If daysUntilOut < 14 (2 weeks) OR currentQty <= minQuantity → suggest reorder
 *   - Suggested reorder qty = velocity * 30 (1 month of stock) — currentQty, min 1
 *
 * Returns sorted list, most urgent first.
 */
export async function GET(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }

    const url = new URL(req.url)
    const lookbackDays = Number(url.searchParams.get('days') || 30)
    const urgencyThreshold = Number(url.searchParams.get('threshold') || 14) // days

    // Fetch items + invoices in parallel
    const [items, invoices] = await Promise.all([
      listRows<any>('Items').catch(() => []),
      listRows<any>('Invoices').catch(() => []),
    ])

    const now = Date.now()
    const cutoff = now - lookbackDays * 24 * 60 * 60 * 1000

    // Build sales velocity map: itemId -> total qty sold in last 30 days
    const velocityMap = new Map<string, number>()
    for (const inv of invoices) {
      const invDate = new Date(inv.date || inv.createdAt || Date.now()).getTime()
      if (invDate < cutoff) continue
      try {
        const itemsJson = typeof inv.itemsJson === 'string' ? JSON.parse(inv.itemsJson) : (inv.itemsJson || [])
        for (const item of itemsJson) {
          if (item.itemId) {
            velocityMap.set(item.itemId, (velocityMap.get(item.itemId) || 0) + (Number(item.quantity) || 0))
          }
        }
      } catch {}
    }

    const suggestions = items
      .map((item) => {
        const qty = Number(item.quantity) || 0
        const minQty = Number(item.minQuantity) || 0
        const velocity = velocityMap.get(item.id) || 0
        const dailyVelocity = velocity / lookbackDays
        const daysUntilOut = dailyVelocity > 0 ? Math.floor(qty / dailyVelocity) : 9999
        const suggestedReorder = Math.max(1, Math.ceil(dailyVelocity * 30) - qty)

        // Urgency: 'critical' (out or below min), 'urgent' (<7d), 'soon' (<14d), 'none'
        let urgency: 'critical' | 'urgent' | 'soon' | 'none' = 'none'
        if (qty <= 0 || (minQty > 0 && qty <= minQty)) urgency = 'critical'
        else if (daysUntilOut < 7) urgency = 'urgent'
        else if (daysUntilOut < urgencyThreshold) urgency = 'soon'

        return {
          id: item.id,
          name: item.name,
          sku: item.sku,
          category: item.category,
          currentQty: qty,
          minQty,
          velocity30d: velocity,
          dailyVelocity: Number(dailyVelocity.toFixed(2)),
          daysUntilOut: daysUntilOut === 9999 ? null : daysUntilOut,
          suggestedReorderQty: urgency !== 'none' ? suggestedReorder : 0,
          costPrice: Number(item.costPrice) || 0,
          sellingPrice: Number(item.sellingPrice) || 0,
          reorderCost: urgency !== 'none' ? suggestedReorder * (Number(item.costPrice) || 0) : 0,
          urgency,
          supplier: item.supplier || '',
        }
      })
      .filter((s) => s.urgency !== 'none')
      .sort((a, b) => {
        // Critical first, then urgent, then soon
        const order = { critical: 0, urgent: 1, soon: 2, none: 3 }
        if (order[a.urgency] !== order[b.urgency]) return order[a.urgency] - order[b.urgency]
        return (a.daysUntilOut ?? 9999) - (b.daysUntilOut ?? 9999)
      })

    const summary = {
      total: suggestions.length,
      critical: suggestions.filter((s) => s.urgency === 'critical').length,
      urgent: suggestions.filter((s) => s.urgency === 'urgent').length,
      soon: suggestions.filter((s) => s.urgency === 'soon').length,
      totalReorderCost: suggestions.reduce((s, x) => s + x.reorderCost, 0),
    }

    return NextResponse.json({ suggestions, summary })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
