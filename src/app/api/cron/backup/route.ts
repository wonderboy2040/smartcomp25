import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/cron/backup  — Vercel cron format (no body, no auth header)
 * POST /api/cron/backup — Render cron format (Authorization: Bearer <secret>)
 *
 * Daily auto-backup trigger. Calls POST /api/backup internally with the
 * CRON_SECRET. The backup endpoint then exports all Firestore data and
 * uploads it to Google Drive (if GDRIVE_* env vars are set).
 *
 * Configured in:
 *   - vercel.json (for Vercel deploys — daily at 2am IST)
 *   - render.yaml (for Render deploys — daily at 2am IST via cron schedule)
 */
export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  return runBackup(req)
}

export async function POST(req: NextRequest) {
  return runBackup(req)
}

async function runBackup(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET not set on server' }, { status: 500 })
    }

    // Verify auth: either the Authorization Bearer header (Render) or
    // ?secret= query param (manual trigger from the Backup panel UI).
    const authHeader = req.headers.get('authorization') || ''
    const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const querySecret = new URL(req.url).searchParams.get('secret') || ''

    if (bearerSecret !== cronSecret && querySecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Call POST /api/backup internally.
    const baseUrl = new URL(req.url).origin
    const resp = await fetch(`${baseUrl}/api/backup`, {
      method: 'POST',
      headers: {
        'x-cron-secret': cronSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    const data = await resp.json()
    if (!resp.ok) {
      return NextResponse.json({ error: data.error || 'Backup failed' }, { status: resp.status })
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
