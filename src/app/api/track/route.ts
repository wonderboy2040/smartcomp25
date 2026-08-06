import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { safeJsonParse } from '@/lib/utils'

/**
 * GET /api/track?job=SC20260708001&token=abc123
 * Public endpoint (no PIN) — returns job status for customer tracking page.
 * Uses unguessable token to prevent enumeration.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const jobId = url.searchParams.get('job')
    const token = url.searchParams.get('token')

    if (!jobId || !token) {
      return NextResponse.json({ error: 'Invalid tracking link' }, { status: 400 })
    }

    const jobs = await listRows<any>('Jobs')
    const job = jobs.find((j) => String(j.jobId) === String(jobId))

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Verify track token (constant-time compare)
    const expectedToken = String(job.trackToken || '')
    if (expectedToken.length !== token.length) {
      return NextResponse.json({ error: 'Invalid tracking link' }, { status: 403 })
    }
    let diff = 0
    for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expectedToken.charCodeAt(i)
    if (diff !== 0) {
      return NextResponse.json({ error: 'Invalid tracking link' }, { status: 403 })
    }

    // Get shop info for contact details
    const shops = await listRows<any>('Shop', { useCache: true })
    const shop = shops[0] || {}

    // Return only safe fields (no internal IDs, no profit/financial details beyond final amount)
    return NextResponse.json({
      job: {
        jobId: String(job.jobId || ''),
        customerName: String(job.customerName || ''),
        deviceType: String(job.deviceType || ''),
        brandModel: String(job.brandModel || ''),
        problemDesc: String(job.problemDesc || ''),
        status: String(job.status || 'Pending'),
        estimatedAmount: Number(job.estimatedAmount) || 0,
        finalAmount: Number(job.finalAmount) || 0,
        warrantyDays: Number(job.warrantyDays) || 0,
        warrantyExpiry: job.warrantyExpiry || '',
        createdAt: job.createdAt || '',
        deliveredAt: job.deliveredAt || '',
        diagnosisNotes: String(job.diagnosisNotes || ''),
        statusHistory: safeJsonParse<any[]>(job.statusHistoryJson, []),
        feedbackRating: Number(job.feedbackRating) || 0,
        feedbackComment: String(job.feedbackComment || ''),
        feedbackAt: job.feedbackAt || '',
      },
      shop: {
        name: String(shop.name || 'Smart Computers'),
        phone: String(shop.phone || ''),
        email: String(shop.email || ''),
        address: String(shop.address || ''),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
