import { NextResponse } from 'next/server'

/**
 * GET /api/health
 *
 * Public diagnostics endpoint — Render's health check hits this every 10s.
 *
 * CRITICAL: This endpoint MUST respond in <500ms. It does NOT import any
 * firebase code at module level — that would pull firebase-admin into the
 * route's chunk and slow the cold start. All firebase checks are done via
 * dynamic import() inside the deep-check branch only.
 *
 * Default (no query param): responds instantly with env-var status.
 * Deep check (?deep=1): does an actual Firestore read (1-3s).
 */
export async function GET(req: Request) {
  // Read env vars DIRECTLY — no library imports. This keeps the route chunk
  // tiny and guarantees Render's health check gets a response even if
  // firebase-admin or any other heavy dep fails to load.
  const hasFirebaseBase64 = !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  const hasFirebaseProjectId = !!process.env.FIREBASE_PROJECT_ID
  const hasFirebaseClientEmail = !!process.env.FIREBASE_CLIENT_EMAIL
  const hasFirebasePrivateKey = !!process.env.FIREBASE_PRIVATE_KEY
  const hasAppPin = !!process.env.APP_PIN

  const firebaseEnvConfigured =
    hasFirebaseBase64 || (hasFirebaseProjectId && hasFirebaseClientEmail && hasFirebasePrivateKey)
  const backendConfigured = firebaseEnvConfigured
  const firebaseMode = firebaseEnvConfigured

  const url = new URL(req.url)
  const deep = url.searchParams.get('deep') === '1'

  // Quick response — no Firestore round-trip
  let firebaseReachable: boolean | null = null
  let firebaseError: string | null = null
  let firebaseInitialized: boolean | null = null

  // Deep check is opt-in — used for manual debugging, NOT for health checks
  if (deep && backendConfigured) {
    try {
      // Dynamic import so firebase-admin doesn't load on the simple path
      const { pingFirestore } = await import('@/lib/firebase')
      const result = await pingFirestore()
      firebaseReachable = result.ok
      firebaseError = result.message || null
      firebaseInitialized = result.ok
    } catch (e: any) {
      firebaseReachable = false
      firebaseError = e?.message || 'Unknown error during deep check'
    }
  }

  const hints: string[] = []
  if (!backendConfigured) {
    hints.push(
      '🔴 No backend configured. Set FIREBASE_SERVICE_ACCOUNT_BASE64 on Render (see README → Firebase setup).'
    )
  } else if (firebaseMode) {
    if (deep) {
      if (firebaseReachable === true) {
        hints.push('✅ Firestore reachable. Backend is fully operational.')
      } else if (firebaseReachable === false) {
        hints.push('🔴 Firestore unreachable: ' + (firebaseError || 'unknown'))
      }
    } else {
      hints.push('ℹ️ Run /api/health?deep=1 to test actual Firestore connectivity.')
    }
    if (hasAppPin) hints.push('PIN protection is ON — log in via /login.')
  }

  return NextResponse.json(
    {
      status: 'ok',
      version: '10.1.2-firebase',
      codename: 'SmartComp Pro Firebase',
      timestamp: new Date().toISOString(),
      uptime: typeof process.uptime === 'function' ? process.uptime() : 0,
      backend: 'firestore',
      configured: backendConfigured,
      firebaseConfigured: firebaseEnvConfigured,
      firebaseInitialized,
      firebaseInitError: firebaseError,
      firebaseReachable,
      deep,
      pinRequired: hasAppPin,
      env: {
        nodeVersion: process.version,
        platform: process.platform,
        port: process.env.PORT || '(unset)',
        runtimeConfigActive: !!process.env.SMARTCOMP_CONFIG_PATH,
        hasFirebaseBase64,
        hasFirebaseProjectId,
        hasFirebaseClientEmail,
        hasFirebasePrivateKey,
      },
      memory: process.memoryUsage
        ? {
            rss: Math.round((process.memoryUsage().rss || 0) / 1024 / 1024) + ' MB',
            heapUsed: Math.round((process.memoryUsage().heapUsed || 0) / 1024 / 1024) + ' MB',
            heapTotal: Math.round((process.memoryUsage().heapTotal || 0) / 1024 / 1024) + ' MB',
          }
        : null,
      hints: hints.length > 0 ? hints : ['All checks passed.'],
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  )
}