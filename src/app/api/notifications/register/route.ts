import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, updateRow } from '@/lib/sheets-client'

/**
 * POST /api/notifications/register
 *
 * Called by the SmartComp mobile app (React Native / Expo) after it obtains
 * an Expo push token. Tokens are stored in the `PushTokens` sheet so the
 * server can send push notifications later (new job assigned, job status
 * changed, low stock, payment overdue, etc.).
 *
 * This route is PIN-protected (not in PUBLIC_PATHS) — only authenticated
 * app users can register a device.
 *
 * Body: { token: string, platform?: 'android' | 'ios' | 'web', deviceId?: string, appVersion?: string }
 * Upsert key: deviceId if provided, else the token itself.
 */

const MAX_TOKEN_LEN = 256
const MAX_FIELD_LEN = 100

export async function POST(req: NextRequest) {
  try {
    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const token = String(body?.token || '').trim()
    if (!token) {
      return NextResponse.json({ error: 'Missing push token' }, { status: 400 })
    }
    if (token.length > MAX_TOKEN_LEN) {
      return NextResponse.json({ error: 'Push token too long' }, { status: 400 })
    }

    const deviceId = String(body?.deviceId || '').trim().slice(0, MAX_FIELD_LEN) || ''
    const platform = String(body?.platform || '').trim().slice(0, 20) || 'unknown'
    const appVersion = String(body?.appVersion || '').trim().slice(0, 20) || ''

    const rows = await listRows<any>('PushTokens')

    // Upsert: match by deviceId (preferred), else by token.
    const existing = deviceId
      ? rows.find((r) => String(r?.deviceId || '') === deviceId)
      : rows.find((r) => String(r?.token || '') === token)

    if (existing) {
      const updated = await updateRow('PushTokens', String(existing.id), {
        token,
        deviceId,
        platform,
        appVersion,
        active: true,
      })
      return NextResponse.json({ ok: true, id: updated.id, updated: true })
    }

    const created = await createRow('PushTokens', {
      token,
      deviceId: deviceId || `tok_${token.slice(-12)}`,
      platform,
      appVersion,
      active: true,
    })
    return NextResponse.json({ ok: true, id: created.id, created: true }, { status: 201 })
  } catch (e: any) {
    console.error('[api/notifications/register] failed:', e?.message)
    return NextResponse.json({ error: 'Failed to register push token' }, { status: 500 })
  }
}
