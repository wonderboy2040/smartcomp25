/**
 * v13 NEW: OTP (One-Time Password) store + helpers.
 *
 * In-memory store keyed by phone number. Suitable for single-instance
 * deployments (Render web service). On multi-instance (Vercel), you'd want
 * to swap this for a Redis-backed store.
 *
 * Each entry contains:
 *   - hash:    SHA-256 hash of the OTP with a server-side salt
 *   - expiresAt: timestamp when OTP expires (default 5 min)
 *   - attempts:  number of failed verify attempts (max 5 then locked)
 *   - locked:    boolean — true after 5 failed attempts
 */

export type OtpEntry = { hash: string; expiresAt: number; attempts: number; locked: boolean }

// Phone -> OtpEntry
const otpStore = new Map<string, OtpEntry>()

// Clean expired entries (call periodically)
export function cleanExpiredOtps() {
  const now = Date.now()
  for (const [k, v] of Array.from(otpStore.entries())) {
    if (v.expiresAt < now) otpStore.delete(k)
  }
}

// Hash OTP using Web Crypto API (Node 18+ globalThis.crypto.subtle)
export async function hashOtp(otp: string, phone: string): Promise<string> {
  const enc = new TextEncoder()
  const salt = `smartcomp-otp-v13-${phone.slice(-4)}` // per-phone salt
  const data = enc.encode(`${salt}:${otp}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Generate a 6-digit numeric OTP using crypto.getRandomValues
export function generateOtp(): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  const num = 100000 + (arr[0] % 900000)
  return String(num)
}

// Store a new OTP for a phone (5 min expiry by default)
export async function setOtp(phone: string, ttlSeconds = 300): Promise<{ otp: string; hash: string }> {
  const otp = generateOtp()
  const hash = await hashOtp(otp, phone)
  otpStore.set(phone, {
    hash,
    expiresAt: Date.now() + ttlSeconds * 1000,
    attempts: 0,
    locked: false,
  })
  return { otp, hash }
}

// Verify an OTP for a phone. Returns { valid, reason }.
export async function verifyOtp(phone: string, otp: string): Promise<{ valid: boolean; reason?: string }> {
  const entry = otpStore.get(phone)
  if (!entry) return { valid: false, reason: 'No OTP requested — please request a new one' }
  if (entry.locked) return { valid: false, reason: 'Too many failed attempts — request a new OTP' }
  if (entry.expiresAt < Date.now()) {
    otpStore.delete(phone)
    return { valid: false, reason: 'OTP expired — please request a new one' }
  }

  entry.attempts++
  const hash = await hashOtp(otp, phone)

  if (hash !== entry.hash) {
    if (entry.attempts >= 5) {
      entry.locked = true
      otpStore.delete(phone)
      return { valid: false, reason: 'Too many failed attempts — request a new OTP' }
    }
    return { valid: false, reason: `Incorrect OTP — ${5 - entry.attempts} attempts remaining` }
  }

  // Success — clear entry
  otpStore.delete(phone)
  return { valid: true }
}

// Generate a session token after successful OTP verification.
// Token is 32 hex chars (128 bits) — strong enough for portal sessions.
export function generateSessionToken(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// In-memory session store: token -> { phone, expiresAt }
// 24h expiry; survives page reloads; does NOT survive server restart (acceptable
// for portal use — user just re-verifies with a new OTP).
const sessionStore = new Map<string, { phone: string; expiresAt: number }>()

export function setSession(phone: string): string {
  const token = generateSessionToken()
  sessionStore.set(token, { phone, expiresAt: Date.now() + 24 * 60 * 60 * 1000 })
  return token
}

export function getSessionPhone(token: string): string | null {
  const entry = sessionStore.get(token)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    sessionStore.delete(token)
    return null
  }
  return entry.phone
}

export function clearSession(token: string) {
  sessionStore.delete(token)
}

// Clean expired sessions periodically
export function cleanExpiredSessions() {
  const now = Date.now()
  for (const [k, v] of Array.from(sessionStore.entries())) {
    if (v.expiresAt < now) sessionStore.delete(k)
  }
}
