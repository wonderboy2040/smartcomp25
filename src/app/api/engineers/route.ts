import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, isConfigured } from '@/lib/sheets-client'
import { apiLimiter, writeLimiter, getClientIp } from '@/lib/rate-limit'

const money = (v: any) => Math.round((Number(v) || 0) * 100) / 100

/**
 * GET /api/engineers
 *
 * Returns the list of engineers WITH computed financial summary:
 *   - jobsAssigned        — count of service jobs assigned to this engineer
 *   - jobsCompleted      — count of those that reached 'Completed' or 'Delivered'
 *   - serviceRevenue      — sum of serviceCharge across completed jobs
 *   - partsSoldRevenue    — sum of (sellPrice * qty) across parts on completed jobs
 *   - partsCost           — sum of (costPrice * qty) across the same parts
 *   - partsProfit         — partsSoldRevenue - partsCost
 *   - serviceProfit       — sum of serviceProfit on completed jobs ( = serviceCharge )
 *   - grossProfit         — serviceProfit + partsProfit
 *   - commissionEarned    — computed per the engineer's commissionRate (% of gross profit)
 *   - commissionPaid      — sum of commission payments already made (from ServicePayments)
 *   - commissionDue       — commissionEarned - commissionPaid
 *   - itemsSold          — count of invoice line items this engineer sold (linked via engineerId on invoice)
 *   - itemsSoldRevenue    — sum of line amounts this engineer sold
 *
 * This is a READ-ONLY aggregation — no writes happen here.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    if (!isConfigured()) return NextResponse.json([])

    // Run all reads in parallel — Firestore reads are <100ms each, so the
    // total latency is the slowest read, not the sum.
    const [engineers, jobs, servicePayments, invoices] = await Promise.all([
      listRows<any>('Engineers').catch(() => [] as any[]),
      listRows<any>('Jobs').catch(() => [] as any[]),
      listRows<any>('ServicePayments').catch(() => [] as any[]),
      listRows<any>('Invoices').catch(() => [] as any[]),
    ])

    // Pre-aggregate ServicePayments by engineerId (commission payments)
    const commissionPaidByEng = new Map<string, number>()
    for (const p of servicePayments) {
      const engId = String(p?.engineerId || '')
      if (!engId) continue
      if (String(p?.type || '').toLowerCase() !== 'commission') continue
      commissionPaidByEng.set(engId, money((commissionPaidByEng.get(engId) || 0) + Number(p?.amount || 0)))
    }

    // Pre-aggregate Jobs by assignedEngineer (engineer name on legacy rows,
    // engineerId on v4 rows). We use BOTH because the panel allowed free-text
    // engineer names before this update — those rows won't have engineerId.
    //
    // v12.6 FIX: Previously a job with BOTH `engineerId` and a legacy
    // `assignedEngineer` name could be double-counted (counted for engineer A
    // via engineerId AND for engineer B via name match). Now we track jobs
    // by engineerId only when present; legacy name matching applies only to
    // rows with no engineerId (so old jobs still get attributed correctly).
    const jobsByEngId = new Map<string, any[]>()
    const jobsByEngName = new Map<string, any[]>()
    for (const job of jobs) {
      const engId = String(job?.engineerId || '')
      const engName = String(job?.assignedEngineer || '').trim().toLowerCase()
      if (engId) {
        if (!jobsByEngId.has(engId)) jobsByEngId.set(engId, [])
        jobsByEngId.get(engId)!.push(job)
        // v12.6: Don't ALSO add to jobsByEngName — that was the double-count bug.
        continue
      }
      // Only fall back to legacy name matching for rows WITHOUT an engineerId.
      if (engName) {
        if (!jobsByEngName.has(engName)) jobsByEngName.set(engName, [])
        jobsByEngName.get(engName)!.push(job)
      }
    }

    const result = engineers.map((eng: any) => {
      const engId = String(eng?.id || '')
      const engNameLower = String(eng?.name || '').trim().toLowerCase()

      // Match jobs by engineerId OR by legacy name match (case-insensitive).
      const seenJobIds = new Set<string>()
      const engJobs: any[] = []
      const pushJob = (j: any) => {
        const jid = String(j?.id || j?.jobId || '')
        if (jid && !seenJobIds.has(jid)) {
          seenJobIds.add(jid)
          engJobs.push(j)
        }
      }
      ;(jobsByEngId.get(engId) || []).forEach(pushJob)
      ;(jobsByEngName.get(engNameLower) || []).forEach(pushJob)

      const jobsAssigned = engJobs.length
      const completedJobs = engJobs.filter((j) => String(j?.status) === 'Completed' || String(j?.status) === 'Delivered')
      const jobsCompleted = completedJobs.length

      let serviceRevenue = 0
      let serviceProfit = 0
      let partsSoldRevenue = 0
      let partsCost = 0

      for (const job of completedJobs) {
        const svc = money(job?.serviceCharge)
        serviceRevenue += svc
        serviceProfit += money(job?.serviceProfit ?? svc) // serviceProfit is the same as serviceCharge for jobs
        // Parse partsUsedJson for parts revenue + cost
        try {
          const parts = JSON.parse(String(job?.partsUsedJson || job?.partsUsed || '[]'))
          if (Array.isArray(parts)) {
            for (const p of parts) {
              const qty = Number(p?.qty || 1)
              const sell = Number(p?.sellPrice ?? (p?.price || 0))
              const cost = Number(p?.costPrice || 0)
              partsSoldRevenue += sell * qty
              partsCost += cost * qty
            }
          }
        } catch {}
      }

      const partsProfit = money(partsSoldRevenue - partsCost)
      const grossProfit = money(serviceProfit + partsProfit)

      // Commission — engineer's commissionRate is a percentage (0-100) of
      // gross profit. Default 0 if not set on the engineer row.
      // v12.6 FIX: Clamp to 0 when grossProfit is negative (parts cost exceeds
      // service revenue). Without this the UI showed "Earned: -Rs.400" which
      // looked like a bug. The engineer simply earns 0 commission on loss jobs.
      const commissionRate = Math.max(0, Math.min(100, Number(eng?.commissionRate) || 0))
      const commissionEarned = money(Math.max(0, (grossProfit * commissionRate) / 100))
      const commissionPaid = money(commissionPaidByEng.get(engId) || 0)
      const commissionDue = money(Math.max(0, commissionEarned - commissionPaid))

      // Items sold by this engineer (invoice line items linked via engineerId
      // on the invoice row).
      const engInvoices = invoices.filter((inv: any) => String(inv?.engineerId || '') === engId)
      let itemsSold = 0
      let itemsSoldRevenue = 0
      for (const inv of engInvoices) {
        try {
          const items = JSON.parse(String(inv?.itemsJson || '[]'))
          if (Array.isArray(items)) {
            for (const it of items) {
              itemsSold += Number(it?.quantity || 0)
              itemsSoldRevenue += (Number(it?.amount) || Number(it?.rate || 0) * Number(it?.quantity || 0))
            }
          }
        } catch {}
      }

      return {
        ...eng,
        name: String(eng?.name || ''),
        phone: String(eng?.phone || ''),
        email: String(eng?.email || ''),
        specialization: String(eng?.specialization || ''),
        commissionRate,
        active: eng?.active !== false && eng?.active !== 'false',
        joinedAt: eng?.joinedAt || eng?.createdAt || '',
        // Financial summary (read-only computed fields)
        jobsAssigned,
        jobsCompleted,
        serviceRevenue: money(serviceRevenue),
        serviceProfit: money(serviceProfit),
        partsSoldRevenue: money(partsSoldRevenue),
        partsCost: money(partsCost),
        partsProfit,
        grossProfit,
        commissionEarned,
        commissionPaid,
        commissionDue,
        itemsSold,
        itemsSoldRevenue: money(itemsSoldRevenue),
      }
    })

    return NextResponse.json(result, {
      headers: { 'X-Total-Count': result.length.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

/**
 * POST /api/engineers — create a new engineer.
 * Body: { name, phone, email?, specialization?, commissionRate?, active?, salaryMonthly? }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    if (!isConfigured()) return NextResponse.json({ error: 'Not configured' }, { status: 400 })

    const body = await req.json()
    const name = String(body?.name || '').trim()
    const phone = String(body?.phone || '').trim()
    if (!name) return NextResponse.json({ error: 'Engineer name is required' }, { status: 400 })
    if (!phone) return NextResponse.json({ error: 'Engineer phone is required' }, { status: 400 })

    const engineer = await createRow('Engineers', {
      name,
      phone,
      email: String(body?.email || '').trim(),
      specialization: String(body?.specialization || '').trim(),
      commissionRate: Math.max(0, Math.min(100, Number(body?.commissionRate) || 0)),
      salaryMonthly: Math.max(0, Number(body?.salaryMonthly) || 0),
      active: body?.active !== false,
      joinedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json(engineer)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
