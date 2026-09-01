/**
 * SmartComp Mobile — REST client.
 *
 * Talks to the SmartComp web backend via the same /api/* routes that
 * the web UI uses. Auth is PIN-based — the backend sets an HttpOnly
 * `smartcomp_auth` cookie on a successful POST /api/auth/login. The
 * mobile client captures the cookie value and stores it in
 * expo-secure-store, then sends it back as a `Cookie:` header on
 * subsequent requests.
 *
 * Native fetch in React Native does NOT persist cookies the way
 * browsers do, so we manage the cookie manually for reliability.
 */

import * as SecureStore from 'expo-secure-store'
import { getServerUrl } from './config'
import type { ApiResponse } from '@/types'

const AUTH_COOKIE_KEY = 'smartcomp.authCookie'
const USER_AGENT = 'SmartComp-Mobile/1.0 (React Native)'

let inMemoryCookie: string | null = null

export async function initAuthCookie(): Promise<void> {
  try {
    const stored = await SecureStore.getItemAsync(AUTH_COOKIE_KEY)
    if (stored) inMemoryCookie = stored
  } catch {
    // ignore
  }
}

export function getAuthCookie(): string | null {
  return inMemoryCookie
}

export async function setAuthCookie(cookie: string | null): Promise<void> {
  inMemoryCookie = cookie
  try {
    if (cookie) await SecureStore.setItemAsync(AUTH_COOKIE_KEY, cookie)
    else await SecureStore.deleteItemAsync(AUTH_COOKIE_KEY)
  } catch {
    // ignore
  }
}

function extractCookie(setCookieHeader: string | null | undefined): string | null {
  if (!setCookieHeader) return null
  // The Set-Cookie header may contain multiple cookies separated by commas.
  // We only care about the smartcomp_auth cookie value.
  const parts = setCookieHeader.split(/,\s*(?=[A-Za-z0-9_-]+=)/)
  for (const p of parts) {
    const match = p.match(/^smartcomp_auth=([^;]+)/)
    if (match) return `smartcomp_auth=${match[1]}`
  }
  // Fallback: if backend didn't set the cookie by name (shouldn't happen
  // but be defensive), grab the first cookie's name=value.
  const first = parts[0] || setCookieHeader
  const m = first.match(/^([^=]+=[^;]+)/)
  return m ? m[1]! : null
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
  rawResponse?: boolean
  /** Skip auth cookie (used by the login call itself). */
  skipAuth?: boolean
  timeoutMs?: number
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function buildUrl(base: string, path: string, query?: RequestOptions['query']): string {
  let url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  if (query) {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      sp.append(k, String(v))
    }
    const qs = sp.toString()
    if (qs) url += `?${qs}`
  }
  return url
}

/**
 * Core request function. Returns parsed JSON or throws ApiError.
 */
export async function apiRequest<T = unknown>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const base = await getServerUrl()
  const url = buildUrl(base, path, opts.query)

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
  }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (!opts.skipAuth && inMemoryCookie) {
    headers['Cookie'] = inMemoryCookie
  }

  const controller = new AbortController()
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  if (opts.timeoutMs) {
    timeoutHandle = setTimeout(() => controller.abort(), opts.timeoutMs)
  }
  const signal = opts.signal ?? controller.signal

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal,
    })

    // Capture auth cookie from Set-Cookie header (if present).
    // On React Native, `res.headers.get('set-cookie')` returns the raw
    // comma-joined string. iOS/Android behave differently — we normalize
    // both cases.
    const setCookie =
      res.headers.get('set-cookie') ||
      // @ts-expect-error — RN sometimes exposes headers as a map.
      (typeof res.headers === 'object' && res.headers ? res.headers.map?.['set-cookie'] : null) ||
      // @ts-expect-error — alternate RN headers shape.
      (res.headers as any)?.map?.['Set-Cookie']
    if (setCookie) {
      const c = extractCookie(setCookie)
      if (c) await setAuthCookie(c)
    }

    if (opts.rawResponse) {
      const buf = await res.arrayBuffer()
      return buf as unknown as T
    }

    const text = await res.text()
    let body: unknown = undefined
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }

    if (!res.ok) {
      const msg =
        (body && typeof body === 'object' && 'error' in body
          ? String((body as any).error)
          : `HTTP ${res.status}`) || `HTTP ${res.status}`
      throw new ApiError(msg, res.status, body)
    }

    return body as T
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

/**
 * GET helper. Auth cookie is automatically attached.
 */
export async function apiGet<T = unknown>(
  path: string,
  query?: RequestOptions['query'],
  opts: Omit<RequestOptions, 'method' | 'body' | 'query'> = {}
): Promise<T> {
  return apiRequest<T>(path, { ...opts, method: 'GET', query })
}

/**
 * POST helper.
 */
export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
  opts: Omit<RequestOptions, 'method' | 'body' | 'query'> = {}
): Promise<T> {
  return apiRequest<T>(path, { ...opts, method: 'POST', body })
}

/**
 * PUT helper.
 */
export async function apiPut<T = unknown>(
  path: string,
  body?: unknown,
  opts: Omit<RequestOptions, 'method' | 'body' | 'query'> = {}
): Promise<T> {
  return apiRequest<T>(path, { ...opts, method: 'PUT', body })
}

/**
 * DELETE helper.
 */
export async function apiDelete<T = unknown>(
  path: string,
  opts: Omit<RequestOptions, 'method' | 'body' | 'query'> = {}
): Promise<T> {
  return apiRequest<T>(path, { ...opts, method: 'DELETE' })
}

/**
 * Build a typed ApiResponse wrapper for components that want both
 * data and error in one object.
 */
export async function safeApi<T>(
  fn: () => Promise<T>
): Promise<ApiResponse<T>> {
  try {
    const data = await fn()
    return { data, status: 200 }
  } catch (e: any) {
    return {
      error: e?.message || 'Network error',
      status: e?.status || 0,
    }
  }
}
