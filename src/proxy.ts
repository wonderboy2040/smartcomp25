import { NextRequest, NextResponse } from 'next/server'
import { getAppPin } from '@/lib/runtime-config'

/**
 * PIN-based access protection - FIXED v6.0.0
 * 
 * BUGFIX v6.0.0: SALT mismatch fixed - login and proxy now use same SALT
 * Also supports both old (_smartcomp_v1) and new (_smartcomp_v3_2026) salts
 * for backward compatibility when users upgrade.
 *
 * DESKTOP SUPPORT: PIN is now read via getAppPin() so the Electron .exe
 * can persist it in %APPDATA%/smartcomp/config.json and update it from
 * the in-app settings panel without a rebuild.
 */

const AUTH_COOKIE = 'smartcomp_auth'
const SALT_V3 = '_smartcomp_v3_2026'
const SALT_V1 = '_smartcomp_v1' // legacy support

let cachedPin: string | undefined
let cachedTokens: { v3: string | null; v1: string | null } | null = null

async function expectedTokens(): Promise<{ v3: string | null; v1: string | null }> {
  const pin = getAppPin()
  if (!pin) return { v3: null, v1: null }
  
  if (pin === cachedPin && cachedTokens) return cachedTokens
  
  cachedPin = pin
  const enc = new TextEncoder()
  
  // Generate both tokens for backward compatibility
  const dataV3 = enc.encode(pin + SALT_V3)
  const digestV3 = await crypto.subtle.digest('SHA-256', dataV3)
  const tokenV3 = Array.from(new Uint8Array(digestV3))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  
  const dataV1 = enc.encode(pin + SALT_V1)
  const digestV1 = await crypto.subtle.digest('SHA-256', dataV1)
  const tokenV1 = Array.from(new Uint8Array(digestV1))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  
  cachedTokens = { v3: tokenV3, v1: tokenV1 }
  return cachedTokens
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/status',
  '/api/config',          // Public: only exposes `configured: boolean`, `pinRequired: boolean`, URL preview — no secrets. Needed so the homepage can decide between SetupWizard vs Login vs App.
  '/api/whatsapp/webhook',
  '/api/cron/auto-enquiry',
  '/api/cron/amc',
  '/api/log-error',
  '/track',
  '/api/track',
  '/api/razorpay/webhook',
  '/api/health',
  '/api/poster/debug',  // Public diagnostic — tests ZAI API connectivity from the server (no auth needed)
  // SECURITY: /api/export removed from PUBLIC_PATHS — it dumps all 16 sheets
  // (Customers PII, PersonalExpenditure, Settings with PINs, etc.) in JSON/CSV.
  // Now requires the auth cookie like every other /api/* route.
]

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p + '/'))) return true
  if (pathname.startsWith('/track')) return true
  if (pathname.startsWith('/_next/')) return true
  if (pathname.startsWith('/favicon')) return true
  if (pathname.startsWith('/icon-')) return true
  if (pathname.startsWith('/apple-')) return true
  if (pathname.startsWith('/android-')) return true
  if (pathname.startsWith('/safari-')) return true
  if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest') return true
  if (pathname === '/sw.js' || pathname === '/sw-register.js' || pathname === '/offline.html') return true
  if (pathname === '/robots.txt' || pathname === '/logo.svg' || pathname === '/icon.svg') return true
  if (pathname === '/clear-cache.html') return true
  if (pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|avif|woff|woff2|ttf|eot)$/)) return true
  return false
}

export async function proxy(req: NextRequest) {
  const tokens = await expectedTokens()
  
  // No PIN configured -> open access
  if (!tokens.v3) return NextResponse.next()

  const { pathname } = req.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const token = req.cookies.get(AUTH_COOKIE)?.value
  if (token) {
    // Accept either v3 or v1 token for backward compatibility
    if (safeEqual(token, tokens.v3!) || (tokens.v1 && safeEqual(token, tokens.v1))) {
      return NextResponse.next()
    }
  }

  const accept = req.headers.get('accept') || ''
  const isHtml = accept.includes('text/html')

  if (isHtml) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.json(
    { error: 'Unauthorized. PIN required.', code: 'PIN_REQUIRED', version: '6.0.0' },
    { 
      status: 401,
      headers: {
        'X-Auth-Required': 'true',
      }
    }
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
