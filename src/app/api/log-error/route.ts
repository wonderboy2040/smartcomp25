import { NextRequest, NextResponse } from 'next/server'
import { getAppPin } from '@/lib/runtime-config'
import { errorLogLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * Client-side error logger.
 *
 * When the global error boundary catches a runtime error, it POSTs the error
 * details here. We log them to the server console so they show up in Render
 * logs — this lets us see the actual stack trace and fix the root cause.
 *
 * This endpoint is public (no PIN) because errors can happen before login.
 * Rate-limited (30/min/IP) to prevent log poisoning / buffer flooding.
 */

// In-memory ring buffer of recent errors (kept for debugging)
const errorBuffer: any[] = []
const MAX_BUFFER = 50

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = errorLogLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const body = await req.json()
    const entry = {
      time: body?.time || new Date().toISOString(),
      message: String(body?.message || '').slice(0, 500),
      stack: String(body?.stack || '').slice(0, 2000),
      digest: String(body?.digest || '').slice(0, 100),
      url: String(body?.url || '').slice(0, 500),
    }
    // Store in buffer
    errorBuffer.push(entry)
    if (errorBuffer.length > MAX_BUFFER) errorBuffer.shift()
    // Log to server console (shows in Render logs)
    console.error('[CLIENT_ERROR]', JSON.stringify(entry, null, 2))
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  // SECURITY: GET is admin-only (returns error stacks which leak implementation details).
  // POST remains public so client crashes can log before login.
  // We verify the auth cookie directly here. Login issues a v3 token
  // (SALT = '_smartcomp_v3_2026') — historical bug: this route checked the v1
  // salt instead, so every fresh login got 401 when viewing the error buffer.
  const APP_PIN = getAppPin()
  if (APP_PIN) {
    const cookie = req.cookies.get('smartcomp_auth')?.value
    if (!cookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const enc = new TextEncoder()
    // v3 is the current salt (matches /api/auth/login). Accept v1 too for any
    // sessions that were issued before the v3 upgrade (proxy.ts supports both).
    const salts = ['_smartcomp_v3_2026', '_smartcomp_v1']
    let ok = false
    for (const salt of salts) {
      const data = enc.encode(APP_PIN + salt)
      const digest = await crypto.subtle.digest('SHA-256', data)
      const expected = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      if (cookie.length !== expected.length) continue
      let diff = 0
      for (let i = 0; i < expected.length; i++) diff |= cookie.charCodeAt(i) ^ expected.charCodeAt(i)
      if (diff === 0) { ok = true; break }
    }
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Return recent errors for debugging (admin only)
  return NextResponse.json({ errors: errorBuffer.slice(-20) })
}
