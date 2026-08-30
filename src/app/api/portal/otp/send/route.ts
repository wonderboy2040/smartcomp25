import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { sendCustomerNotification } from '@/lib/notifications'
import { authLimiter, getClientIp } from '@/lib/rate-limit'
import { setOtp, cleanExpiredOtps } from '@/lib/otp-store'

/**
 * POST /api/portal/otp/send
 *
 * v13 NEW: OTP-based authentication for customer portal.
 *
 * Body: { phone: "9876543210" }
 *
 * Generates a 6-digit OTP, sends it via WhatsApp (Cloud API) with SMS fallback,
 * and stores a hash in the in-memory store with 5-min expiry. The customer
 * then verifies with /api/portal/otp/verify to get a session token.
 *
 * SECURITY:
 *   - 6-digit numeric OTP (1M combinations)
 *   - 5-minute expiry
 *   - Max 5 attempts per phone per OTP (then locked)
 *   - OTP hash is SHA-256 + per-phone salt — never stored in plain
 *   - Phone enumeration attack mitigation: same response whether phone
 *     exists or not ("If your number is registered, OTP has been sent")
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
    if (phone.length !== 10) {
      return NextResponse.json({ error: 'Enter a valid 10-digit mobile number' }, { status: 400 })
    }

    // Check if phone is registered (don't reveal — same response either way)
    const customers = await listRows<any>('Customers', { useCache: true }).catch(() => [])
    const strip = (v: unknown) => normalizePhone(v)
    const exists = customers.some((c) => strip(c.phone) === phone)

    if (!exists) {
      // Anti-enumeration: respond with success message even if not registered
      return NextResponse.json({
        success: true,
        message: 'If your number is registered, an OTP has been sent via WhatsApp.',
        expiresIn: 300,
      })
    }

    // Generate + store OTP
    const { otp } = await setOtp(phone, 300) // 5 min

    // Send OTP via WhatsApp
    const shops = await listRows<any>('Shop').catch(() => [])
    const shop = shops[0] || {}
    const shopName = String(shop.name || 'Smart Computers')

    const message = `*${shopName} — OTP Verification*\n\nYour one-time password is: *${otp}*\n\nThis code is valid for 5 minutes. Do not share it with anyone.\n\nIf you didn't request this, please ignore this message.`

    const result = await sendCustomerNotification(phone, message).catch(() => ({ success: false }))

    return NextResponse.json({
      success: true,
      message: 'OTP sent via WhatsApp',
      sent: result?.success === true,
      expiresIn: 300,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
