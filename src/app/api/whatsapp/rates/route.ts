import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { safeJsonParse } from '@/lib/utils'

/**
 * GET /api/whatsapp/rates
 *
 * Returns a rate comparison matrix: for each item, what rate did each supplier
 * quote in their latest response? Useful for choosing the cheapest supplier.
 *
 * Query params:
 *   ?itemId=xxx   — filter to a specific item
 *   ?days=30      — only consider responses from last N days (default 90)
 *
 * Response shape:
 *   {
 *     comparisons: [
 *       {
 *         itemId: "...",
 *         itemName: "SSD 512GB",
 *         sku: "SSD-512",
 *         rates: [
 *           { supplierId, supplierName, rate, gstApplicable, gstRate, enquiryDate, age: "2 days ago" },
 *           ...
 *         ],
 *         bestRate: { supplierId, supplierName, rate, savings: 0 },
 *         averageRate: 3500,
 *         rateCount: 3
 *       }
 *     ]
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const filterItemId = url.searchParams.get('itemId')
    const days = parseInt(url.searchParams.get('days') || '90', 10)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [enquiries, items, suppliers] = await Promise.all([
      listRows<any>('Enquiries'),
      listRows<any>('Items', { useCache: true }),
      listRows<any>('Suppliers', { useCache: true }),
    ])

    const supplierMap = new Map(suppliers.map((s) => [String(s.id), s]))
    const itemMap = new Map(items.map((i) => [String(i.id), i]))

    // Collect all rates from responded enquiries
    // Map: itemId -> [{ supplierId, supplierName, rate, gstApplicable, gstRate, enquiryDate, response }]
    const rateMap = new Map<string, any[]>()

    for (const e of enquiries) {
      if (String(e.status) !== 'responded' && String(e.status) !== 'rate_updated') continue
      const respondedAt = e.respondedAt ? new Date(e.respondedAt) : null
      if (!respondedAt || respondedAt < since) continue

      let originalItems: any[] = []
      try {
        originalItems = safeJsonParse<any[]>(e.itemsJson, [])
      } catch {
        continue
      }

      let rates: any[] = []
      try {
        rates = safeJsonParse<any[]>(e.ratesJson, [])
      } catch {
        continue
      }

      const supplierId = String(e.supplierId || '')
      const supplier = supplierMap.get(supplierId)
      const supplierName = String(supplier?.name || e.supplierName || 'Unknown')

      for (const r of rates) {
        // Skip out-of-stock entries (rate = 0 or notes contain OOS marker)
        const isOOS = r.rate === 0 || (r.notes && String(r.notes).includes('OUT OF STOCK'))
        if (isOOS) continue

        // Try to match rate to an original item by name
        const matched = originalItems.find(
          (oi) =>
            String(oi?.name || '').toLowerCase() === String(r?.itemName || '').toLowerCase() ||
            String(oi?.name || '').toLowerCase().includes(String(r?.itemName || '').toLowerCase()) ||
            String(r?.itemName || '').toLowerCase().includes(String(oi?.name || '').toLowerCase())
        )

        const itemId = String(matched?.id || `name:${r.itemName}`)

        if (filterItemId && itemId !== filterItemId) continue

        if (!rateMap.has(itemId)) rateMap.set(itemId, [])
        rateMap.get(itemId)!.push({
          supplierId,
          supplierName,
          rate: Number(r.rate) || 0,
          totalCost: Number(r.totalCost) || Number(r.rate) || 0,
          gstType: r.gstType,
          gstApplicable: r.gstApplicable,
          gstRate: r.gstRate ? Number(r.gstRate) : undefined,
          enquiryId: String(e.id || ''),
          enquiryDate: respondedAt.toISOString(),
          response: String(e.response || '').slice(0, 500),
        })
      }
    }

    // Build comparison objects
    const comparisons: any[] = []
    for (const [itemId, rates] of rateMap.entries()) {
      if (rates.length === 0) continue

      // Sort by totalCost ascending (cheapest actual cost first).
      // totalCost accounts for GST: 3450+ (→4071 with 18% GST) vs 3450 nett (→3450).
      // Falls back to rate if totalCost not present (old data).
      rates.sort((a, b) => (a.totalCost ?? a.rate) - (b.totalCost ?? b.rate))

      const best = rates[0]
      const worst = rates[rates.length - 1]
      const average = rates.reduce((s, r) => s + (r.totalCost ?? r.rate), 0) / rates.length

      const item = itemMap.get(itemId)
      const itemName = item ? String(item.name) : rates[0] ? String(rates[0].itemName || '') : itemId
      const sku = item ? String(item.sku || '') : ''

      // Calculate age of best rate
      const ageMs = Date.now() - new Date(best.enquiryDate).getTime()
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))
      const age = ageDays === 0 ? 'Today' : ageDays === 1 ? 'Yesterday' : `${ageDays} days ago`

      comparisons.push({
        itemId,
        itemName,
        sku,
        rates,
        bestRate: {
          supplierId: best.supplierId,
          supplierName: best.supplierName,
          rate: best.rate,
          totalCost: best.totalCost ?? best.rate,
          gstType: best.gstType,
          gstApplicable: best.gstApplicable,
          gstRate: best.gstRate,
          enquiryDate: best.enquiryDate,
          age,
        },
        worstRate: { supplierName: worst.supplierName, rate: worst.rate, totalCost: worst.totalCost ?? worst.rate },
        averageRate: Math.round(average * 100) / 100,
        rateCount: rates.length,
        potentialSavings: (worst.totalCost ?? worst.rate) - (best.totalCost ?? best.rate),
      })
    }

    // Sort: items with most rates first, then by savings potential
    comparisons.sort((a, b) => {
      if (b.rateCount !== a.rateCount) return b.rateCount - a.rateCount
      return b.potentialSavings - a.potentialSavings
    })

    return NextResponse.json({
      comparisons,
      totalItems: comparisons.length,
      totalSuppliers: new Set(comparisons.flatMap((c) => c.rates.map((r) => r.supplierId))).size,
      dateRange: { since: since.toISOString(), until: new Date().toISOString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
