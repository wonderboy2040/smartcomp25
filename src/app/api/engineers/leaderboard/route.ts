import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/engineers/leaderboard
 *
 * v13 NEW: Returns all engineers ranked by profit (for leaderboard UI).
 * Lightweight — returns only the fields needed for ranking + display.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    if (!isConfigured()) return NextResponse.json([])

    const [engineers, jobs, servicePayments] = await Promise.all([
      listRows<any>('Engineers').catch(() => []),
      listRows<any>('Jobs').catch(() => []),
      listRows<any>('ServicePayments').catch(() => []),
    ])

    // Build a map of engineerId → stats. Also handle legacy jobs that store
    // `assignedEngineer` (name string) instead of `engineerId` — these need
    // to be attributed back to the engineer by name match.
    const statsByEngId = new Map<string, { jobsAssigned: number; jobsCompleted: number; totalProfit: number }>()
    // Pre-index engineers by lowercase name so legacy job attribution is O(1).
    const engIdByName = new Map<string, string>()
    for (const e of engineers) {
      const name = String(e?.name || '').trim().toLowerCase()
      if (name) engIdByName.set(name, String(e.id || ''))
    }

    for (const j of jobs) {
      let engId = String(j?.engineerId || '')
      // v13.1 fix: legacy jobs store `assignedEngineer` (name) instead of
      // engineerId. Previously these were skipped, making engineers with
      // only legacy-assigned jobs rank 0. Now we attribute them by name.
      if (!engId && j?.assignedEngineer) {
        const name = String(j.assignedEngineer).trim().toLowerCase()
        engId = engIdByName.get(name) || ''
      }
      if (!engId) continue
      const cur = statsByEngId.get(engId) || { jobsAssigned: 0, jobsCompleted: 0, totalProfit: 0 }
      cur.jobsAssigned++
      if (['Completed', 'Delivered'].includes(String(j?.status || ''))) {
        cur.jobsCompleted++
        cur.totalProfit += Number(j?.finalAmount || j?.serviceCharge || 0)
      }
      statsByEngId.set(engId, cur)
    }

    const commissionPaidByEng = new Map<string, number>()
    for (const p of servicePayments) {
      let engId = String(p?.engineerId || '')
      // v13.1 fix: same legacy attribution for service payments
      if (!engId && p?.engineerName) {
        const name = String(p.engineerName).trim().toLowerCase()
        engId = engIdByName.get(name) || ''
      }
      if (!engId || String(p?.type || '').toLowerCase() !== 'commission') continue
      commissionPaidByEng.set(engId, (commissionPaidByEng.get(engId) || 0) + Number(p?.amount || 0))
    }

    const leaderboard = engineers
      .filter((e: any) => e.active !== false && e.active !== 'false')
      .map((e: any) => {
        const stats = statsByEngId.get(String(e.id || '')) || { jobsAssigned: 0, jobsCompleted: 0, totalProfit: 0 }
        const rate = Number(e.commissionRate) || 0
        const commissionEarned = (stats.totalProfit * rate) / 100
        const commissionPaid = commissionPaidByEng.get(String(e.id || '')) || 0
        return {
          id: String(e.id || ''),
          name: String(e.name || ''),
          phone: String(e.phone || ''),
          commissionRate: rate,
          jobsAssigned: stats.jobsAssigned,
          jobsCompleted: stats.jobsCompleted,
          completionRate: stats.jobsAssigned > 0 ? (stats.jobsCompleted / stats.jobsAssigned) * 100 : 0,
          totalProfit: Math.round(stats.totalProfit * 100) / 100,
          commissionEarned: Math.round(commissionEarned * 100) / 100,
          commissionPaid: Math.round(commissionPaid * 100) / 100,
          commissionDue: Math.round((commissionEarned - commissionPaid) * 100) / 100,
        }
      })
      .sort((a, b) => b.totalProfit - a.totalProfit)

    leaderboard.forEach((e, i) => {
      ;(e as any).rank = i + 1
    })

    return NextResponse.json(leaderboard, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
