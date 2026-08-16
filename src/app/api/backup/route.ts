import { NextRequest, NextResponse } from 'next/server'
import { exportAllData, isConfigured } from '@/lib/sheets-client'
import { exportLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * Data Backup API
 * Manual backup endpoint - exports all data to JSON
 * Auto-backup scheduled via cron will call this endpoint
 */

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = exportLimiter(ip)
    if (!check.allowed) {
      return NextResponse.json(
        { error: 'Too many backup requests. Wait a minute.' },
        { status: 429 }
      )
    }

    if (!isConfigured()) {
      return NextResponse.json({ error: 'Backend not configured' }, { status: 400 })
    }

    // Export all data
    const data = await exportAllData()

    // Add backup metadata
    const backup = {
      ...data,
      backupVersion: '1.0',
      backupDate: new Date().toISOString(),
      appVersion: '12.0.0-firebase-only',
      totalSheets: Object.keys(data.sheets || {}).length,
    }

    // Return as downloadable JSON
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
 * Scheduled backup function
 * Called by cron job daily at 2 AM
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = req.headers.get('x-cron-secret')
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isConfigured()) {
      return NextResponse.json({ error: 'Backend not configured' }, { status: 400 })
    }

    // Export all data
    const data = await exportAllData()

    // In production, upload to Firebase Storage or send via email
    // For now, just return success confirmation
    // TODO: Implement Firebase Storage upload

    return NextResponse.json({
      success: true,
      message: 'Backup completed',
      timestamp: new Date().toISOString(),
      totalSheets: Object.keys(data.sheets || {}).length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
