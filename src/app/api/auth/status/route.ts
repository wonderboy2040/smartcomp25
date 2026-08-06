import { NextRequest, NextResponse } from 'next/server'
import { getAppPin } from '@/lib/runtime-config'

const AUTH_COOKIE = 'smartcomp_auth'
const SALT_V3 = '_smartcomp_v3_2026'
const SALT_V1 = '_smartcomp_v1' // legacy support

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder()
  const data = enc.encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * GET /api/auth/status
 * Public endpoint — tells the client:
 *   - pinRequired: whether APP_PIN env var is set (auth gate is active)
 *   - authenticated: whether the current request has a valid smartcomp_auth cookie
 *
 * This is used by page.tsx to decide whether to:
 *   - show the SetupWizard (if !configured — but configured comes from /api/config)
 *   - redirect to /login (if pinRequired && !authenticated)
 *   - show the app (if !pinRequired || authenticated)
 *
 * IMPORTANT: we cannot use document.cookie on the client because the
 * smartcomp_auth cookie is HttpOnly (for XSS protection). The server must
 * be the source of truth for "is the user authenticated?".
 */
export async function GET(req: NextRequest) {
  const pin = getAppPin()
  const pinRequired = !!pin

  let authenticated = false
  if (pinRequired) {
    const cookie = req.cookies.get(AUTH_COOKIE)?.value
    if (cookie) {
      // Compute expected tokens for both v3 (current) and v1 (legacy) salts.
      // proxy.ts accepts either, so we must too.
      const v3 = await sha256Hex(pin + SALT_V3)
      const v1 = await sha256Hex(pin + SALT_V1)
      authenticated = safeEqual(cookie, v3) || safeEqual(cookie, v1)
    }
  }

  return NextResponse.json({
    pinRequired,
    authenticated,
    // Backward compat: older clients may only check pinRequired
  })
}
