import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'
import { forecastInventoryDemand } from '@/lib/super-intelligence'

/**
 * GET /api/ai/inventory-forecast
 *
 * v13 NEW: Smart Inventory Demand Forecast.
 *
 * Returns per-item forecast including:
 *   - averageDailyDemand
 *   - daysOfStock
 *   - predictedStockoutDate
 *   - reorderSuggestion (urgency + suggestedQty)
 *   - seasonalityFactor (Diwali/Christmas/back-to-school boost)
 *   - trend (increasing/decreasing/stable)
 *   - 14-day forecast array
 *
 * Sorted by urgency (critical first).
 *
 * Cache: 2 minutes (the AI/forecast route already uses similar TTL).
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const leadTimeDays = parseInt(url.searchParams.get('leadTimeDays') || '7')
    const onlyUrgent = url.searchParams.get('onlyUrgent') === '1'

    const [items, invoices] = await Promise.all([
      listRows<any>('Items').catch(() => []),
      listRows<any>('Invoices').catch(() => []),
    ])

    const forecasts = forecastInventoryDemand(items, invoices, { leadTimeDays })

    const result = onlyUrgent ? forecasts.filter((f) => f.reorderSuggestion.urgency !== 'none') : forecasts

    const stats = {
      totalItems: forecasts.length,
      critical: forecasts.filter((f) => f.reorderSuggestion.urgency === 'critical').length,
      high: forecasts.filter((f) => f.reorderSuggestion.urgency === 'high').length,
      medium: forecasts.filter((f) => f.reorderSuggestion.urgency === 'medium').length,
      low: forecasts.filter((f) => f.reorderSuggestion.urgency === 'low').length,
      sufficient: forecasts.filter((f) => f.reorderSuggestion.urgency === 'none').length,
      forecastDays: 14,
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json({ forecasts: result, stats }, {
      headers: {
        'Cache-Control': 'public, max-age=120',
        'X-RateLimit-Remaining': check.remaining.toString(),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
