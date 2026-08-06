/**
 * Runtime config — single source of truth for backend credentials.
 *
 * Cloud deployments (Render / Vercel / Onrender) set everything as env vars.
 * The Electron desktop .exe instead writes a small JSON file to
 * %APPDATA%/smartcomp/config.json and points SMARTCOMP_CONFIG_PATH at it.
 * This module reads that file (with a 5s TTL) so the Next.js server picks
 * up changes made via the desktop app's settings panel without a restart.
 *
 * Env vars (when present) ALWAYS win — this preserves existing cloud
 * behaviour and lets the same code run on web + desktop unchanged.
 *
 * Backend modes:
 *   - Firebase (preferred, ultra fast): set FIREBASE_SERVICE_ACCOUNT_BASE64
 *     OR (FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY).
 *   - Apps Script (legacy, slow): set APPS_SCRIPT_URL. Kept for backward
 *     compatibility and the desktop .exe that may still ship with it.
 *   - If BOTH are set, Firebase wins.
 */

import { existsSync, readFileSync } from 'fs'

interface RuntimeConfig {
  appsScriptUrl?: string
  appPin?: string
  // Firebase fields (desktop mode stores them in the same JSON file)
  firebaseServiceAccountBase64?: string
  firebaseProjectId?: string
  firebaseClientEmail?: string
  firebasePrivateKey?: string
}

let cache: RuntimeConfig | null = null
let loadedAt = 0
const TTL = 5 * 1000 // re-read every 5s

function read(): RuntimeConfig {
  const now = Date.now()
  if (cache && now - loadedAt < TTL) return cache

  const path = process.env.SMARTCOMP_CONFIG_PATH
  if (!path) {
    cache = {}
  } else {
    try {
      if (existsSync(path)) {
        const raw = readFileSync(path, 'utf-8')
        const parsed = JSON.parse(raw) as RuntimeConfig
        cache = {
          appsScriptUrl: parsed.appsScriptUrl?.trim() || undefined,
          appPin: parsed.appPin?.trim() || undefined,
          firebaseServiceAccountBase64: parsed.firebaseServiceAccountBase64?.trim() || undefined,
          firebaseProjectId: parsed.firebaseProjectId?.trim() || undefined,
          firebaseClientEmail: parsed.firebaseClientEmail?.trim() || undefined,
          firebasePrivateKey: parsed.firebasePrivateKey?.trim() || undefined,
        }
      } else {
        cache = {}
      }
    } catch {
      cache = {}
    }
  }
  loadedAt = now
  return cache
}

export function getAppsScriptUrl(): string | undefined {
  if (process.env.APPS_SCRIPT_URL) return process.env.APPS_SCRIPT_URL
  return read().appsScriptUrl
}

export function getAppPin(): string | undefined {
  if (process.env.APP_PIN) return process.env.APP_PIN
  return read().appPin
}

/** Returns true when Firebase credentials are available (env or desktop file). */
export function isFirebaseMode(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) return true
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) return true
  const cfg = read()
  return !!(cfg.firebaseServiceAccountBase64 || (cfg.firebaseProjectId && cfg.firebaseClientEmail && cfg.firebasePrivateKey))
}

/** Returns true when ANY backend (Firebase or legacy Apps Script) is configured. */
export function isBackendConfigured(): boolean {
  return isFirebaseMode() || !!getAppsScriptUrl()
}

export function getFirebaseServiceAccountBase64(): string | undefined {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) return process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  return read().firebaseServiceAccountBase64
}

export function getFirebaseProjectId(): string | undefined {
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID
  return read().firebaseProjectId
}

export function getFirebaseClientEmail(): string | undefined {
  if (process.env.FIREBASE_CLIENT_EMAIL) return process.env.FIREBASE_CLIENT_EMAIL
  return read().firebaseClientEmail
}

export function getFirebasePrivateKey(): string | undefined {
  if (process.env.FIREBASE_PRIVATE_KEY) return process.env.FIREBASE_PRIVATE_KEY
  return read().firebasePrivateKey
}

export function clearRuntimeConfigCache(): void {
  cache = null
  loadedAt = 0
}
