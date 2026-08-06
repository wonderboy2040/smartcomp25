import { NextRequest, NextResponse } from 'next/server'
import { listRows, updateRow, isConfigured } from '@/lib/sheets-client'
import { BUSINESS_GROWTH, buildReviewRequestLink } from '@/lib/business-growth'

/**
 * POST /api/reviews/request
 * Body: { jobId } or { customerId }
 *
 * Returns a wa.me link with the Google review request message pre-filled,
 * addressed to the customer of the given job/customer.
 *
 * Marks the job's `reviewSent` flag to true (so the Superintelligence growth
 * panel can track which customers have already been asked).
 */
export async function POST(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }
    const body = await req.json()
    const { jobId, customerId } = body

    let customerName = ''
    let customerPhone = ''

    if (jobId) {
      const jobs = await listRows<any>('Jobs')
      const job = jobs.find((j) => String(j.id) === String(jobId) || String(j.jobId) === String(jobId))
      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      customerName = String(job.customerName || '')
      customerPhone = String(job.customerMobile || job.customerPhone || '')
      // Mark as review-sent
      await updateRow('Jobs', job.id, { reviewSent: true, reviewSentAt: new Date().toISOString() }).catch(() => {})
    } else if (customerId) {
      const customers = await listRows<any>('Customers')
      const c = customers.find((c) => String(c.id) === String(customerId))
      if (!c) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      customerName = String(c.name || '')
      customerPhone = String(c.phone || c.mobile || '')
    } else {
      return NextResponse.json({ error: 'jobId or customerId required' }, { status: 400 })
    }

    const waUrl = buildReviewRequestLink(customerName, customerPhone)
    return NextResponse.json({
      success: true,
      waUrl,
      customerName,
      reviewUrl: BUSINESS_GROWTH.googleReviewUrl,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
