/**
 * SmartComp Mobile — runtime config (server URL + scheme).
 *
 * Server URL is configurable at runtime so the same APK can target
 *   - production: https://smartcomp.shop
 *   - staging:    https://smartcomp-staging.onrender.com
 *   - LAN dev:    http://192.168.1.10:3000
 * without a rebuild. Stored in AsyncStorage, bootstrapped from
 * EXPO_PUBLIC_API_URL (compile-time) as the default.
 */

import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'

const SERVER_URL_KEY = 'smartcomp.serverUrl'
const APP_PIN_KEY = 'smartcomp.appPin'
const LAST_PUSH_TOKEN_KEY = 'smartcomp.lastPushToken'

const COMPILE_TIME_URL =
  Constants?.expoConfig?.extra?.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://localhost:3000'

/**
 * Get the currently-active server URL. Falls back to compile-time default
 * if the user has not set one in Settings.
 */
export async function getServerUrl(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(SERVER_URL_KEY)
    if (stored) return stored.replace(/\/$/, '')
  } catch {
    // SecureStore may throw on web — ignore and fall back.
  }
  return String(COMPILE_TIME_URL).replace(/\/$/, '')
}

export async function setServerUrl(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/$/, '')
  if (trimmed) {
    await SecureStore.setItemAsync(SERVER_URL_KEY, trimmed)
  } else {
    await SecureStore.deleteItemAsync(SERVER_URL_KEY)
  }
}

export function getCompileTimeServerUrl(): string {
  return String(COMPILE_TIME_URL).replace(/\/$/, '')
}

/** Optional pre-shared PIN (compile-time). Set in .env as EXPO_PUBLIC_APP_PIN. */
export function getCompileTimeAppPin(): string | null {
  const p = process.env.EXPO_PUBLIC_APP_PIN
  return p && /^\d{4,8}$/.test(p) ? p : null
}

export async function getLastPushToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(LAST_PUSH_TOKEN_KEY)
  } catch {
    return null
  }
}

export async function setLastPushToken(token: string | null): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(LAST_PUSH_TOKEN_KEY, token)
    else await SecureStore.deleteItemAsync(LAST_PUSH_TOKEN_KEY)
  } catch {
    // ignore
  }
}

export function getAppPin(): string | null {
  return getCompileTimeAppPin()
}

export const linkScheme =
  Constants?.expoConfig?.extra?.EXPO_PUBLIC_LINK_SCHEME ||
  process.env.EXPO_PUBLIC_LINK_SCHEME ||
  'smartcomp'
