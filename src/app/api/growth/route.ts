import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'
import { BUSINESS_GROWTH } from '@/lib/business-growth'

/**
 * GET /api/growth
 * Business Growth Superintelligence — consolidated dashboard.
 *
 * Aggregates data from all the growth features into one response:
 *   - Customer growth (new this month, repeat rate)
 *   - Revenue growth (this month vs last)
 *   - Loyalty distribution (VIP/Gold/Silver/New)
 *   - Overdue + win-back opportunities
 *   - Review request targets (delivered customers who haven't been asked)
 *   - Suggested actions (actionable insights)
 */
export async function GET(_req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
    const endOfLastMonth = startOfMonth

    const [invoices, customers, jobs, shopRows] = await Promise.all([
      listRows<any>('Invoices').catch(() => []),
      listRows<any>('Customers').catch(() => []),
      listRows<any>('Jobs').catch(() => []),
      listRows<any>('Shop').catch(() => []),
    ])

    const shop = shopRows[0] || {}
    const shopName = shop.name || 'Smart Computers'

    // ===== Revenue this month vs last month =====
    const thisMonthInv = invoices.filter((i) => {
      const t = new Date(i.date || i.createdAt || 0).getTime()
      return t >= startOfMonth
    })
    const lastMonthInv = invoices.filter((i) => {
      const t = new Date(i.date || i.createdAt || 0).getTime()
      return t >= startOfLastMonth && t < endOfLastMonth
    })
    const thisMonthRevenue = thisMonthInv.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const lastMonthRevenue = lastMonthInv.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const revenueGrowthPct = lastMonthRevenue > 0
      ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : thisMonthRevenue > 0 ? 100 : 0

    // ===== Customer growth =====
    const newCustomersThisMonth = customers.filter((c) => {
      const t = new Date(c.createdAt || c.date || 0).getTime()
      return t >= startOfMonth
    }).length

    // Repeat customer rate: customers with >1 invoice
    const customerInvoiceCount = new Map<string, number>()
    for (const inv of invoices) {
      const cid = String(inv.customerId || '')
      if (cid) customerInvoiceCount.set(cid, (customerInvoiceCount.get(cid) || 0) + 1)
    }
    const repeatCustomers = Array.from(customerInvoiceCount.values()).filter((c) => c > 1).length
    const totalActiveCustomers = customerInvoiceCount.size
    const repeatRate = totalActiveCustomers > 0 ? (repeatCustomers / totalActiveCustomers) * 100 : 0

    // ===== Loyalty distribution =====
    const customerSpend = new Map<string, number>()
    for (const inv of invoices) {
      const cid = String(inv.customerId || '')
      if (cid) customerSpend.set(cid, (customerSpend.get(cid) || 0) + (Number(inv.grandTotal) || 0))
    }
    const spends = Array.from(customerSpend.entries()).sort((a, b) => b[1] - a[1])
    const vipCount = Math.ceil(spends.length * 0.2)
    const goldCount = Math.ceil(spends.length * 0.3)

    // ===== Win-back targets =====
    const nowMs = now.getTime()
    const winbackTargets = customers.filter((c) => {
      // Find last invoice for this customer
      const lastInv = invoices
        .filter((i) => String(i.customerId || '') === String(c.id))
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0]
      if (!lastInv) return false
      const ageDays = Math.floor((nowMs - new Date(lastInv.date || 0).getTime()) / (1000 * 60 * 60 * 24))
      return ageDays > 60 && ageDays < 365 // inactive but not totally lost
    })

    // ===== Review request targets (delivered jobs without review sent) =====
    const deliveredJobs = jobs.filter((j) => j.status === 'Delivered' || j.status === 'Completed')
    const reviewTargets = deliveredJobs.filter((j) => {
      // Heuristic: jobs delivered in last 7 days, no reviewSent flag
      const t = new Date(j.deliveredAt || j.completedDate || 0).getTime()
      const ageDays = Math.floor((nowMs - t) / (1000 * 60 * 60 * 24))
      return ageDays >= 0 && ageDays <= 7 && !j.reviewSent
    })

    // ===== Suggested actions =====
    const overdueCount = invoices.filter((i) => {
      if (String(i.paymentStatus || '').toLowerCase() === 'paid') return false
      const ageDays = Math.floor((nowMs - new Date(i.date || 0).getTime()) / (1000 * 60 * 60 * 24))
      return ageDays > 30
    }).length

    const actions: Array<{ priority: 'high' | 'medium' | 'low'; title: string; description: string; cta?: string }> = []
    if (overdueCount > 0) {
      actions.push({
        priority: 'high',
        title: `Send payment reminders to ${overdueCount} overdue customer(s)`,
        description: 'Invoices past 30 days. Auto-generate WhatsApp reminders with UPI link.',
        cta: 'reminders',
      })
    }
    if (reviewTargets.length > 0) {
      actions.push({
        priority: 'high',
        title: `Request Google reviews from ${reviewTargets.length} recent customer(s)`,
        description: 'Customers whose jobs were just delivered — best time to ask for a review.',
        cta: 'reviews',
      })
    }
    if (winbackTargets.length > 0) {
      actions.push({
        priority: 'medium',
        title: `Run win-back campaign for ${winbackTargets.length} inactive customer(s)`,
        description: 'Customers who haven\'t visited in 60+ days. Send them a 15% OFF offer.',
        cta: 'winback',
      })
    }
    if (revenueGrowthPct < 0) {
      actions.push({
        priority: 'high',
        title: `Revenue is down ${Math.abs(revenueGrowthPct).toFixed(1)}% vs last month`,
        description: 'Run a new-customer acquisition campaign or repeat-customer offer.',
        cta: 'campaigns',
      })
    }
    if (repeatRate < 30 && totalActiveCustomers > 10) {
      actions.push({
        priority: 'medium',
        title: `Repeat customer rate is low (${repeatRate.toFixed(1)}%)`,
        description: 'Launch a loyalty / referral program to convert one-time buyers into repeat customers.',
        cta: 'referral',
      })
    }
    if (actions.length === 0) {
      actions.push({
        priority: 'low',
        title: 'All metrics healthy 🎉',
        description: 'No urgent actions needed. Keep up the great work!',
      })
    }

    return NextResponse.json({
      shopName,
      googleReviewUrl: BUSINESS_GROWTH.googleReviewUrl,
      revenue: {
        thisMonth: Number(thisMonthRevenue.toFixed(2)),
        lastMonth: Number(lastMonthRevenue.toFixed(2)),
        growthPct: Number(revenueGrowthPct.toFixed(1)),
        invoicesThisMonth: thisMonthInv.length,
      },
      customers: {
        newThisMonth: newCustomersThisMonth,
        totalActive: totalActiveCustomers,
        repeatCustomers,
        repeatRate: Number(repeatRate.toFixed(1)),
        vipCount,
        goldCount,
        silverCount: Math.max(0, totalActiveCustomers - vipCount - goldCount),
      },
      opportunities: {
        winbackTargets: winbackTargets.length,
        reviewTargets: reviewTargets.length,
        overdueCount,
      },
      actions,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
