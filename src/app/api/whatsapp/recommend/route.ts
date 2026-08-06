import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { safeJsonParse } from '@/lib/utils'

/**
 * GET /api/whatsapp/recommend
 *
 * For each item, recommends the best supplier based on:
 *   - Lowest rate (cheapest)
 *   - Most recent quote (freshest)
 *   - Reliability (has responded before)
 *
 * Query params:
 *   ?itemId=xxx   — get recommendation for a single item
 *   ?strategy=cheapest|freshest|reliable  (default: cheapest)
 *
 * Response:
 *   {
 *     recommendations: [
 *       {
 *         itemId, itemName, sku,
 *         recommendedSupplier: { supplierId, supplierName, rate, gstApplicable, gstRate, enquiryDate, age },
 *         reason: "Cheapest rate (Rs.3500, 12% below average)",
 *         alternatives: [ ... 2 more suppliers ... ],
 *         currentCostPrice: 3200,  // what you're currently paying
 *         potentialSaving: 300     // if you switch to recommended
 *       }
 *     ]
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const filterItemId = url.searchParams.get('itemId')
    const strategy = url.searchParams.get('strategy') || 'cheapest'

    const [enquiries, items, suppliers] = await Promise.all([
      listRows<any>('Enquiries'),
      listRows<any>('Items', { useCache: true }),
      listRows<any>('Suppliers', { useCache: true }),
    ])

    const supplierMap = new Map(suppliers.map((s) => [String(s.id), s]))

    // Collect rates per item (same logic as rates endpoint but condensed)
    const rateMap = new Map<string, any[]>()
    for (const e of enquiries) {
      if (String(e.status) !== 'responded' && String(e.status) !== 'rate_updated') continue
      const respondedAt = e.respondedAt ? new Date(e.respondedAt) : null
      if (!respondedAt) continue

      const originalItems = safeJsonParse<any[]>(e.itemsJson, [])
      const rates = safeJsonParse<any[]>(e.ratesJson, [])
      const supplierId = String(e.supplierId || '')
      const supplier = supplierMap.get(supplierId)
      const supplierName = String(supplier?.name || e.supplierName || 'Unknown')

      for (const r of rates) {
        // Skip out-of-stock entries
        const isOOS = r.rate === 0 || (r.notes && String(r.notes).includes('OUT OF STOCK'))
        if (isOOS) continue

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
          enquiryDate: respondedAt.toISOString(),
        })
      }
    }

    const recommendations: any[] = []
    for (const item of items) {
      const itemId = String(item.id)
      const rates = rateMap.get(itemId) || []
      if (rates.length === 0) continue

      let recommended: any
      let reason = ''

      if (strategy === 'freshest') {
        rates.sort((a, b) => new Date(b.enquiryDate).getTime() - new Date(a.enquiryDate).getTime())
        recommended = rates[0]
        const ageMs = Date.now() - new Date(recommended.enquiryDate).getTime()
        const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))
        reason = `Most recent quote (${ageDays === 0 ? 'today' : ageDays + ' days ago'})`
      } else if (strategy === 'reliable') {
        // Supplier with most responses (most reliable)
        const supplierCounts = new Map<string, number>()
        for (const r of rates) supplierCounts.set(r.supplierId, (supplierCounts.get(r.supplierId) || 0) + 1)
        const reliableSupplierId = Array.from(supplierCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
        recommended = rates.find((r) => r.supplierId === reliableSupplierId)!
        recommended = { ...recommended }
        // Among that supplier's rates, take the most recent
        const supplierRates = rates.filter((r) => r.supplierId === reliableSupplierId)
        supplierRates.sort((a, b) => new Date(b.enquiryDate).getTime() - new Date(a.enquiryDate).getTime())
        recommended = supplierRates[0]
        reason = `Most reliable supplier (${supplierCounts.get(reliableSupplierId)} responses received)`
      } else {
        // cheapest (default) — sort by totalCost (accounts for GST)
        rates.sort((a, b) => (a.totalCost ?? a.rate) - (b.totalCost ?? b.rate))
        recommended = rates[0]
        const avg = rates.reduce((s, r) => s + (r.totalCost ?? r.rate), 0) / rates.length
        const pctBelow = avg > 0 ? Math.round(((avg - (recommended.totalCost ?? recommended.rate)) / avg) * 100) : 0
        reason = `Cheapest total cost (Rs.${recommended.totalCost ?? recommended.rate}${pctBelow > 0 ? `, ${pctBelow}% below avg` : ''})`
      }

      const ageMs = Date.now() - new Date(recommended.enquiryDate).getTime()
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))
      const age = ageDays === 0 ? 'Today' : ageDays === 1 ? 'Yesterday' : `${ageDays} days ago`

      const currentCostPrice = Number(item.costPrice) || 0
      const recommendedTotalCost = recommended.totalCost ?? recommended.rate
      const potentialSaving = currentCostPrice > 0 ? currentCostPrice - recommendedTotalCost : 0

      // Alternatives: next 2 best rates from different suppliers
      const alternatives = rates
        .filter((r) => r.supplierId !== recommended.supplierId)
        .slice(0, 2)

      recommendations.push({
        itemId,
        itemName: String(item.name || ''),
        sku: String(item.sku || ''),
        currentCostPrice,
        recommendedSupplier: {
          ...recommended,
          age,
        },
        reason,
        potentialSaving,
        alternatives,
        totalSuppliersQuoted: new Set(rates.map((r) => r.supplierId)).size,
      })
    }

    // Sort by potential saving descending
    recommendations.sort((a, b) => b.potentialSaving - a.potentialSaving)

    return NextResponse.json({
      recommendations,
      strategy,
      totalItems: recommendations.length,
      totalPotentialSaving: recommendations.reduce((s, r) => s + Math.max(0, r.potentialSaving), 0),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
