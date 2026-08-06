import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, isConfigured } from '@/lib/sheets-client'
import { safeJsonParse } from '@/lib/utils'
import { generateTrackToken } from '@/lib/notifications'
import { apiLimiter, writeLimiter, getClientIp } from '@/lib/rate-limit'

const money = (value: any) => Math.round((Number(value) || 0) * 100) / 100

function jobLedger(j: any) {
  const total = money(Number(j?.finalAmount) || Number(j?.estimatedAmount) || 0)
  const advance = money(j?.advanceAmount)
  const paid = money(j?.paidAmount)
  const paidTotal = money(advance + paid)
  const balanceDue = money(Math.max(0, total - paidTotal))
  return { total, advance, paid, paidTotal, balanceDue }
}

function ageDays(createdAt: any) {
  const created = createdAt ? new Date(createdAt).getTime() : 0
  if (!created || Number.isNaN(created)) return 0
  return Math.max(0, Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)))
}

/**
 * GET /api/jobs — list all service jobs
 * Query: ?status=Pending ?engineer=xxx ?search=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    if (!isConfigured()) return NextResponse.json([])
    const url = new URL(req.url)
    const statusFilter = url.searchParams.get('status')
    const engineerFilter = url.searchParams.get('engineer')
    const search = url.searchParams.get('search')

    let jobs = await listRows<any>('Jobs')
    if (statusFilter) jobs = jobs.filter((j) => String(j.status) === statusFilter)
    if (engineerFilter) jobs = jobs.filter((j) => String(j.assignedEngineer || '') === engineerFilter)
    if (search) {
      const q = search.toLowerCase()
      jobs = jobs.filter((j) =>
        String(j?.jobId || '').toLowerCase().includes(q) ||
        String(j?.customerName || '').toLowerCase().includes(q) ||
        String(j?.customerMobile || '').includes(q) ||
        String(j?.brandModel || '').toLowerCase().includes(q) ||
        String(j?.deviceType || '').toLowerCase().includes(q) ||
        String(j?.serialNumber || '').toLowerCase().includes(q) ||
        String(j?.problemDesc || '').toLowerCase().includes(q)
      )
    }

    // Sort: newest first
    jobs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())

    // Defensive coercion + parse status history + build track URL
    const result = jobs.map((j) => {
      const ledger = jobLedger(j)
      const daysOpen = ageDays(j?.createdAt)
      const active = String(j?.status || 'Pending') === 'Pending' || String(j?.status || '') === 'In Progress'
      return {
        ...j,
        jobId: String(j?.jobId || ''),
        trackToken: String(j?.trackToken || ''),
        customerName: String(j?.customerName || ''),
        customerMobile: String(j?.customerMobile || ''),
        deviceType: String(j?.deviceType || ''),
        brandModel: String(j?.brandModel || ''),
        serialNumber: String(j?.serialNumber || ''),
        problemDesc: String(j?.problemDesc || ''),
        accessories: String(j?.accessories || ''),
        serviceType: String(j?.serviceType || 'InShop'),
        priority: String(j?.priority || 'Low'),
        status: String(j?.status || 'Pending'),
        estimatedAmount: money(j?.estimatedAmount),
        advanceAmount: money(j?.advanceAmount),
        finalAmount: money(j?.finalAmount),
        serviceCharge: money(j?.serviceCharge),
        paidAmount: money(j?.paidAmount),
        paymentMode: String(j?.paymentMode || ''),
        partsProfit: money(j?.partsProfit),
        serviceProfit: money(j?.serviceProfit),
        warrantyDays: Number(j?.warrantyDays) || 0,
        warrantyExpiry: j?.warrantyExpiry || '',
        diagnosisNotes: String(j?.diagnosisNotes || ''),
        feedbackRating: Number(j?.feedbackRating) || 0,
        feedbackComment: String(j?.feedbackComment || ''),
        feedbackAt: String(j?.feedbackAt || ''),
        partsUsed: safeJsonParse<any[]>(j?.partsUsedJson, []),
        statusHistory: safeJsonParse<any[]>(j?.statusHistoryJson, []),
        trackUrl: j?.trackToken ? `/track/${j.jobId}-${j.trackToken}` : '',
        ageDays: daysOpen,
        isOverdue: active && daysOpen >= 3,
        ...ledger,
      }
    })

    return NextResponse.json(result, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

/**
 * POST /api/jobs — create a new service job
 * Generates jobId like SC20260708001 (prefix + yyyymmdd + sequence)
 * Also generates an unguessable trackToken for public tracking URL.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const body = await req.json()

    const customerName = String(body?.customerName || '').trim()
    const customerMobile = String(body?.customerMobile || '').trim()
    const problemDesc = String(body?.problemDesc || '').trim()
    if (!customerName || !customerMobile || !problemDesc) {
      return NextResponse.json({ error: 'Customer name, mobile, and problem are required' }, { status: 400 })
    }

    // Generate job ID
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const dateStr = `${y}${m}${d}`

    const existing = await listRows<any>('Jobs')
    const todays = existing.filter((j) => String(j?.jobId || '').includes(dateStr))
    let maxSeq = 0
    for (const j of todays) {
      const numStr = String(j?.jobId || '').slice(-3)
      const n = parseInt(numStr, 10)
      if (!isNaN(n) && n > maxSeq) maxSeq = n
    }
    const seq = String(maxSeq + 1).padStart(3, '0')

    const jobId = `SC${dateStr}${seq}`
    const trackToken = generateTrackToken()

    // Initial status history
    const statusHistory = [{
      status: 'Pending',
      timestamp: now.toISOString(),
      note: 'Job created',
    }]

    const advanceAmount = money(body?.advanceAmount)
    const job = await createRow('Jobs', {
      jobId,
      trackToken,
      customerName,
      customerMobile,
      deviceType: String(body?.deviceType || 'Laptop'),
      brandModel: String(body?.brandModel || ''),
      serialNumber: String(body?.serialNumber || ''),
      problemDesc,
      accessories: String(body?.accessories || ''),
      serviceType: String(body?.serviceType || 'InShop'),
      priority: String(body?.priority || 'Low'),
      estimatedAmount: money(body?.estimatedAmount),
      advanceAmount,
      advanceMode: String(body?.advanceMode || ''),
      status: 'Pending',
      assignedEngineer: String(body?.assignedEngineer || ''),
      partsUsedJson: '[]',
      finalAmount: 0,
      serviceCharge: 0,
      paidAmount: 0,
      paymentMode: '',
      paymentType: '',
      partsProfit: 0,
      serviceProfit: 0,
      notes: String(body?.notes || ''),
      diagnosisNotes: '',
      warrantyDays: Number(body?.warrantyDays) || 30,
      warrantyExpiry: '',
      statusHistoryJson: JSON.stringify(statusHistory),
      completedDate: '',
      deliveredAt: '',
      feedbackRating: 0,
      feedbackComment: '',
      feedbackAt: '',
    })

    // If advance was paid, record a ServicePayment. The job's paidAmount field
    // intentionally excludes advanceAmount so invoice paid total = advance + paidAmount.
    if (advanceAmount > 0) {
      await createRow('ServicePayments', {
        jobId,
        customerName,
        amount: advanceAmount,
        mode: String(body?.advanceMode || 'Cash'),
        type: 'Advance',
        date: new Date().toISOString(),
        notes: 'Advance payment at job creation',
      }).catch(() => {})
    }

    return NextResponse.json({
      ...job,
      trackUrl: `/track/${jobId}-${trackToken}`,
      balanceDue: money(Math.max(0, (Number(body?.estimatedAmount) || 0) - advanceAmount)),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
