import { NextRequest, NextResponse } from 'next/server'
import { exportAllDataForBackup, isConfigured } from '@/lib/sheets-client'
import { exportLimiter, getClientIp } from '@/lib/rate-limit'
import { isGoogleDriveConfigured, uploadBackupToDrive, cleanupOldBackups, listBackups, downloadBackup } from '@/lib/gdrive-backup'

/**
 * Data Backup API (v12.8)
 *
 *   GET   /api/backup                — manual download of full JSON backup
 *   POST  /api/backup                — scheduled auto-backup (cron-protected),
 *                                       uploads JSON to Google Drive
 *   GET   /api/backup?list=1         — list recent Drive backups
 *   GET   /api/backup?fileId=XXX     — download a specific Drive backup
 *
 * Daily auto-backup is wired via /api/cron/backup (vercel.json + render.yaml).
 * The cron calls POST /api/backup with the CRON_SECRET header.
 *
 * Google Drive integration requires these env vars:
 *   GDRIVE_CLIENT_EMAIL  — service account email
 *   GDRIVE_PRIVATE_KEY   — service account private key (PEM)
 *   GDRIVE_FOLDER_ID      — ID of the target Drive folder
 *   GDRIVE_RETENTION_DAYS — (optional, default 30) auto-delete older backups
 */

export const runtime = 'nodejs'
export const maxDuration = 120  // backup of large datasets may take >60s

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = exportLimiter(ip)
    if (!check.allowed) {
      return NextResponse.json(
        { error: 'Too many backup requests. Wait a minute.' },
        { status: 429 },
      )
    }

    if (!isConfigured()) {
      return NextResponse.json({ error: 'Backend not configured' }, { status: 400 })
    }

    const url = new URL(req.url)

    // ?list=1 — list recent Drive backups (used by the Backup panel UI)
    if (url.searchParams.get('list') === '1') {
      if (!isGoogleDriveConfigured()) {
        return NextResponse.json({
          configured: false,
          backups: [],
          message: 'Google Drive not configured. Set GDRIVE_CLIENT_EMAIL, GDRIVE_PRIVATE_KEY, GDRIVE_FOLDER_ID env vars.',
        })
      }
      const limit = Math.min(100, Number(url.searchParams.get('limit')) || 20)
      const backups = await listBackups(limit)
      return NextResponse.json({ configured: true, backups })
    }

    // ?fileId=XXX — download a specific Drive backup (used by Restore UI)
    const fileId = url.searchParams.get('fileId')
    if (fileId) {
      const backup = await downloadBackup(fileId)
      return NextResponse.json(backup)
    }

    // Default: export full JSON backup as a downloadable file
    const data = await exportAllDataForBackup()

    const backup = {
      ...data,
      backupVersion: '12.8',
      backupDate: new Date().toISOString(),
      appVersion: '12.8.0-firebase-only',
      totalSheets: Object.keys(data.sheets || {}).length,
      totals: data.totals,
    }

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="smartcomp-backup-${new Date().toISOString().split('T')[0]}.json"`,
        'X-RateLimit-Remaining': check.remaining.toString(),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

/**
 * POST /api/backup — scheduled auto-backup (called by /api/cron/backup)
 *
 * Flow:
 *   1. Verify CRON_SECRET header.
 *   2. Export full Firestore data to JSON via exportAllDataForBackup().
 *   3. If Google Drive is configured, upload the JSON to Drive.
 *   4. Clean up backups older than GDRIVE_RETENTION_DAYS.
 *   5. Return a summary.
 *
 * If Google Drive is NOT configured, the export still runs (so the
 * response includes row counts), but the JSON is not persisted anywhere
 * — the user must set up the GDRIVE_* env vars for daily auto-backup.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = req.headers.get('x-cron-secret')
    const authHeader = req.headers.get('authorization') || ''
    const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const expectedSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET

    if (!expectedSecret) {
      return NextResponse.json({ error: 'CRON_SECRET not set on server — cannot run scheduled backup' }, { status: 500 })
    }
    if (cronSecret !== expectedSecret && bearerSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isConfigured()) {
      return NextResponse.json({ error: 'Backend not configured' }, { status: 400 })
    }

    const startedAt = Date.now()
    const data = await exportAllDataForBackup()
    const today = new Date().toISOString().split('T')[0]
    const filename = `smartcomp-backup-${today}.json`

    const result: any = {
      success: true,
      timestamp: new Date().toISOString(),
      totalSheets: Object.keys(data.sheets || {}).length,
      totals: data.totals,
      backupVersion: '12.8',
      filename,
    }

    // Upload to Google Drive if configured
    if (isGoogleDriveConfigured()) {
      try {
        const upload = await uploadBackupToDrive(data, filename)
        result.drive = {
          uploaded: true,
          fileId: upload.fileId,
          url: upload.webViewLink,
          sizeBytes: upload.sizeBytes,
          sizeMB: Math.round((upload.sizeBytes / 1024 / 1024) * 100) / 100,
        }

        // Clean up old backups (retention policy)
        try {
          const cleanup = await cleanupOldBackups()
          result.drive.retention = {
            deleted: cleanup.deleted,
            remaining: cleanup.remaining,
            retentionDays: Number(process.env.GDRIVE_RETENTION_DAYS) || 30,
          }
        } catch (cleanupErr: any) {
          result.drive.retentionError = String(cleanupErr?.message || '')
        }
      } catch (uploadErr: any) {
        result.drive = {
          uploaded: false,
          error: String(uploadErr?.message || ''),
        }
      }
    } else {
      result.drive = {
        uploaded: false,
        configured: false,
        message: 'Google Drive env vars not set. Backup was exported but not persisted. Set GDRIVE_CLIENT_EMAIL, GDRIVE_PRIVATE_KEY, GDRIVE_FOLDER_ID to enable daily Drive backup.',
      }
    }

    result.elapsedMs = Date.now() - startedAt
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
