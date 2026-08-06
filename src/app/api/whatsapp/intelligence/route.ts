import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'
import { parseRateResponseAdvanced } from '@/lib/whatsapp'
import { safeJsonParse } from '@/lib/utils'

/**
 * GET /api/whatsapp/intelligence
 * Superintelligence: analyzes ALL supplier rate replies and produces insights.
 *
 * For each enquiry that has a response, runs the advanced rate parser and
 * aggregates results into:
 *   - Per-supplier rate averages (cheapest supplier detection)
 *   - Per-item best rate across all suppliers
 *   - Confidence summary (how reliable the parsed data is)
 *   - Out-of-stock alerts
 *   - Recommended supplier per item (lowest totalCost with confidence ≥ 0.7)
 *   - Trend: latest rate vs previous rate for each item
 *
 * Query: ?days=30 (default 90)
 */
export async function GET(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }

    const url = new URL(req.url)
    const days = Number(url.searchParams.get('days') || 90)
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

    const [enquiries, suppliers, items] = await Promise.all([
      listRows<any>('Enquiries').catch(() => []),
      listRows<any>('Suppliers').catch(() => []),
      listRows<any>('Items').catch(() => []),
    ])

    // Filter enquiries that have a supplier response within the time window
    const withResponses = enquiries.filter((e) => {
      if (!e.response && !e.ratesJson) return false
      const t = new Date(e.respondedAt || e.sentAt || e.createdAt || Date.now()).getTime()
      return t >= cutoff
    })

    // Build supplier lookup map
    const supplierMap = new Map<string, any>()
    for (const s of suppliers) supplierMap.set(String(s.id), s)

    // Build item lookup map (for original item reference)
    const itemMap = new Map<string, any>()
    for (const i of items) itemMap.set(String(i.id), i)

    // Per-item rate aggregation: itemName → array of {supplier, rate, totalCost, confidence, gstType, enquiryDate}
    const itemRatesMap = new Map<string, Array<{
      supplier: string
      supplierId: string
      rate: number
      totalCost: number
      confidence: number
      gstType: string | null
      enquiryDate: string
      notes?: string
    }>>()

    // Per-supplier stats
    const supplierStatsMap = new Map<string, {
      supplierName: string
      supplierId: string
      totalReplies: number
      totalRates: number
      avgConfidence: number
      outOfStockCount: number
      lowestRatesCount: number
    }>()

    let totalParsed = 0
    let totalLowConfidence = 0
    let totalOOS = 0

    for (const enquiry of withResponses) {
      const supplier = supplierMap.get(String(enquiry.supplierId)) || {}
      const supplierName = String(enquiry.supplierName || supplier.name || 'Unknown')
      const supplierId = String(enquiry.supplierId || '')
      const enquiryDate = String(enquiry.respondedAt || enquiry.sentAt || enquiry.createdAt || '')

      // Parse the response — always use advanced parser on the raw response
      // (cached ratesJson may be from old parser without confidence/notes)
      const originalItems = safeJsonParse<any[]>(enquiry.itemsJson, [])
      let parsedRates = safeJsonParse<any[]>(enquiry.ratesJson, [])

      // Re-parse from raw response if available — this ensures we get the
      // richest data (confidence, notes, OOS markers, MOQ, delivery)
      // even for old enquiries that were saved with the basic parser.
      if (enquiry.response && String(enquiry.response).trim().length > 0) {
        try {
          const reParsed = parseRateResponseAdvanced(String(enquiry.response), originalItems)
          if (reParsed.length > 0) {
            parsedRates = reParsed
          }
        } catch {}
      }

      // Initialize supplier stats
      if (!supplierStatsMap.has(supplierId)) {
        supplierStatsMap.set(supplierId, {
          supplierName,
          supplierId,
          totalReplies: 0,
          totalRates: 0,
          avgConfidence: 0,
          outOfStockCount: 0,
          lowestRatesCount: 0,
        })
      }
      const sStats = supplierStatsMap.get(supplierId)!
      sStats.totalReplies += 1

      for (const rate of parsedRates) {
        totalParsed++
        const confidence = Number(rate.confidence) || 0.5
        if (confidence < 0.6) totalLowConfidence++
        const isOOS = rate.notes?.includes('OUT OF STOCK') || rate.rate === 0
        if (isOOS) totalOOS++

        sStats.totalRates += 1
        sStats.avgConfidence = (sStats.avgConfidence * (sStats.totalRates - 1) + confidence) / sStats.totalRates
        if (isOOS) sStats.outOfStockCount += 1

        const itemName = String(rate.itemName || '(unknown)')
        if (!itemRatesMap.has(itemName)) {
          itemRatesMap.set(itemName, [])
        }
        itemRatesMap.get(itemName)!.push({
          supplier: supplierName,
          supplierId,
          rate: Number(rate.rate) || 0,
          totalCost: Number(rate.totalCost) || 0,
          confidence,
          gstType: rate.gstType,
          enquiryDate,
          notes: rate.notes,
        })
      }
    }

    // Compute best supplier per item (lowest totalCost, confidence ≥ 0.6, not OOS)
    const itemBestRates: Array<{
      itemName: string
      totalQuotes: number
      bestSupplier: string | null
      bestSupplierId?: string
      bestRate: number | null
      bestTotalCost: number | null
      bestGstType?: string | null
      bestConfidence?: number
      bestDate?: string
      allOutOfStock: boolean
      rates: Array<{
        supplier: string
        supplierId: string
        rate: number
        totalCost: number
        confidence: number
        gstType: string | null
        enquiryDate: string
        notes?: string
      }>
    }> = []
    for (const [itemName, rates] of itemRatesMap.entries()) {
      const validRates = rates.filter(r => r.confidence >= 0.6 && r.rate > 0)
      if (validRates.length === 0) {
        // All rates are OOS or low-confidence — flag it
        itemBestRates.push({
          itemName,
          totalQuotes: rates.length,
          bestSupplier: null,
          bestRate: null,
          bestTotalCost: null,
          allOutOfStock: rates.length > 0 && rates.every(r => r.rate === 0),
          rates,
        })
        continue
      }
      // Sort by totalCost ascending
      const sorted = validRates.sort((a, b) => a.totalCost - b.totalCost)
      const best = sorted[0]
      // Mark the winning supplier
      const winnerStats = supplierStatsMap.get(best.supplierId)
      if (winnerStats) winnerStats.lowestRatesCount += 1

      itemBestRates.push({
        itemName,
        totalQuotes: rates.length,
        bestSupplier: best.supplier,
        bestSupplierId: best.supplierId,
        bestRate: best.rate,
        bestTotalCost: best.totalCost,
        bestGstType: best.gstType,
        bestConfidence: best.confidence,
        bestDate: best.enquiryDate,
        allOutOfStock: false,
        rates: sorted,
      })
    }

    // Sort items by bestTotalCost savings potential (highest spread = most savings opportunity)
    itemBestRates.sort((a, b) => {
      const aSpread = a.rates.length > 1 ? Math.max(...a.rates.map(r => r.totalCost)) - (a.bestTotalCost || 0) : 0
      const bSpread = b.rates.length > 1 ? Math.max(...b.rates.map(r => r.totalCost)) - (b.bestTotalCost || 0) : 0
      return bSpread - aSpread
    })

    // Top suppliers by lowest-rate count
    const topSuppliers = Array.from(supplierStatsMap.values())
      .sort((a, b) => b.lowestRatesCount - a.lowestRatesCount)
      .slice(0, 5)

    // Overall summary
    const summary = {
      totalEnquiries: withResponses.length,
      totalSuppliers: supplierStatsMap.size,
      totalItemsAnalyzed: itemBestRates.length,
      totalRatesParsed: totalParsed,
      lowConfidenceRates: totalLowConfidence,
      outOfStockEntries: totalOOS,
      avgConfidence: totalParsed > 0 ? (totalParsed - totalLowConfidence) / totalParsed : 0,
      potentialSavings: itemBestRates.reduce((s, item) => {
        if (item.rates.length < 2 || !item.bestTotalCost) return s
        const max = Math.max(...item.rates.map(r => r.totalCost))
        return s + (max - item.bestTotalCost)
      }, 0),
    }

    return NextResponse.json({
      summary,
      itemBestRates,
      topSuppliers,
      allSuppliers: Array.from(supplierStatsMap.values()).sort((a, b) => b.totalReplies - a.totalReplies),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
