/**
 * Simple in-memory rate limiter for API routes
 * v3.0 upgrade - prevents abuse / brute force
 */

type RateLimitEntry = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key)
    }
  }, 5 * 60 * 1000)
}

interface RateLimitOptions {
  max: number
  windowMs: number
  keyPrefix?: string
}

export function rateLimit(options: RateLimitOptions) {
  const { max, windowMs, keyPrefix = 'rl' } = options

  return (identifier: string): { allowed: boolean; remaining: number; resetAt: number } => {
    const key = `${keyPrefix}:${identifier}`
    const now = Date.now()
    const existing = store.get(key)

    if (!existing || existing.resetAt < now) {
      const entry: RateLimitEntry = {
        count: 1,
        resetAt: now + windowMs,
      }
      store.set(key, entry)
      return { allowed: true, remaining: max - 1, resetAt: entry.resetAt }
    }

    if (existing.count >= max) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt }
    }

    existing.count++
    store.set(key, existing)
    return { allowed: true, remaining: max - existing.count, resetAt: existing.resetAt }
  }
}

// Pre-configured limiters
export const apiLimiter = rateLimit({ max: 120, windowMs: 60 * 1000, keyPrefix: 'api' })
export const authLimiter = rateLimit({ max: 5, windowMs: 60 * 1000, keyPrefix: 'auth' })
export const writeLimiter = rateLimit({ max: 30, windowMs: 60 * 1000, keyPrefix: 'write' })
export const exportLimiter = rateLimit({ max: 10, windowMs: 60 * 1000, keyPrefix: 'export' })
export const errorLogLimiter = rateLimit({ max: 30, windowMs: 60 * 1000, keyPrefix: 'errlog' })
export const cronLimiter = rateLimit({ max: 60, windowMs: 60 * 1000, keyPrefix: 'cron' })

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}
