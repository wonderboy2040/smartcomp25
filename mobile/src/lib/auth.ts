/**
 * SmartComp Mobile — PIN-based auth client.
 *
 * The web backend uses PIN auth via /api/auth/login. On success it
 * sets the `smartcomp_auth` HttpOnly cookie (30-day expiry). The
 * mobile client captures the cookie via the api.ts interceptor and
 * stores it in SecureStore for persistence across app restarts.
 */

import { apiPost, apiGet, initAuthCookie, getAuthCookie, setAuthCookie } from './api'
import type { AuthStatus } from '@/types'

export async function loginWithPin(pin: string): Promise<{ success: boolean; error?: string }> {
  if (!/^\d{4,8}$/.test(pin)) {
    return { success: false, error: 'PIN must be 4-8 digits' }
  }
  try {
    const res = await apiPost<{ success?: boolean; error?: string }>('/api/auth/login', { pin }, { skipAuth: true })
    if (res?.success) {
      // api.ts already captured the Set-Cookie and persisted it.
      return { success: true }
    }
    return { success: false, error: res?.error || 'Login failed' }
  } catch (e: any) {
    const status = e?.status
    if (status === 401) return { success: false, error: 'Incorrect PIN' }
    if (status === 429) return { success: false, error: 'Too many attempts. Wait a minute.' }
    return { success: false, error: e?.message || 'Network error' }
  }
}

export async function logout(): Promise<void> {
  try {
    await apiPost('/api/auth/logout', {}).catch(() => null)
  } finally {
    await setAuthCookie(null)
  }
}

export async function getAuthStatus(): Promise<AuthStatus> {
  try {
    return await apiGet<AuthStatus>('/api/auth/status')
  } catch {
    return { pinRequired: false, authenticated: false }
  }
}

export async function bootstrapAuth(): Promise<AuthStatus> {
  await initAuthCookie()
  return getAuthStatus()
}

export function isAuthenticated(): boolean {
  return !!getAuthCookie()
}

/**
 * Ping the backend health endpoint. Used by Settings → Test connection.
 */
export async function pingBackend(): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await apiGet<{ ok?: boolean; message?: string; status?: string }>('/api/health', undefined, {
      timeoutMs: 8000,
    })
    return { ok: !!res?.ok, message: res?.message || res?.status }
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Unreachable' }
  }
}
