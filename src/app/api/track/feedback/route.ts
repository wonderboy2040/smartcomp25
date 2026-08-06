import { NextRequest, NextResponse } from 'next/server'
import { listRows, updateRow } from '@/lib/sheets-client'
import { safeTokenCompare } from '@/lib/share-tokens'

/**
 * POST /api/track/feedback
 * 
 * Public endpoint — allows customers to submit star rating + comment
 * for a completed/delivered service job.
 * 
 * Body: { jobId: string, token: string, rating: 1-5, comment?: string }
 * 
 * Stores: feedbackRating, feedbackComment, feedbackAt on the Jobs row.
 * Idempotent — re-submission updates existing feedback.
 */

// Simple rate limiter for feedback (prevent spam)
const feedbackLimiter = new Map<string, number>()
const FEEDBACK_COOLDOWN_MS = 30 * 1000 // 30 seconds between submissions

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { jobId, token, rating, comment } = body

    if (!jobId || !token) {
      return NextResponse.json({ error: 'Job ID and token are required' }, { status: 400 })
    }

    // Validate rating
    const ratingNum = Number(rating)
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 })
    }

    // Sanitize comment
    const sanitizedComment = String(comment || '')
      .trim()
      .slice(0, 500)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')

    // Rate limit check
    const rateLimitKey = `${jobId}:${token.slice(0, 6)}`
    const lastSubmit = feedbackLimiter.get(rateLimitKey) || 0
    if (Date.now() - lastSubmit < FEEDBACK_COOLDOWN_MS) {
      return NextResponse.json(
        { error: 'Please wait before submitting again' },
        { status: 429 }
      )
    }

    // Find the job
    const jobs = await listRows<any>('Jobs')
    const job = jobs.find((j) => String(j.jobId) === String(jobId))

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Verify track token
    const expectedToken = String(job.trackToken || '')
    if (!safeTokenCompare(token, expectedToken)) {
      return NextResponse.json({ error: 'Invalid tracking link' }, { status: 403 })
    }

    // Only allow feedback on Completed or Delivered jobs
    const status = String(job.status || '')
    if (status !== 'Completed' && status !== 'Delivered') {
      return NextResponse.json(
        { error: 'Feedback can only be submitted for completed jobs' },
        { status: 400 }
      )
    }

    // Update job with feedback
    await updateRow('Jobs', String(job.id), {
      feedbackRating: ratingNum,
      feedbackComment: sanitizedComment,
      feedbackAt: new Date().toISOString(),
    })

    // Update rate limiter
    feedbackLimiter.set(rateLimitKey, Date.now())

    // Cleanup old rate limit entries every 100 submissions
    if (feedbackLimiter.size > 200) {
      const cutoff = Date.now() - FEEDBACK_COOLDOWN_MS * 2
      for (const [key, ts] of feedbackLimiter.entries()) {
        if (ts < cutoff) feedbackLimiter.delete(key)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Thank you for your feedback!',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to submit feedback' }, { status: 500 })
  }
}
