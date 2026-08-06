import { NextResponse } from 'next/server'
import { isConfigured, getCacheStats, testConnection } from '@/lib/sheets-client'
import { getAppPin, isFirebaseMode, isBackendConfigured } from '@/lib/runtime-config'
import { getInitError } from '@/lib/firebase'

/**
 * GET /api/health
 * Public diagnostics endpoint — helps debug "data not loading" issues.
 *
 * Returns:
 *   - status: 'ok' if the server process is alive
 *   - backend: 'firestore' (preferred) or 'apps-script' (legacy)
 *   - configured: whether ANY backend is configured
 *   - firebaseConfigured / appsScriptConfigured: individual flags
 *   - firebaseReachable: live ping result (Firestore mode)
 *   - pinRequired: whether APP_PIN is set (auth gate is active)
 *   - cache: server-side cache stats
 *
 * This endpoint is intentionally PUBLIC (in proxy.ts PUBLIC_PATHS) so it can
 * be hit even before login — useful for diagnosing deployment issues.
 */
export async function GET() {
  try {
    const pin = getAppPin()
    const configured = isConfigured()
    const firebaseMode = isFirebaseMode()

    let firebaseReachable: boolean | null = null
    let firebaseError: string | null = null
    let appsScriptReachable: boolean | null = null
    let appsScriptError: string | null = null

    if (configured) {
      try {
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

    return NextResponse.json({
      status: 'ok',
      version: '10.0.1',
      codename: 'SmartComp Pro Firebase',
      timestamp: new Date().toISOString(),
      uptime: typeof process.uptime === 'function' ? process.uptime() : 0,
      backend: firebaseMode ? 'firestore' : 'apps-script',
      configured,
      firebaseConfigured: firebaseMode,
      appsScriptConfigured: !firebaseMode && !!isBackendConfigured(),
      firebaseReachable,
      firebaseError: firebaseError || getInitError(),
      appsScriptReachable,
      appsScriptError,
      pinRequired: !!pin,
      cache: getCacheStats(),
      env: {
        nodeVersion: process.version,
        platform: process.platform,
        runtimeConfigActive: !!process.env.SMARTCOMP_CONFIG_PATH,
      },
      hints: generateHints({
        configured,
        firebaseMode,
        firebaseReachable,
        firebaseError,
        appsScriptReachable,
        appsScriptError,
        pinRequired: !!pin,
      }),
    })
  } catch (e: any) {
    return NextResponse.json(
      {
        status: 'error',
        error: e?.message,
        version: '10.0.1',
      },
      { status: 500 }
    )
  }
}

function generateHints(opts: {
  configured: boolean
  firebaseMode: boolean
  firebaseReachable: boolean | null
  firebaseError: string | null
  appsScriptReachable: boolean | null
  appsScriptError: string | null
  pinRequired: boolean
}): string[] {
  const hints: string[] = []
  if (!opts.configured) {
    hints.push(
      'No backend configured. RECOMMENDED: Set FIREBASE_SERVICE_ACCOUNT_BASE64 on Render (see README → Firebase setup). LEGACY: set APPS_SCRIPT_URL to keep using Google Sheets.'
    )
  } else if (opts.firebaseMode) {
    if (opts.firebaseReachable === false) {
      hints.push(
        'Firebase credentials are set but Firestore is not reachable. ' +
          (opts.firebaseError || 'Check that the service account JSON is valid and the project exists.')
      )
    } else if (opts.pinRequired) {
      hints.push('Firebase OK. PIN protection is ON — log in via /login.')
    } else {
      hints.push('All checks passed (Firebase mode).')
    }
  } else {
    if (opts.appsScriptReachable === false) {
      hints.push(
        'Apps Script URL is configured but the backend is not reachable. ' +
          (opts.appsScriptError || 'Open the URL in a browser to check for authorization errors.')
      )
    } else if (opts.pinRequired) {
      hints.push('PIN protection is ON. Log in via /login — every /api/* request requires the smartcomp_auth cookie.')
    } else {
      hints.push('All checks passed (Apps Script legacy mode). Consider migrating to Firebase for ~50x faster reads.')
    }
  }
  if (hints.length === 0) hints.push('All checks passed.')
  return hints
}
