import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'

/**
 * GET /api/loyalty
 * Customer loyalty & repeat business metrics.
 *
 * For each customer computes:
 *   - totalInvoices, totalSpent, avgOrderValue
 *   - firstPurchaseDate, lastPurchaseDate
 *   - daysSinceLastVisit
 *   - lifetimeValue (LTV) = totalSpent
 *   - tier: 'VIP' (top 20% by LTV), 'Gold' (top 21-50%), 'Silver' (others), 'New' (first purchase <30d)
 *   - status: 'active' (<60d), 'inactive' (60-180d), 'churned' (>180d)
 *
 * Query: ?customerId=xxx for single-customer detail
 */
export async function GET(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }

    const url = new URL(req.url)
    const customerId = url.searchParams.get('customerId')

    const invoices = await listRows<any>('Invoices').catch(() => [])

    const now = Date.now()

    // Aggregate per customer
    const stats = new Map<string, {
      customerId: string
      customerName: string
      phone: string
      totalInvoices: number
      totalSpent: number
      firstPurchase: number
      lastPurchase: number
    }>()

    for (const inv of invoices) {
      const cid = String(inv.customerId || '')
      if (!cid) continue
      const amount = Number(inv.grandTotal) || 0
      const invDate = new Date(inv.date || inv.createdAt || Date.now()).getTime()

      const existing = stats.get(cid) || {
        customerId: cid,
        customerName: String(inv.customerName || inv.customer?.name || ''),
        phone: String(inv.customerPhone || inv.customer?.phone || ''),
        totalInvoices: 0,
        totalSpent: 0,
        firstPurchase: invDate,
        lastPurchase: 0,
      }
      existing.totalInvoices += 1
      existing.totalSpent += amount
      existing.firstPurchase = Math.min(existing.firstPurchase, invDate)
      existing.lastPurchase = Math.max(existing.lastPurchase, invDate)
      existing.customerName = existing.customerName || String(inv.customerName || '')
      existing.phone = existing.phone || String(inv.customerPhone || '')
      stats.set(cid, existing)
    }

    const allStats = Array.from(stats.values())

    // Sort by totalSpent desc to assign tiers
    allStats.sort((a, b) => b.totalSpent - a.totalSpent)
    const total = allStats.length
    const vipCutoff = Math.ceil(total * 0.2)
    const goldCutoff = Math.ceil(total * 0.5)

    const enriched = allStats.map((s, idx) => {
      const daysSinceLastVisit = Math.floor((now - s.lastPurchase) / (1000 * 60 * 60 * 24))
      const daysSinceFirstPurchase = Math.floor((now - s.firstPurchase) / (1000 * 60 * 60 * 24))
      const avgOrderValue = s.totalInvoices > 0 ? s.totalSpent / s.totalInvoices : 0

      // Tier
      let tier: 'VIP' | 'Gold' | 'Silver' | 'New' = 'Silver'
      if (daysSinceFirstPurchase < 30 && s.totalInvoices === 1) tier = 'New'
      else if (idx < vipCutoff) tier = 'VIP'
      else if (idx < goldCutoff) tier = 'Gold'

      // Status
      let status: 'active' | 'inactive' | 'churned' = 'active'
      if (daysSinceLastVisit > 180) status = 'churned'
      else if (daysSinceLastVisit > 60) status = 'inactive'

      return {
        ...s,
        firstPurchase: new Date(s.firstPurchase).toISOString(),
        lastPurchase: new Date(s.lastPurchase).toISOString(),
        daysSinceLastVisit,
        daysSinceFirstPurchase,
        avgOrderValue: Number(avgOrderValue.toFixed(2)),
        lifetimeValue: s.totalSpent,
        tier,
        status,
      }
    })

    // If customerId specified, return single customer with recent invoices
    if (customerId) {
      const detail = enriched.find((e) => e.customerId === customerId)
      if (!detail) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      const recentInvoices = invoices
        .filter((inv) => String(inv.customerId || '') === customerId)
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
        .slice(0, 10)
        .map((inv) => ({
          id: inv.id,
          number: inv.number,
          date: inv.date,
          grandTotal: Number(inv.grandTotal) || 0,
          paymentStatus: inv.paymentStatus,
        }))
      return NextResponse.json({ customer: detail, recentInvoices })
    }

    // Summary aggregations
    const summary = {
      totalCustomers: enriched.length,
      vip: enriched.filter((e) => e.tier === 'VIP').length,
      gold: enriched.filter((e) => e.tier === 'Gold').length,
      silver: enriched.filter((e) => e.tier === 'Silver').length,
      newCustomers: enriched.filter((e) => e.tier === 'New').length,
      active: enriched.filter((e) => e.status === 'active').length,
      inactive: enriched.filter((e) => e.status === 'inactive').length,
      churned: enriched.filter((e) => e.status === 'churned').length,
      totalLTV: enriched.reduce((s, e) => s + e.lifetimeValue, 0),
      avgLTV: enriched.length > 0 ? enriched.reduce((s, e) => s + e.lifetimeValue, 0) / enriched.length : 0,
      // Win-back targets: customers who used to be VIP/Gold but are inactive/churned
      winbackTargets: enriched.filter((e) => (e.tier === 'VIP' || e.tier === 'Gold') && e.status !== 'active').length,
    }

    return NextResponse.json({ customers: enriched, summary })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
