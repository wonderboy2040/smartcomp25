import { NextRequest, NextResponse } from 'next/server'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'
import { getDb, isFirebaseConfigured } from '@/lib/firebase'

export const runtime = 'nodejs'
export const maxDuration = 60

let cachedBucket: any = null

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const PHOTO_TYPES = new Set(['before', 'after', 'damage', 'repair', 'other'])

function isSafeJobPath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.startsWith('jobs/') &&
    path.length <= 512 &&
    !path.includes('..') &&
    !path.includes('\\')
  )
}


/**
 * Returns the Cloud Storage bucket used by the same Firebase project as
 * Firestore.
 *
 * The Admin SDK's `storage()` helper only looks at the DEFAULT app, while
 * `getDb()` initializes the named `smartcomp` app. Calling `storage()` with
 * no app therefore throws "The default Firebase app does not exist" and
 * every job-photo upload failed. Resolve the named app explicitly instead.
 *
 * Bucket name: FIREBASE_STORAGE_BUCKET wins when set. Otherwise we probe the
 * two bucket names Firebase uses (`<project>.firebasestorage.app` for new
 * projects, `<project>.appspot.com` for older ones).
 */
async function getBucket() {
  if (cachedBucket) return cachedBucket

  const db = await getDb()
  if (!db) throw new Error('Firebase not configured')

  const adminApp = await import('firebase-admin/app')
  const apps = adminApp.getApps()
  const app = apps.find((a) => a.name === 'smartcomp') || apps[0]
  if (!app) throw new Error('Firebase app is not initialized')

  const { getStorage } = await import('firebase-admin/storage')
  const storage = getStorage(app)
  const projectId = app.options.projectId || process.env.FIREBASE_PROJECT_ID || ''
  const configuredBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim()

  const candidates = Array.from(new Set([
    configuredBucket,
    projectId ? `${projectId}.firebasestorage.app` : undefined,
    projectId ? `${projectId}.appspot.com` : undefined,
  ].filter(Boolean) as string[]))

  if (candidates.length === 0) {
    throw new Error('FIREBASE_STORAGE_BUCKET is not configured and the Firebase project ID is unknown')
  }

  if (configuredBucket) {
    cachedBucket = storage.bucket(configuredBucket)
    return cachedBucket
  }

  // Probe the common names once and cache the one that exists. This avoids
  // hard-coding the bucket suffix, which changed for projects created after
  // October 2024.
  for (const name of candidates) {
    try {
      const bucket = storage.bucket(name)
      const [exists] = await bucket.exists()
      if (exists) {
        cachedBucket = bucket
        return bucket
      }
    } catch {
      // Permission/network error on one candidate — try the next one.
    }
  }

  // Let the upload surface the real error from the most likely bucket.
  cachedBucket = storage.bucket(candidates[0])
  return cachedBucket
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
    const jobId = String(form.get('jobId') || '').trim()
    const type = String(form.get('type') || 'other').trim()

    if (!file) return NextResponse.json({ error: 'File is required' }, { status: 400 })
    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(jobId)) {
      return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 })
    }
    if (!PHOTO_TYPES.has(type)) {
      return NextResponse.json({ error: 'Invalid photo type' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })
    }

    const ext = PHOTO_EXTENSIONS[file.type]
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported format. Use JPG, PNG or WebP' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const filename = `jobs/${jobId}/${Date.now()}_${type}.${ext}`
    const contentType = file.type

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
    // The download URL only depends on the bucket name, not on
    // FIREBASE_PROJECT_ID — using the env var here used to leave job photos
    // with an empty URL whenever credentials came from the service-account
    // JSON or the desktop config file.
    const [token] = await gcsFile.getMetadata().then(m => [m[0].metadata.firebaseStorageDownloadTokens as string || '']).catch(() => [''])
    const downloadURL = token
      ? `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filename)}?alt=media&token=${token}`
      : ''

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
    if (!isSafeJobPath(path)) {
      return NextResponse.json({ error: 'A valid jobs/ path is required' }, { status: 400 })
    }

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

    if (!isSafeJobPath(path)) {
      return NextResponse.json({ error: 'A valid jobs/ path is required' }, { status: 400 })
    }

    if (download === '1') {
      const bucket = await getBucket()
      const [metadata] = await bucket.file(path).getMetadata()
      const token = metadata.metadata?.firebaseStorageDownloadTokens || ''
      const downloadURL = token
        ? `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
        : ''
      return NextResponse.json({ success: true, downloadURL })
    }

    return NextResponse.json({ success: true, path })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
