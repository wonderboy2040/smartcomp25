import { NextRequest, NextResponse } from 'next/server'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'
import { getDb, isFirebaseConfigured } from '@/lib/firebase'

export const runtime = 'nodejs'
export const maxDuration = 60

async function getBucket() {
  const db = await getDb()
  if (!db) throw new Error('Firebase not configured')
  const admin = await import('firebase-admin')
  const storage = admin.storage()

  // Reuse the same named app that firebase.ts initializes, or fall back
  // to the default app. This avoids "already exists" errors on warm restarts.
  const appName = 'smartcomp'
  let app: any
  try {
    const existing = (admin.apps || []).find((a: any) => a.name === appName)
    app = existing || admin.initializeApp({ credential: admin.cert((await getDb()) ? undefined : undefined) }, appName)
  } catch {
    app = admin.app()
  }

  try {
    return storage.bucket({ app })
  } catch {
    return storage.bucket()
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    if (!isFirebaseConfigured()) {
      return NextResponse.json({ error: 'Firebase not configured' }, { status: 400 })
    }

    const form = await req.formData()
    const file = form.get('file') as File | null
    const jobId = String(form.get('jobId') || '')
    const type = String(form.get('type') || 'other')

    if (!file) return NextResponse.json({ error: 'File is required' }, { status: 400 })
    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const ext = file.name.split('.').pop() || 'jpg'
    const filename = `jobs/${jobId}/${Date.now()}_${type}.${ext}`
    const contentType = file.type || 'image/jpeg'

    const bucket = await getBucket()
    const gcsFile = bucket.file(filename)
    await gcsFile.save(buffer, {
      contentType,
      metadata: {
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        },
      },
    })

    // Construct a direct download URL. Admin uploads need a token.
    const [token] = await gcsFile.getMetadata().then(m => [m[0].metadata.firebaseStorageDownloadTokens as string || '']).catch(() => [''])
    const projectId = process.env.FIREBASE_PROJECT_ID
    let downloadURL = ''
    if (projectId && token) {
      downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filename)}?alt=media&token=${token}`
    }

    return NextResponse.json({
      success: true,
      path: filename,
      downloadURL,
      sizeBytes: buffer.length,
      contentType,
    }, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { path } = body || {}
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 })

    const bucket = await getBucket()
    await bucket.file(path).delete()
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const path = url.searchParams.get('path')
    const download = url.searchParams.get('download')

    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 })

    if (download === '1') {
      const bucket = await getBucket()
      const [metadata] = await bucket.file(path).getMetadata()
      const token = metadata.metadata?.firebaseStorageDownloadTokens || ''
      const projectId = process.env.FIREBASE_PROJECT_ID
      const downloadURL = projectId ? `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}` : ''
      return NextResponse.json({ success: true, downloadURL })
    }

    return NextResponse.json({ success: true, path })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
