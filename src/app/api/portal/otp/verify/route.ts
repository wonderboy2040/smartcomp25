import { NextRequest, NextResponse } from 'next/server'
import { authLimiter, getClientIp } from '@/lib/rate-limit'
import { verifyOtp, setSession, cleanExpiredOtps } from '@/lib/otp-store'

/**
 * POST /api/portal/otp/verify
 *
 * v13 NEW: Verify OTP and create portal session.
 *
 * Body: { phone: "9876543210", otp: "123456" }
 *
 * Returns:
 *   - 200: { success, token, expiresIn } on valid OTP
 *   - 400: { error, attemptsRemaining } on wrong OTP
 *   - 429: rate limited
 *
 * The returned token should be sent as `Authorization: Bearer <token>` on
 * subsequent portal requests (/api/portal, /api/portal/pay).
 */

function normalizePhone(raw: unknown): string {
  let p = String(raw ?? '').replace(/\D/g, '')
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2)
  if (p.length === 11 && p.startsWith('0')) p = p.slice(1)
  return p
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = authLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Too many attempts — wait a minute' }, { status: 429 })

    cleanExpiredOtps()

    const body = await req.json().catch(() => ({}))
    const phone = normalizePhone(body?.phone)
    const otp = String(body?.otp || '').trim()

    if (phone.length !== 10) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: 'OTP must be 6 digits' }, { status: 400 })
    }

    const result = await verifyOtp(phone, otp)

    if (!result.valid) {
      return NextResponse.json({ error: result.reason || 'Invalid OTP' }, { status: 400 })
    }

    // Create session token
    const token = setSession(phone)

    return NextResponse.json({
      success: true,
      token,
      expiresIn: 24 * 60 * 60, // 24 hours
      message: 'Login successful',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
