import { NextResponse } from 'next/server'
import { getCacheStats } from '@/lib/sheets-client'
import { getAppPin, isFirebaseMode, isBackendConfigured } from '@/lib/runtime-config'
import { isFirebaseConfigured, getInitError } from '@/lib/firebase'

/**
 * GET /api/health
 * Public diagnostics endpoint — Render's health check hits this every 10s.
 *
 * IMPORTANT: This endpoint MUST respond in <1s. It does NOT do any Firestore
 * round-trips by default — it only reports whether env vars are set and
 * whether the firebase-admin SDK initialized without error. The deep
 * connectivity check (actual Firestore read) is opt-in via ?deep=1 so that
 * Render's health check doesn't hang on Firestore cold-starts and mark the
 * service unhealthy.
 *
 * Query params:
 *   ?deep=1   Perform an actual Firestore read (slow, may take 1-3s).
 *             Use this when manually debugging, not for health checks.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const deep = url.searchParams.get('deep') === '1'

    const pin = getAppPin()
    const firebaseMode = isFirebaseMode()
    const backendConfigured = isBackendConfigured()
    const firebaseEnvConfigured = isFirebaseConfigured()
    const initErr = getInitError()

    // Quick status — no Firestore round-trip
    let firebaseReachable: boolean | null = null
    let firebaseError: string | null = null
    let appsScriptReachable: boolean | null = null
    let appsScriptError: string | null = null

    if (deep && backendConfigured) {
      // Opt-in deep check — actually try a Firestore read
      try {
        const { testConnection } = await import('@/lib/sheets-client')
        const result = await testConnection()
        if (firebaseMode) {
          firebaseReachable = result.success
          if (!result.success) firebaseError = result.message
        } else {
          appsScriptReachable = result.success
          if (!result.success) appsScriptError = result.message
        }
      } catch (e: any) {
        if (firebaseMode) {
          firebaseReachable = false
          firebaseError = e?.message || 'Unknown error'
        } else {
          appsScriptReachable = false
          appsScriptError = e?.message || 'Unknown error'
        }
      }
    }

    return NextResponse.json(
      {
        status: 'ok',
        version: '10.1.1-firebase',
        codename: 'SmartComp Pro Firebase',
        timestamp: new Date().toISOString(),
        uptime: typeof process.uptime === 'function' ? process.uptime() : 0,
        backend: firebaseMode ? 'firestore' : 'apps-script',
        configured: backendConfigured,
        firebaseConfigured: firebaseEnvConfigured,
        firebaseInitialized: firebaseEnvConfigured && !initErr,
        firebaseInitError: initErr,
        appsScriptConfigured: !firebaseMode && !!getAppPin?.() ? false : !firebaseMode && backendConfigured,
        // Only populated when ?deep=1
        firebaseReachable,
        firebaseError,
        appsScriptReachable,
        appsScriptError,
        deep,
        pinRequired: !!pin,
        cache: getCacheStats(),
        env: {
          nodeVersion: process.version,
          platform: process.platform,
          port: process.env.PORT || '(unset)',
          runtimeConfigActive: !!process.env.SMARTCOMP_CONFIG_PATH,
          hasFirebaseBase64: !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
          hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
          hasFirebaseClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
          hasFirebasePrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
          hasAppsScriptUrl: !!process.env.APPS_SCRIPT_URL,
        },
        hints: generateHints({
          backendConfigured,
          firebaseMode,
          firebaseEnvConfigured,
          initErr,
          firebaseReachable,
          firebaseError,
          appsScriptReachable,
          appsScriptError,
          pinRequired: !!pin,
          deep,
        }),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    )
  } catch (e: any) {
    return NextResponse.json(
      {
        status: 'error',
        error: e?.message,
        version: '10.1.1-firebase',
      },
      { status: 500 }
    )
  }
}

function generateHints(opts: {
  backendConfigured: boolean
  firebaseMode: boolean
  firebaseEnvConfigured: boolean
  initErr: string | null
  firebaseReachable: boolean | null
  firebaseError: string | null
  appsScriptReachable: boolean | null
  appsScriptError: string | null
  pinRequired: boolean
  deep: boolean
}): string[] {
  const hints: string[] = []
  if (!opts.backendConfigured) {
    hints.push(
      '🔴 No backend configured. Set FIREBASE_SERVICE_ACCOUNT_BASE64 on Render (see README → Firebase setup). Legacy alternative: set APPS_SCRIPT_URL.'
    )
    return hints
  }
  if (opts.firebaseMode) {
    if (opts.initErr) {
      hints.push(`🔴 Firebase init FAILED: ${opts.initErr}. Check that FIREBASE_SERVICE_ACCOUNT_BASE64 is a valid service-account JSON (base64-encoded).`)
    }
    if (opts.deep) {
      if (opts.firebaseReachable === false) {
        hints.push(
          '🔴 Firestore unreachable. ' +
            (opts.firebaseError || 'Check that the Firestore database exists and the service account has access.')
        )
      } else if (opts.firebaseReachable === true) {
        hints.push('✅ Firestore reachable. Backend is fully operational.')
      }
    } else {
      hints.push('ℹ️ Run /api/health?deep=1 to test actual Firestore connectivity.')
    }
    if (opts.pinRequired) hints.push('PIN protection is ON — log in via /login.')
  } else {
    if (opts.deep && opts.appsScriptReachable === false) {
      hints.push('🔴 Apps Script unreachable. ' + (opts.appsScriptError || ''))
    }
  }
  if (hints.length === 0) hints.push('All checks passed.')
  return hints
}
