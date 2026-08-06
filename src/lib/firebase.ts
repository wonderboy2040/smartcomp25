/**
 * Firebase Admin SDK — singleton Firestore initializer.
 *
 * Why this exists:
 *   The app used to talk to Google Sheets via an Apps Script web app. That
 *   added 6-8 s cold-start latency on every read. Firestore is an in-process
 *   SDK call from the Next.js server — typical reads are <100 ms.
 *
 * Configuration (read once, cached):
 *   Preferred:  FIREBASE_SERVICE_ACCOUNT_BASE64  (entire service-account JSON,
 *               base64-encoded). Easy to paste into Render's env-var UI.
 *   Fallback:   FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *               (private key must include literal "\n" escapes — Render keeps
 *               them as-is when set via the dashboard).
 *
 *   Desktop mode: SMARTCOMP_CONFIG_PATH may point at a JSON file written by
 *               the Electron shell, with the same fields as the service
 *               account. This keeps cloud + desktop on the same code path.
 *
 * Security:
 *   - The browser NEVER talks to Firestore directly. All Firestore calls
 *     happen server-side in /api routes. The service-account credentials
 *     stay on the server.
 *   - The user-facing PIN gate (src/proxy.ts) is unchanged — it still
 *     protects every /api/* route with the smartcomp_auth cookie.
 */

import { existsSync, readFileSync } from 'fs'
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

interface RuntimeFirebaseConfig {
  projectId?: string
  clientEmail?: string
  privateKey?: string
  /** Full service-account JSON object, if available. */
  serviceAccount?: ServiceAccount
}

let cachedApp: App | null = null
let cachedDb: Firestore | null = null
let initError: string | null = null
let loadedAt = 0
const TTL = 10 * 1000 // re-read env / config file every 10 s (desktop hot-reload)

function readDesktopConfig(): RuntimeFirebaseConfig {
  const path = process.env.SMARTCOMP_CONFIG_PATH
  if (!path) return {}
  try {
    if (!existsSync(path)) return {}
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as any
    return {
      projectId: parsed.projectId || parsed.project_id,
      clientEmail: parsed.clientEmail || parsed.client_email,
      privateKey: parsed.privateKey || parsed.private_key,
      serviceAccount: parsed.serviceAccount || (parsed.project_id && parsed.client_email && parsed.private_key
        ? {
            projectId: parsed.project_id,
            clientEmail: parsed.client_email,
            privateKey: parsed.private_key,
          }
        : undefined),
    }
  } catch {
    return {}
  }
}

function readConfig(): RuntimeFirebaseConfig {
  const now = Date.now()
  // Env-var path (Render / Vercel / cloud)
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (b64) {
    try {
      const json = Buffer.from(b64, 'base64').toString('utf-8')
      const parsed = JSON.parse(json) as ServiceAccount
      return {
        projectId: parsed.projectId,
        clientEmail: parsed.clientEmail,
        privateKey: parsed.privateKey,
        serviceAccount: parsed,
      }
    } catch (e: any) {
      initError = 'FIREBASE_SERVICE_ACCOUNT_BASE64 is set but could not be decoded: ' + (e?.message || 'unknown')
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const rawKey = process.env.FIREBASE_PRIVATE_KEY
  if (projectId && clientEmail && rawKey) {
    // Render / Vercel often escape newlines as literal "\n" — unescape them.
    const privateKey = rawKey.replace(/\\n/g, '\n')
    return {
      projectId,
      clientEmail,
      privateKey,
      serviceAccount: { projectId, clientEmail, privateKey },
    }
  }

  // Desktop path
  const desktop = readDesktopConfig()
  if (desktop.serviceAccount || (desktop.projectId && desktop.clientEmail && desktop.privateKey)) {
    return desktop
  }

  return {}
}

function buildServiceAccount(cfg: RuntimeFirebaseConfig): ServiceAccount | null {
  if (cfg.serviceAccount) return cfg.serviceAccount
  if (cfg.projectId && cfg.clientEmail && cfg.privateKey) {
    return {
      projectId: cfg.projectId,
      clientEmail: cfg.clientEmail,
      privateKey: cfg.privateKey,
    }
  }
  return null
}

/**
 * Lazy singleton initializer. Returns the Firestore instance, or null if the
 * app is not configured yet (e.g. desktop mode before the user has pasted
 * their service account).
 */
export function getDb(): Firestore | null {
  const now = Date.now()
  if (cachedDb && now - loadedAt < TTL) return cachedDb

  const cfg = readConfig()
  const sa = buildServiceAccount(cfg)
  if (!sa) {
    // Not configured — this is fine in desktop mode before setup. Caller
    // (sheets-client) treats null as "not configured" and returns [] / null.
    cachedApp = null
    cachedDb = null
    return null
  }

  try {
    // Reuse existing app if already initialized (firebase-admin throws if
    // you call initializeApp() twice with the same name).
    const appName = 'smartcomp'
    try {
      cachedApp = getApps().find((a) => a.name === appName) || initializeApp({ credential: cert(sa) }, appName)
    } catch {
      // getApps() can race in dev hot-reload — fall back to default app
      cachedApp = getApps()[0] || initializeApp({ credential: cert(sa) })
    }
    cachedDb = getFirestore(cachedApp)
    initError = null
    loadedAt = now
    return cachedDb
  } catch (e: any) {
    initError = e?.message || 'Failed to initialize Firebase Admin SDK'
    cachedApp = null
    cachedDb = null
    return null
  }
}

export function getInitError(): string | null {
  return initError
}

export function isFirebaseConfigured(): boolean {
  const cfg = readConfig()
  return !!(cfg.serviceAccount || (cfg.projectId && cfg.clientEmail && cfg.privateKey))
}

/**
 * Test reachability — used by /api/health?deep=1 and /api/config.
 *
 * Has a 5s hard timeout so a hung gRPC call can't block Render's health
 * check (which has a 60s timeout) and mark the service unhealthy.
 */
export async function pingFirestore(): Promise<{ ok: boolean; message?: string; projectId?: string }> {
  const db = getDb()
  if (!db) {
    return { ok: false, message: initError || 'Firebase not configured' }
  }
  const projId =
    (cachedApp?.options?.projectId as string) ||
    process.env.FIREBASE_PROJECT_ID ||
    undefined
  try {
    // Race the Firestore read against a 5s timeout — gRPC's default timeout
    // is minutes, which would block Render's health check.
    const readPromise = (async () => {
      const ref = db.collection('_meta').doc('ping')
      const snap = await ref.get()
      if (!snap.exists) {
        await ref.set({ ok: true, createdAt: Date.now() }, { merge: true })
      }
      return true
    })()
    const timeoutPromise = new Promise<false>((resolve) => setTimeout(() => resolve(false), 5000))
    const result = await Promise.race([readPromise, timeoutPromise])
    if (result === false) {
      return { ok: false, message: 'Firestore ping timed out after 5s — check network egress or Firestore rules', projectId: projId }
    }
    return { ok: true, projectId: projId }
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Firestore ping failed', projectId: projId }
  }
}

/** Reset caches — used by tests and the desktop settings panel. */
export function resetFirebase(): void {
  cachedApp = null
  cachedDb = null
  initError = null
  loadedAt = 0
}
