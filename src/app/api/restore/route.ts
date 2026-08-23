import { NextRequest, NextResponse } from 'next/server'
import { restoreAllData, isConfigured } from '@/lib/sheets-client'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * POST /api/restore
 *
 * Restore data from a backup JSON. Body:
 *   {
 *     backup: <JSON backup object>,    // the full backup object
 *     mode: 'merge' | 'overwrite'      // optional, default 'merge'
 *   }
 *
 * Flow:
 *   1. Validate the backup format (must have `sheets` field).
 *   2. Run restoreAllData(backup, mode) — batched writes to Firestore.
 *   3. Return a summary of inserted / skipped / overwritten counts.
 *
 * Mode semantics:
 *   - 'merge' (default): only inserts rows whose id doesn't already exist.
 *     Safe — never overwrites newer data.
 *   - 'overwrite': replaces all existing rows with the backup's version.
 *     Destructive — the user must explicitly confirm before the UI sends this.
 */
export const runtime = 'nodejs'
export const maxDuration = 300  // large restores may take >60s

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) {
      return NextResponse.json(
        { error: 'Rate limited — too many writes, wait a moment.' },
        { status: 429 },
      )
    }

    if (!isConfigured()) {
      return NextResponse.json({ error: 'Backend not configured' }, { status: 400 })
    }

    const body = await req.json().catch(() => null)
    if (!body || !body.backup) {
      return NextResponse.json({ error: 'Missing `backup` field in request body' }, { status: 400 })
    }

    const mode: 'merge' | 'overwrite' = body.mode === 'overwrite' ? 'overwrite' : 'merge'
    const backup = body.backup

    // Basic format validation
    if (!backup || typeof backup !== 'object') {
      return NextResponse.json({ error: 'Invalid backup format — expected an object' }, { status: 400 })
    }
    const sheets = backup.sheets || backup
    if (!sheets || typeof sheets !== 'object') {
      return NextResponse.json({ error: 'Invalid backup format — missing `sheets` field' }, { status: 400 })
    }

    const startedAt = Date.now()
    const result = await restoreAllData(backup, mode)
    const elapsedMs = Date.now() - startedAt

    return NextResponse.json({
      success: true,
      mode,
      summary: result.summary,
      totalInserted: result.totalInserted,
      totalSkipped: result.totalSkipped,
      totalOverwritten: result.totalOverwritten,
      elapsedMs,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
