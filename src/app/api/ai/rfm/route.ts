import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'
import { analyzeRFM } from '@/lib/super-intelligence'

/**
 * GET /api/ai/rfm
 *
 * v13 NEW: RFM (Recency, Frequency, Monetary) customer segmentation.
 *
 * Returns per-customer RFM scores (1-5 each, 111-555 combined) with
 * segment labels:
 *   Champions, Loyal, Potential Loyalists, New Customers, Promising,
 *   Need Attention, About to Sleep, At Risk, Cannot Lose Them,
 *   Hibernating, Lost
 *
 * Plus churnProbability, expectedLTV, and recommendedAction per customer.
 *
 * Cache: 5 minutes.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const [customers, invoices] = await Promise.all([
      listRows<any>('Customers').catch(() => []),
      listRows<any>('Invoices').catch(() => []),
    ])

    const rfm = analyzeRFM(customers, invoices)

    // Aggregate segment counts for chart
    const segmentCounts = new Map<string, number>()
    for (const r of rfm) {
      segmentCounts.set(r.segment, (segmentCounts.get(r.segment) || 0) + 1)
    }
    const segments = Array.from(segmentCounts.entries()).map(([segment, count]) => ({ segment, count }))

    return NextResponse.json({ rfm, segments, total: rfm.length }, {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'X-RateLimit-Remaining': check.remaining.toString(),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
