import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow } from '@/lib/sheets-client'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * Job Photos API
 * Upload and manage photos for service jobs
 */

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const body = await req.json()
    const { jobId, photos } = body

    if (!jobId) return NextResponse.json({ error: 'Job ID required' }, { status: 400 })
    if (!Array.isArray(photos)) return NextResponse.json({ error: 'Photos array required' }, { status: 400 })

    // Get job
    const job = await getRow<any>('Jobs', jobId)
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    // Update job with photos
    await updateRow('Jobs', jobId, {
      photosJson: JSON.stringify(photos),
      photoCount: photos.length,
      lastPhotoUploadedAt: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      photoCount: photos.length,
    }, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const jobId = url.searchParams.get('jobId')

    if (!jobId) return NextResponse.json({ error: 'Job ID required' }, { status: 400 })

    const job = await getRow<any>('Jobs', jobId)
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const photos = JSON.parse(job.photosJson || '[]')

    return NextResponse.json({
      photos,
      photoCount: photos.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
