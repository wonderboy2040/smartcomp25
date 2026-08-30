import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'
import { generateAdvancedAnalytics } from '@/lib/super-intelligence'

/**
 * GET /api/ai/analytics
 *
 * v13 NEW: Advanced Analytics — RFM, Cohorts, Churn, LTV.
 *
 * Returns:
 *   - rfm: RFMSegment[] — per-customer score with segment + churnProbability + recommendedAction
 *   - cohorts: CohortRow[] — last 12 months of cohorts with retention by month
 *   - churnRate: % of customers with recencyDays > 60
 *   - avgCustomerLTV: weighted across all customers
 *   - repeatPurchaseRate: % with frequency >= 2
 *   - highRiskCustomers: top 20 customers at risk of churn
 *
 * Cache: 5 minutes (heavy aggregation).
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

    const analytics = generateAdvancedAnalytics(customers, invoices)

    return NextResponse.json(analytics, {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'X-RateLimit-Remaining': check.remaining.toString(),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
