import { NextRequest, NextResponse } from 'next/server'
import { listRows, getRow } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/engineers/[id]/performance?weeks=8
 *
 * v13 NEW: Engineer Performance Dashboard data.
 *
 * Returns per-engineer trend data for charts:
 *   - weeklyJobsCompleted: [{ week: 'W1', startDate, jobsCompleted, profit }]
 *   - resolutionTimeBuckets: [{ bucket: '0-2d', count }, { bucket: '2-5d', count }, ...]
 *   - statusBreakdown: [{ status: 'Completed', count }, ...]
 *   - customerSatisfaction: { avgRating, totalReviews } (from ServicePayments feedback)
 *   - topJobsByProfit: top 5 jobs by profit
 *   - commissionTrend: [{ week, earned, paid }]
 *   - summaryStats: { totalJobs, completedJobs, avgResolutionDays, totalProfit, completionRate }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const { id } = await params
    const url = new URL(req.url)
    const weeks = Math.min(Math.max(parseInt(url.searchParams.get('weeks') || '8'), 1), 52)

    const engineer = await getRow<any>('Engineers', id).catch(() => null)
    if (!engineer) return NextResponse.json({ error: 'Engineer not found' }, { status: 404 })

    const [jobs, servicePayments, invoices] = await Promise.all([
      listRows<any>('Jobs').catch(() => []),
      listRows<any>('ServicePayments').catch(() => []),
      listRows<any>('Invoices').catch(() => []),
    ])

    // Filter this engineer's jobs (by engineerId OR legacy assignedEngineer name)
    const engName = String(engineer.name || '').trim().toLowerCase()
    const myJobs = jobs.filter((j: any) => {
      if (String(j?.engineerId || '') === id) return true
      if (!j?.engineerId && String(j?.assignedEngineer || '').trim().toLowerCase() === engName) return true
      return false
    })

    // === Summary stats ===
    const totalJobs = myJobs.length
    const completedJobs = myJobs.filter((j: any) => ['Completed', 'Delivered'].includes(String(j?.status || '')))
    const completionRate = totalJobs > 0 ? (completedJobs.length / totalJobs) * 100 : 0

    // Resolution time = completedDate - createdAt (days)
    const resolutionTimes = completedJobs.map((j: any) => {
      const start = new Date(j?.createdAt || j?.date || 0).getTime()
      const end = new Date(j?.completedDate || j?.updatedAt || 0).getTime()
      if (!start || !end || end < start) return null
      return (end - start) / (24 * 60 * 60 * 1000)
    }).filter((d: any) => d !== null && d >= 0) as number[]
    const avgResolutionDays = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a: number, b: number) => a + b, 0) / resolutionTimes.length
      : 0

    // Profit (service charge + parts)
    const totalProfit = completedJobs.reduce((sum: number, j: any) => {
      const svc = Number(j?.finalAmount || j?.serviceCharge || 0)
      return sum + svc
    }, 0)

    // === Weekly jobs completed (last N weeks) ===
    const now = new Date()
    const weekMs = 7 * 24 * 60 * 60 * 1000
    const weeklyJobs: any[] = []
    for (let w = weeks - 1; w >= 0; w--) {
      const weekEnd = new Date(now.getTime() - w * weekMs)
      const weekStart = new Date(weekEnd.getTime() - weekMs)
      const weekJobs = completedJobs.filter((j: any) => {
        const d = new Date(j?.completedDate || j?.updatedAt || 0)
        return d >= weekStart && d < weekEnd
      })
      const weekProfit = weekJobs.reduce((s: number, j: any) => s + Number(j?.finalAmount || j?.serviceCharge || 0), 0)
      weeklyJobs.push({
        week: `W${weeks - w}`,
        startDate: weekStart.toISOString().slice(0, 10),
        endDate: weekEnd.toISOString().slice(0, 10),
        jobsCompleted: weekJobs.length,
        profit: Math.round(weekProfit * 100) / 100,
      })
    }

    // === Resolution time buckets ===
    const resolutionTimeBuckets = [
      { bucket: '0-2d', count: 0 },
      { bucket: '2-5d', count: 0 },
      { bucket: '5-10d', count: 0 },
      { bucket: '10-30d', count: 0 },
      { bucket: '30d+', count: 0 },
    ]
    for (const d of resolutionTimes) {
      if (d <= 2) resolutionTimeBuckets[0].count++
      else if (d <= 5) resolutionTimeBuckets[1].count++
      else if (d <= 10) resolutionTimeBuckets[2].count++
      else if (d <= 30) resolutionTimeBuckets[3].count++
      else resolutionTimeBuckets[4].count++
    }

    // === Status breakdown ===
    const statusCounts = new Map<string, number>()
    for (const j of myJobs) {
      const s = String(j?.status || 'Unknown')
      statusCounts.set(s, (statusCounts.get(s) || 0) + 1)
    }
    const statusBreakdown = Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count }))

    // === Top jobs by profit ===
    const topJobsByProfit = [...completedJobs]
      .map((j: any) => ({
        id: String(j?.jobId || j?.id || ''),
        customerName: String(j?.customerName || ''),
        deviceType: String(j?.deviceType || ''),
        brandModel: String(j?.brandModel || ''),
        profit: Number(j?.finalAmount || j?.serviceCharge || 0),
        completedDate: j?.completedDate || j?.updatedAt || '',
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5)

    // === Commission trend (last N weeks) ===
    const myCommissionPayments = servicePayments.filter((p: any) =>
      String(p?.engineerId || '') === id ||
      (!p?.engineerId && String(p?.engineerName || '').trim().toLowerCase() === engName)
    )
    const commissionTrend = weeklyJobs.map((w) => {
      const weekStart = new Date(w.startDate).getTime()
      const weekEnd = new Date(w.endDate).getTime()
      const paid = myCommissionPayments
        .filter((p: any) => {
          const d = new Date(p?.date || p?.createdAt || 0).getTime()
          return d >= weekStart && d < weekEnd
        })
        .reduce((s: number, p: any) => s + Number(p?.amount || 0), 0)
      const rate = Number(engineer.commissionRate) || 0
      return {
        week: w.week,
        earned: Math.round((w.profit * rate / 100) * 100) / 100,
        paid: Math.round(paid * 100) / 100,
      }
    })

    // === Customer satisfaction (from ServicePayments feedback if present) ===
    const myJobIds = new Set(myJobs.map((j: any) => String(j?.jobId || j?.id || '')))
    const feedbackPayments = servicePayments.filter((p: any) =>
      myJobIds.has(String(p?.jobId || '')) && p?.customerRating
    )
    const totalReviews = feedbackPayments.length
    const avgRating = totalReviews > 0
      ? feedbackPayments.reduce((s: number, p: any) => s + Number(p?.customerRating || 0), 0) / totalReviews
      : 0

    // === Items sold via invoices ===
    const myInvoices = invoices.filter((i: any) => String(i?.engineerId || '') === id)
    const itemsSoldCount = myInvoices.reduce((s: number, inv: any) => {
      try {
        const items = JSON.parse(inv?.itemsJson || '[]')
        return s + items.length
      } catch {
        return s
      }
    }, 0)
    const itemsSoldRevenue = myInvoices.reduce((s: number, inv: any) => s + Number(inv?.grandTotal || 0), 0)

    return NextResponse.json({
      engineerId: id,
      engineerName: String(engineer.name || ''),
      summaryStats: {
        totalJobs,
        completedJobs: completedJobs.length,
        completionRate: Math.round(completionRate * 100) / 100,
        avgResolutionDays: Math.round(avgResolutionDays * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        totalReviews,
        avgRating: Math.round(avgRating * 100) / 100,
        itemsSoldCount,
        itemsSoldRevenue: Math.round(itemsSoldRevenue * 100) / 100,
        commissionRate: Number(engineer.commissionRate) || 0,
      },
      weeklyJobsCompleted: weeklyJobs,
      resolutionTimeBuckets,
      statusBreakdown,
      topJobsByProfit,
      commissionTrend,
    }, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
