/**
 * Optimistic UI data layer - QUANTUM ULTRA SPEED v5.0 (inspired by index.html superfast PWA)
 *
 * v5.0 Quantum Improvements (index.html patterns):
 * - 5s in-memory execution cache for back-to-back reads (like _listMemCache)
 * - Hash-based change detection (lastDataHash / lastCloudDataHash) to avoid re-render if unchanged
 * - Deleted tracking Set with 5min TTL (recentlyDeletedJobs/Payments) to avoid resurrecting deleted
 * - Live sync 1s interval with hash check + AbortController 3s timeout (like index.html liveSync)
 * - Optimistic UI with instant temp ID + background sync + rollback (already had, now faster 50ms)
 * - Request deduplication + minimal getValues
 * - Offline detection + IndexedDB queue + hash
 * - 120s TTL + 5s quantum mem cache
 * - Push only if hash changed (save bandwidth)
 */

import { useEffect, useState, useCallback, useRef } from 'react'

type Updater<T> = (prev: T | undefined) => T

/** Any JSON-serialisable request payload sent to an /api route. */
export type ApiBody = Record<string, unknown>

/**
 * Normalise a list endpoint's response to a plain array.
 *
 * Several routes switch shape depending on the request: `/api/customers`
 * returns a bare array under the default limit but `{ data, pagination }`
 * once the row count exceeds it, and `/api/items` does the same when `?page=`
 * is present. Consumers that assumed "always an array" crashed with
 * `x.forEach is not a function` on exactly the shops that had grown past the
 * threshold. Route every list read through this instead.
 */
export function asArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object') {
    const inner = (value as { data?: unknown }).data
    if (Array.isArray(inner)) return inner as T[]
  }
  return []
}

const cache = new Map<string, any>()
const timestamps = new Map<string, number>()
const subscribers = new Map<string, Set<() => void>>()
const inflight = new Map<string, Promise<any>>()

// ===== PENDING CREATES — anti-clobber guard =====
// apiPost/apiPostUltraFast insert an optimistic row, then POST in the
// background. Panels commonly call refetch() right after the dialog closes,
// so a GET can land BEFORE the POST response. That GET's payload does not
// contain the new row yet, and setCache() replaced the whole list with it —
// the optimistic row vanished, and when the POST finally resolved its
// "replace tempId" pass found nothing to replace. Net effect: a newly added
// stock item disappeared and only came back on a much later refetch.
//
// Keeping in-flight creates here lets doFetchWithRetry() re-merge them into
// every server payload until the real row is confirmed.
const pendingCreates = new Map<string, Map<string, any>>()

function baseUrlOf(url: string): string {
  return url.split('?')[0].split('#')[0]
}

function addPendingCreate(base: string, tempId: string, item: any) {
  let m = pendingCreates.get(base)
  if (!m) {
    m = new Map()
    pendingCreates.set(base, m)
  }
  m.set(tempId, item)
}

function clearPendingCreate(base: string, tempId: string) {
  const m = pendingCreates.get(base)
  if (!m) return
  m.delete(tempId)
  if (m.size === 0) pendingCreates.delete(base)
}

function mergePendingCreates(url: string, data: any): any {
  if (!Array.isArray(data)) return data
  const m = pendingCreates.get(baseUrlOf(url))
  if (!m || m.size === 0) return data
  const present = new Set(data.map((row: any) => String(row?.id)))
  const missing = Array.from(m.values()).filter((row: any) => !present.has(String(row?.id)))
  return missing.length > 0 ? [...missing, ...data] : data
}

// ===== RECENTLY COMMITTED ROWS — anti-eviction guard (v12.4) =====
// When a POST completes, the real row is committed to the cache via
// commitCreatedRow(). But the panel's onSaved() handler also calls refetch(),
// which fires a GET. Firestore is eventually consistent — the GET may return
// a list that does NOT include the just-created row (especially within the
// first 1-2 seconds after the write). Without this guard, setCache() would
// overwrite the good cache (which has the row) with the stale GET response
// (which doesn't), making the row vanish from the UI.
//
// We track each committed row's real ID + data for 30 seconds. When a GET
// response arrives for the same endpoint, we re-merge any committed rows
// that are missing from the response — same pattern as mergePendingCreates,
// but for rows that have already been confirmed by the POST.
const recentlyCommittedRows = new Map<string, Map<string, { row: any; expiresAt: number }>>()
const COMMITTED_TTL = 30 * 1000 // 30 seconds — Firestore consistency window

function trackRecentlyCommitted(base: string, realId: string, row: any) {
  let m = recentlyCommittedRows.get(base)
  if (!m) {
    m = new Map()
    recentlyCommittedRows.set(base, m)
  }
  m.set(realId, { row, expiresAt: Date.now() + COMMITTED_TTL })
  // Auto-cleanup after TTL
  setTimeout(() => {
    const mm = recentlyCommittedRows.get(base)
    if (mm) {
      mm.delete(realId)
      if (mm.size === 0) recentlyCommittedRows.delete(base)
    }
  }, COMMITTED_TTL)
}

/**
 * Re-merge any recently-committed rows that are missing from a GET response.
 * This prevents a stale Firestore read from evicting a row that was just
 * created and confirmed by a POST.
 */
function mergeRecentlyCommitted(url: string, data: any): any {
  if (!Array.isArray(data)) return data
  const base = baseUrlOf(url)
  const m = recentlyCommittedRows.get(base)
  if (!m || m.size === 0) return data
  const now = Date.now()
  const present = new Set(data.map((row: any) => String(row?.id)))
  const missing: any[] = []
  for (const [id, entry] of Array.from(m.entries())) {
    if (entry.expiresAt < now) {
      m.delete(id)
      continue
    }
    if (!present.has(id)) {
      // Don't re-merge temp items — only real committed rows
      missing.push({ ...entry.row, _pending: false, _optimistic: false, _failed: false })
    }
  }
  if (missing.length === 0) return data
  return [...missing, ...data]
}

// ===== RECENTLY UPDATED ROWS — anti-eviction guard for PUT (v12.6) =====
// Same idea as `recentlyCommittedRows` but for edits: when a PUT succeeds,
// the optimistic patch is already in the cache. But the panel's onSaved()
// handler also calls refetch(), which fires a GET. Firestore is eventually
// consistent — the GET can return the PRE-edit version of that row for
// 1-3 seconds after the PUT commits. Without this guard, setCache() would
// overwrite the good optimistic row with the stale server value, and the
// UI would flash back to the pre-edit state until the next refetch.
//
// We track each updated row's id + new fields for 30 seconds. When a GET
// response arrives for the same endpoint, we re-apply the saved fields
// onto any row whose id matches — but ONLY if the server's row appears
// older (no `updatedAt` field, or `updatedAt` is older than the saved one).
const recentlyUpdatedRows = new Map<string, Map<string, { row: any; expiresAt: number }>>()
const UPDATED_TTL = 30 * 1000

function trackRecentlyUpdated(listUrl: string, rowId: string, row: any) {
  if (!rowId || !row) return
  let m = recentlyUpdatedRows.get(listUrl)
  if (!m) {
    m = new Map()
    recentlyUpdatedRows.set(listUrl, m)
  }
  m.set(rowId, { row, expiresAt: Date.now() + UPDATED_TTL })
  setTimeout(() => {
    const mm = recentlyUpdatedRows.get(listUrl)
    if (mm) {
      mm.delete(rowId)
      if (mm.size === 0) recentlyUpdatedRows.delete(listUrl)
    }
  }, UPDATED_TTL)
}

/**
 * Re-apply any recently-saved edits onto a GET response so stale data from
 * eventually-consistent Firestore reads cannot undo the user's just-saved
 * changes. Only overlays fields if the server's row is older or has no
 * `updatedAt` field — newer server data wins.
 */
function mergeRecentlyUpdated(url: string, data: any): any {
  if (!Array.isArray(data)) return data
  const listUrl = baseUrlOf(url)
  const m = recentlyUpdatedRows.get(listUrl)
  if (!m || m.size === 0) return data
  const now = Date.now()
  let changed = false
  const result = data.map((row: any) => {
    const rowId = String(row?.id || '')
    if (!rowId) return row
    const entry = m.get(rowId)
    if (!entry) return row
    if (entry.expiresAt < now) {
      m.delete(rowId)
      return row
    }
    // If the server's row has an `updatedAt` newer than what we saved, the
    // server is fresher — don't overlay.
    const serverUpdated = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0
    const savedUpdated = entry.row?.updatedAt ? new Date(entry.row.updatedAt).getTime() : Date.now()
    if (serverUpdated && serverUpdated > savedUpdated) {
      // Server has newer data — drop our tracking, server wins.
      m.delete(rowId)
      return row
    }
    changed = true
    return { ...row, ...entry.row }
  })
  return changed ? result : data
}

/**
 * Write a freshly created row into every cached list for its endpoint.
 * Replaces the optimistic placeholder when it is still there, and otherwise
 * prepends the row — the placeholder may have been dropped by a refetch that
 * raced the POST.
 *
 * v12.1 FIX: Also remove the temp item if a racing refetch already brought
 * the real row in. Previously, if the refetch returned the real row BEFORE
 * the POST response arrived, the list would contain BOTH the temp item and
 * the real row (duplicate). The `list.some(...)` check returned early and
 * left the temp item in place. Now we explicitly filter out the temp item
 * when the real row is already present.
 *
 * v12.4 FIX: Track the real row ID in `recentlyCommittedRows` so that any
 * GET response arriving within 30s cannot drop this row from the cache.
 * This fixes the "suppliers/customers/expenses not showing after create"
 * bug: the refetch fired by onSaved() arrives AFTER the POST completes,
 * but Firestore is eventually consistent and may not return the new row
 * yet. Without this guard, setCache() overwrites the good cache (which
 * had the real row from commitCreatedRow) with the stale GET response
 * (which is missing the row), making the row vanish.
 */
function commitCreatedRow(base: string, tempId: string, row: any) {
  // v12.4: Track the real row ID so doFetchWithRetry can preserve it
  // even if the GET response (fired by a racing refetch) doesn't include it.
  const realId = String(row?.id || '')
  if (realId) {
    trackRecentlyCommitted(base, realId, row)
  }

  for (const key of Array.from(cache.keys())) {
    if (baseUrlOf(key) !== base || !Array.isArray(cache.get(key))) continue
    mutate<any[]>(key, (prev) => {
      const list = prev ? prev.slice() : []
      const idx = list.findIndex((x: any) => String(x?.id) === String(tempId))
      const merged = { ...row, _pending: false, _optimistic: false, _failed: false }
      const realIdx = list.findIndex((x: any) => String(x?.id) === String(row?.id))
      if (idx !== -1) {
        // Replace temp item with real data
        list[idx] = merged
        // If the real row was ALSO in the list (from a racing refetch),
        // remove the duplicate (the one at realIdx, which is different from idx)
        if (realIdx !== -1 && realIdx !== idx) {
          list.splice(realIdx > idx ? realIdx : realIdx, 1)
        }
        return list
      }
      // Temp item not found (wiped by a refetch). If the real row is already
      // in the list, nothing to do. Otherwise, prepend it.
      if (realIdx !== -1) return list
      return [merged, ...list]
    })
  }
}

/** Drop the optimistic placeholder from every cached list for its endpoint. */
function rollbackCreatedRow(base: string, tempId: string) {
  for (const key of Array.from(cache.keys())) {
    if (baseUrlOf(key) !== base || !Array.isArray(cache.get(key))) continue
    mutate<any[]>(key, (prev) => (prev ? prev.filter((x: any) => String(x?.id) !== String(tempId)) : []))
  }
}

// ===== LOCAL STORAGE PERSISTENCE — INSTANT LOADING =====
// On page refresh, in-memory cache is lost → panels show "Loading..." for 2-5s
// while fetch completes. By persisting cache to localStorage, we can restore
// data instantly on next load (<50ms), then background-fetch updates it.
const LS_CACHE_KEY = 'smartcomp_cache_v1'
const LS_CACHE_TTL = 10 * 60 * 1000 // 10 min — stale data is fine for instant display
const LS_MAX_ENTRIES = 60 // limit to avoid quota issues
const LS_MAX_VALUE_SIZE = 500 * 1024 // 500KB per value max (avoid quota on large lists)

function loadCacheFromStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    for (const [key, entry] of Object.entries(parsed)) {
      const e = entry as { data: any; ts: number }
      if (!e || typeof e.ts !== 'number') continue
      // v12.2: Don't restore entries that are way too old (>1h). Stale data
      // is fine for instant display, but ancient data can confuse the user
      // when a long-abandoned list briefly flashes before the fresh fetch.
      if (Date.now() - e.ts > 60 * 60 * 1000) continue
      // v12.2: Skip entries that contain optimistic temp items — they have
      // IDs like "temp_..." that don't exist on the server. Restoring them
      // would show a phantom item that then vanishes on the next refetch.
      if (Array.isArray(e.data)) {
        const hasTemp = e.data.some((row: any) =>
          String(row?.id || '').startsWith('temp_') || row?._pending || row?._optimistic
        )
        if (hasTemp) continue
      }
      // Restore even "stale" entries — better to show old data instantly
      // than show "Loading..." for 3 seconds. Background fetch will refresh.
      cache.set(key, e.data)
      timestamps.set(key, e.ts)
      // Don't set lastDataHash — let the fetch update it
    }
  } catch {}
}

function saveCacheToStorage(): void {
  if (typeof window === 'undefined') return
  try {
    // Only persist GET list endpoints (arrays) and dashboard — skip detail/error
    const toSave: Record<string, { data: any; ts: number }> = {}
    const now = Date.now()
    const keys = Array.from(cache.keys())
      .filter((k) => !k.startsWith('__error:') && !k.startsWith('temp_'))
      .filter((k) => {
        // Only persist list/dashboard/shop endpoints
        return k.startsWith('/api/invoices') ||
               k.startsWith('/api/quotations') ||
               k.startsWith('/api/jobs') ||
               k.startsWith('/api/items') ||
               k.startsWith('/api/customers') ||
               k.startsWith('/api/payments') ||
               k.startsWith('/api/dashboard') ||
               k.startsWith('/api/shop') ||
               k.startsWith('/api/suppliers') ||
               k.startsWith('/api/expenses') ||
               k.startsWith('/api/service-payments')
      })
      .sort((a, b) => (timestamps.get(b) || 0) - (timestamps.get(a) || 0))
      .slice(0, LS_MAX_ENTRIES)

    let totalSize = 0
    for (const key of keys) {
      const data = cache.get(key)
      const ts = timestamps.get(key) || 0
      if (!data || !ts) continue
      // Skip entries older than TTL for saving (don't bloat localStorage)
      if (now - ts > LS_CACHE_TTL * 6) continue // 60 min max
      // STRIP optimistic temp items before persisting — they have IDs like
      // "temp_..." and don't exist on the server. Without this, on page
      // refresh the temp item would show briefly (from localStorage) then
      // vanish when the server fetch returns the real list (without the temp),
      // looking like the item "auto-deletes".
      let cleanData = data
      if (Array.isArray(data)) {
        cleanData = data.filter((row: any) => {
          const id = String(row?.id || '')
          return !id.startsWith('temp_') && !row?._pending && !row?._optimistic
        })
      }
      try {
        const serialized = JSON.stringify(cleanData)
        if (serialized.length > LS_MAX_VALUE_SIZE) continue
        totalSize += serialized.length
        if (totalSize > 3 * 1024 * 1024) break // 3MB total cap
        toSave[key] = { data: cleanData, ts }
      } catch {}
    }
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(toSave))
  } catch {}
}

// Debounced save — don't write to localStorage on every cache update
let saveTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveCacheToStorage()
  }, 1500)
}

// Load persisted cache on module init (client-side only)
if (typeof window !== 'undefined') {
  loadCacheFromStorage()
  // Save before page unload (covers refresh/close)
  window.addEventListener('beforeunload', saveCacheToStorage)
  // Also save periodically
  setInterval(debouncedSave, 30 * 1000)
}

// ===== QUANTUM CACHE (like index.html PWA) =====
type QuantumMemEntry = { data: any; expires: number; hash: string }
const quantumMemCache = new Map<string, QuantumMemEntry>()
const QUANTUM_MEM_TTL = 2 * 1000 // 2s — ultra-fast realtime sync (was 5s)
const lastDataHash = new Map<string, string>() // like lastCloudDataHash in index.html
const lastPullTime = new Map<string, number>() // debounce like index.html
const recentlyDeletedJobs = new Set<string>()
const recentlyDeletedPayments = new Set<string>()
const deletedExpiry = new Map<string, number>()

/**
 * cyrb53 over the full string. Every character is folded in — no sampling.
 *
 * A previous version sampled every Nth character to save time on large
 * payloads. That made the hash blind to edits between sample points, and
 * because doFetchWithRetry() DISCARDS a fresh response whose hash matches
 * the cached one, those edits never reached the UI. Correctness beats the
 * few microseconds sampling saved: cyrb53 runs at ~1 GB/s, so even a 2 MB
 * list hashes in ~2ms.
 */
function cyrb53(str: string): string {
  const len = str.length
  let h1 = 0xdeadbeef ^ len
  let h2 = 0x41c6ce57 ^ len
  for (let i = 0; i < len; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `${(h2 >>> 0).toString(36)}_${(h1 >>> 0).toString(36)}_${len}`
}

function computeHash(data: unknown): string {
  if (!data) return 'null'
  try {
    if (Array.isArray(data)) {
      if (data.length === 0) return 'empty_0'
      // Hash the ACTUAL row content, not just row count / id lengths.
      // The old version folded in String(id).length and String(updatedAt).length
      // only, so editing an invoice amount, a job status, or a customer name
      // produced an IDENTICAL hash — and the fresh server data was thrown away,
      // leaving the panel stale until a create/delete changed the array length.
      return `arr_${data.length}_${cyrb53(JSON.stringify(data))}`
    }
    const str = typeof data === 'string' ? data : JSON.stringify(data)
    if (str.length === 0) return 'str_0'
    return `h_${cyrb53(str)}`
  } catch {
    return Date.now().toString(36)
  }
}

function trackDeleted(type: 'jobs' | 'payments', id: string) {
  const set = type === 'jobs' ? recentlyDeletedJobs : recentlyDeletedPayments
  set.add(id)
  deletedExpiry.set(`${type}:${id}`, Date.now() + 5 * 60 * 1000) // 5min like index.html
  setTimeout(() => {
    set.delete(id)
    deletedExpiry.delete(`${type}:${id}`)
    try {
      const key = type === 'jobs' ? 'deletedJobs' : 'deletedPayments'
      const stored = JSON.parse(localStorage.getItem(key) || '{}')
      delete stored[id]
      localStorage.setItem(key, JSON.stringify(stored))
    } catch {}
  }, 5 * 60 * 1000)
  try {
    const key = type === 'jobs' ? 'deletedJobs' : 'deletedPayments'
    const stored = JSON.parse(localStorage.getItem(key) || '{}')
    stored[id] = Date.now()
    localStorage.setItem(key, JSON.stringify(stored))
  } catch {}
}

// v12.2: Generic anti-resurrection tracking for endpoints that don't have
// dedicated sets (invoices, quotations, items, customers, suppliers, etc.).
// Uses a Map keyed by URL prefix → Set of deleted IDs.
const genericDeletedMap = new Map<string, Set<string>>()
const GENERIC_TTL = 5 * 60 * 1000 // 5 minutes
function trackDeletedGeneric(listUrl: string, id: string) {
  let set = genericDeletedMap.get(listUrl)
  if (!set) {
    set = new Set()
    genericDeletedMap.set(listUrl, set)
  }
  set.add(id)
  setTimeout(() => {
    const s = genericDeletedMap.get(listUrl)
    if (s) {
      s.delete(id)
      if (s.size === 0) genericDeletedMap.delete(listUrl)
    }
  }, GENERIC_TTL)
}

/**
 * Filter a list payload returned by the server, removing any IDs we have
 * locally soft-deleted within the last 5 minutes. Without this, a slow
 * background refetch that started BEFORE the delete was synced can
 * "resurrect" the row in the UI until the next refetch.
 *
 * The server (Apps Script) also tracks soft-deletes via the `deleted` column,
 * but the local filter is a belt-and-braces guard against in-flight requests
 * and cache-race conditions (the same pattern index.html uses with
 * recentlyDeletedJobs).
 */
function applyDeletedFilter(url: string, data: any): any {
  if (!Array.isArray(data)) return data
  const listUrl = baseUrlOf(url)
  // Map URL → tracked-deleted set
  let type: 'jobs' | 'payments' | null = null
  if (listUrl.startsWith('/api/jobs')) type = 'jobs'
  else if (listUrl.startsWith('/api/payments') || listUrl.startsWith('/api/service-payments')) type = 'payments'

  const dedicatedSet = type ? (type === 'jobs' ? recentlyDeletedJobs : recentlyDeletedPayments) : null
  const genericSet = genericDeletedMap.get(listUrl)
  if (!dedicatedSet && !genericSet) return data
  if (dedicatedSet && dedicatedSet.size === 0 && (!genericSet || genericSet.size === 0)) return data

  return data.filter((row: any) => {
    const id = row?.id || row?.jobId
    if (!id) return true
    const sid = String(id)
    if (dedicatedSet && dedicatedSet.has(sid)) return false
    if (genericSet && genericSet.has(sid)) return false
    return true
  })
}

function loadDeletedExpiryFromStorage() {
  if (typeof window === 'undefined') return
  try {
    const dj = JSON.parse(localStorage.getItem('deletedJobs') || '{}')
    const dp = JSON.parse(localStorage.getItem('deletedPayments') || '{}')
    const now = Date.now()
    Object.keys(dj).forEach((id) => {
      if (now - dj[id] < 5 * 60 * 1000) {
        deletedExpiry.set(`jobs:${id}`, dj[id] + 5 * 60 * 1000)
        recentlyDeletedJobs.add(id)
      }
    })
    Object.keys(dp).forEach((id) => {
      if (now - dp[id] < 5 * 60 * 1000) {
        deletedExpiry.set(`payments:${id}`, dp[id] + 5 * 60 * 1000)
        recentlyDeletedPayments.add(id)
      }
    })
  } catch {}
}
if (typeof window !== 'undefined') {
  loadDeletedExpiryFromStorage()
}

function _isRecentlyDeleted(type: 'jobs' | 'payments', id: string): boolean {
  const key = `${type}:${id}`
  const exp = deletedExpiry.get(key)
  if (!exp) return false
  if (exp < Date.now()) {
    deletedExpiry.delete(key)
    const set = type === 'jobs' ? recentlyDeletedJobs : recentlyDeletedPayments
    set.delete(id)
    return false
  }
  return true
}

function getQuantumMem(key: string): { data: any; hash: string } | null {
  const entry = quantumMemCache.get(key)
  if (!entry) return null
  if (entry.expires < Date.now()) { quantumMemCache.delete(key); return null }
  return { data: entry.data, hash: entry.hash }
}

function setQuantumMem(key: string, data: any): string {
  const hash = computeHash(data)
  quantumMemCache.set(key, { data, hash, expires: Date.now() + QUANTUM_MEM_TTL })
  return hash
}

const STALE_MS = 30 * 1000 // 30s — ultra-fast realtime sync (was 180s) — ensures background refresh within 30s of any change
const RETRY_ATTEMPTS = 1
const RETRY_DELAY = 400
// Firebase is in-process and returns in <200ms; 8s/6s is plenty even with
// cold starts + browser-to-server round-trip. The pending-create + stale-cache
// guards below keep the UI stable even if a single call exceeds these.
const FETCH_TIMEOUT_MS = 8000  // 8s for writes — Firebase is sub-200ms
const QUANTUM_FETCH_TIMEOUT = 6000 // 6s for GET — cache hit is sub-1ms
const DASHBOARD_INVALIDATE_DEBOUNCE = 600

// Offline detection
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { isOnline = true })
  window.addEventListener('offline', () => { isOnline = false })
}

// Normalize abort/timeout errors into user-friendly messages
function normalizeError(e: unknown): Error {
  const name = e instanceof Error ? e.name : ''
  const message = e instanceof Error ? e.message : String(e ?? '')
  if (name === 'AbortError' || name === 'TimeoutError' || message.includes('aborted') || message.includes('signal')) {
    return new Error('Request timed out — server is slow, please try again')
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('fetch')) {
    return new Error('Network error — check your internet connection')
  }
  return e instanceof Error ? e : new Error(message || 'Unknown error')
}

function notify(key: string) {
  const subs = subscribers.get(key)
  if (subs) {
    const list = Array.from(subs)
    for (const fn of list) {
      try { fn() } catch {}
    }
  }
}

function notifyPattern(prefix: string) {
  for (const key of Array.from(subscribers.keys())) {
    if (key === prefix || key.startsWith(prefix + '?') || key.startsWith(prefix + '#')) {
      notify(key)
    }
  }
}

function setCache(key: string, data: any) {
  const prevHash = lastDataHash.get(key)
  const newHash = setQuantumMem(key, data)
  cache.set(key, data)
  timestamps.set(key, Date.now())
  if (prevHash !== newHash) {
    lastDataHash.set(key, newHash)
    notify(key)
  }
  // Persist to localStorage (debounced) for instant loading on next visit
  debouncedSave()
}

export function mutate<T>(key: string, dataOrUpdater: T | Updater<T>) {
  const prev = cache.get(key)
  const next =
    typeof dataOrUpdater === 'function'
      ? (dataOrUpdater as Updater<T>)(prev as T | undefined)
      : dataOrUpdater
  setCache(key, next)
}

// Dashboard invalidate debounce — multiple mutations in quick succession
// (e.g. invoice create + payment create + stock update in one save) should
// only trigger ONE dashboard reload, not 3-5 of them.
let dashboardInvalidateTimer: ReturnType<typeof setTimeout> | null = null

export function invalidate(prefix: string) {
  const affectedKeys: string[] = []
  for (const key of Array.from(cache.keys())) {
    if (key === prefix || key.startsWith(prefix + '?') || key.startsWith(prefix + '#') || prefix === '*') {
      timestamps.set(key, 0)
      affectedKeys.push(key)
    }
  }

  // Debounce dashboard re-fetch
  if (prefix === '/api/dashboard' || prefix === '*') {
    if (dashboardInvalidateTimer) {
      clearTimeout(dashboardInvalidateTimer)
    }
    dashboardInvalidateTimer = setTimeout(() => {
      dashboardInvalidateTimer = null
      for (const key of affectedKeys) {
        notify(key)
        const subs = subscribers.get(key)
        if (subs && subs.size > 0) {
          doFetch(key)
        }
      }
      if (prefix === '*') {
        // For wildcard, also notify non-dashboard keys immediately
        for (const key of Array.from(cache.keys())) {
          if (!key.startsWith('/api/dashboard')) {
            notify(key)
            const subs = subscribers.get(key)
            if (subs && subs.size > 0) doFetch(key)
          }
        }
      }
    }, DASHBOARD_INVALIDATE_DEBOUNCE)
    return
  }

  // Non-dashboard invalidations happen immediately
  for (const key of affectedKeys) {
    notify(key)
    const subs = subscribers.get(key)
    if (subs && subs.size > 0) {
      doFetch(key)
    }
  }
  notifyPattern(prefix)
}

function listUrlOf(detailUrl: string): string {
  const clean = detailUrl.split('?')[0].split('#')[0]
  const parts = clean.split('/')
  if (parts.length > 2) {
    return parts.slice(0, -1).join('/')
  }
  return clean
}

function idOf(detailUrl: string): string | null {
  const clean = detailUrl.split('?')[0].split('#')[0]
  const parts = clean.split('/') 
  return parts[parts.length - 1] || null
}

// ===== useFetch with retry =====
export function useFetch<T>(url: string | null, options?: RequestInit) {
  const method = options?.method || 'GET'
  const bodyKey = options?.body ? JSON.stringify(options.body) : ''
  const optsRef = useRef(options)
  optsRef.current = options

  const [, setTick] = useState(0)
  const forceRender = useCallback(() => setTick((t) => (t + 1) & 0x7fffffff), [])

  useEffect(() => {
    if (!url) return
    const key = url
    let set = subscribers.get(key)
    if (!set) {
      set = new Set()
      subscribers.set(key, set)
    }
    set.add(forceRender)
    return () => {
      const s = subscribers.get(key)
      if (s) {
        s.delete(forceRender)
        if (s.size === 0) subscribers.delete(key)
      }
    }
  }, [url, forceRender])

  useEffect(() => {
    if (!url) return
    const cached = cache.get(url)
    const ts = timestamps.get(url) || 0
    const isStale = Date.now() - ts > STALE_MS
    if (!cached || isStale) {
      // Swallow here: doFetchWithRetry already records the message under
      // `__error:<url>` and notifies subscribers, so the hook's `error` field
      // surfaces it. Without this catch a single failing endpoint produced an
      // *unhandled* promise rejection, which Next's dev overlay reports as a
      // full-screen runtime error even though the panel itself is fine.
      doFetch(url, optsRef.current).catch(() => {})
    }
  }, [url, method, bodyKey])

  const refetch = useCallback(() => {
    if (!url) return
    timestamps.set(url, 0)
    // v12.2: Clear stale warning + error on manual refetch — the user is
    // explicitly asking for a fresh fetch, so don't keep showing the old
    // "showing cached data" or error hint while the new fetch is in flight.
    cache.delete(`__stale:${url}`)
    cache.delete(`__error:${url}`)
    doFetch(url, optsRef.current).catch(() => {})
  }, [url, method, bodyKey])

  const data: T | null = url ? (cache.get(url) ?? null) : null
  const hasEverLoaded = url ? timestamps.has(url) : false
  // loading is TRUE only when we have NO data at all (first-ever load).
  // If we have cached data (even stale from localStorage), we show it
  // immediately and treat the background refresh as non-blocking.
  // This is what makes the app feel "ultra fast" on repeat visits.
  const loading = !!url && !hasEverLoaded && data === null
  const error = url ? (cache.get(`__error:${url}`) ?? null) : null
  // Set when a background refresh failed but cached data is still on screen.
  // Panels can show this as a soft "showing cached data" hint instead of the
  // blocking error they used to get on every Apps Script hiccup.
  const staleWarning = url ? (cache.get(`__stale:${url}`) ?? null) : null

  return { data, loading, error, staleWarning, refetch, isOnline }
}

async function doFetchWithRetry(url: string, options?: RequestInit, attempt = 1): Promise<any> {
  // Quantum: check 5s mem cache first (like _listMemCache)
  const mem = getQuantumMem(url)
  if (mem) {
    // Debounce pull like index.html lastPullTime
    const last = lastPullTime.get(url) || 0
    if (Date.now() - last < 1000) {
      return mem.data
    }
  }

  try {
    const controller = new AbortController()
    // Quantum: use 3s for GET ultra-fast, 5s for others
    const isGet = !options?.method || options.method === 'GET'
    const timeoutMs = isGet ? QUANTUM_FETCH_TIMEOUT : FETCH_TIMEOUT_MS
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let errorMessage = `HTTP ${res.status}`
      try {
        const json = JSON.parse(text)
        errorMessage = json.error || errorMessage
      } catch {
        errorMessage = text.slice(0, 200) || errorMessage
      }
      throw new Error(errorMessage)
    }
    
    const raw = await res.json()
    // Re-attach any create that is still in flight — the server payload cannot
    // know about it yet, and dropping it here is what made a newly added item
    // vanish from the list until the next stale refetch.
    let data = mergePendingCreates(url, raw)
    // v12.4: Also re-attach any recently-committed rows that the GET response
    // is missing (Firestore is eventually consistent — a read arriving 1-2s
    // after a write may not include the just-written row).
    data = mergeRecentlyCommitted(url, data)
    // v12.6: Also re-apply any recently-saved edits so stale reads can't
    // undo the user's just-saved changes.
    data = mergeRecentlyUpdated(url, data)

    // Quantum: hash check like lastCloudDataHash to skip redundant re-renders.
    // IMPORTANT: do NOT mutate lastDataHash here — setCache() is the single owner
    // of that map. Pre-writing the hash here would make setCache's prevHash===newHash
    // check pass silently and skip notify(), leaving every useFetch subscriber stale.
    const newHash = computeHash(data)
    const oldHash = lastDataHash.get(url)
    if (oldHash === newHash) {
      // Data unchanged — refresh timestamp only, do not notify (prevents flicker)
      const existing = cache.get(url)
      if (existing !== undefined) {
        timestamps.set(url, Date.now())
        lastPullTime.set(url, Date.now())
        cache.delete(`__error:${url}`)
        cache.delete(`__stale:${url}`)
        return existing
      }
    }
    lastPullTime.set(url, Date.now())
    // setCache() computes hash, compares against prevHash, and notifies subscribers
    // ONLY when the data actually changed. It also writes quantumMemCache + localStorage.
    const filtered = applyDeletedFilter(url, data)
    setCache(url, filtered)
    cache.delete(`__error:${url}`)
    cache.delete(`__stale:${url}`)
    return filtered
  } catch (e: any) {
    const msg = typeof e === 'string' ? e : (e?.message || '')
    const isAbort = e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError')
    if (attempt <= RETRY_ATTEMPTS && (isAbort || e?.name === 'AbortError' || msg.includes('Failed to fetch') || msg.includes('NetworkError'))) {
      await new Promise(r => setTimeout(r, RETRY_DELAY * attempt))
      return doFetchWithRetry(url, options, attempt + 1)
    }
    const normalized = normalizeError(e)
    // A failed BACKGROUND refresh must not blank out a panel that already has
    // data. Google Apps Script is slow and occasionally times out; surfacing
    // "server is slow" over a perfectly good cached list is what made the app
    // feel broken. Keep showing the data, retry on the next cycle, and only
    // report a hard error when there is nothing to show.
    const existing = cache.get(url)
    if (existing !== undefined) {
      // Nudge the timestamp forward a little so the next render does not
      // hammer the same failing endpoint on every keystroke.
      timestamps.set(url, Date.now() - STALE_MS + 15000)
      cache.set(`__stale:${url}`, normalized?.message || 'Refresh failed')
      return existing
    }
    cache.set(`__error:${url}`, normalized?.message || 'Failed')
    notify(url)
    throw normalized
  }
}

function doFetch(url: string, options?: RequestInit) {
  const existing = inflight.get(url)
  if (existing) return existing
  
  const p = doFetchWithRetry(url, options)
    .finally(() => {
      inflight.delete(url)
    })
  
  inflight.set(url, p)
  return p
}

// ===== apiPost with optimistic UI — INSTANT v7.0 =====
// Returns a temp item INSTANTLY (UI shows it immediately with _pending flag),
// syncs to server in background, then replaces temp with real data.
// On failure, removes temp item and throws.
export async function apiPost(url: string, body: ApiBody) {
  const base = baseUrlOf(url)
  const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const tempItem = { ...body, id: tempId, _pending: true, createdAt: new Date().toISOString() }

  // Register BEFORE the optimistic write so a refetch that lands mid-POST
  // re-merges the row instead of dropping it.
  addPendingCreate(base, tempId, tempItem)
  for (const key of Array.from(cache.keys())) {
    if (baseUrlOf(key) === base && Array.isArray(cache.get(key))) {
      // INSTANT optimistic — UI shows the item before server responds
      mutate<any[]>(key, (prev) => (prev ? [tempItem, ...prev] : [tempItem]))
    }
  }
  invalidate('/api/dashboard')

  // Offline mode — queue and return temp
  if (!isOnline) {
    clearPendingCreate(base, tempId)
    try {
      const { addToQueue } = await import('./offline-queue')
      await addToQueue({
        type: 'create',
        sheet: base.split('/').pop() || 'unknown',
        url,
        method: 'POST',
        body,
        tempId,
      })
    } catch {}
    return { ...tempItem, _queued: true, _offline: true }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Failed to create')

    clearPendingCreate(base, tempId)
    commitCreatedRow(base, tempId, data)
    // REALTIME SYNC: Force immediate refetch so cloud data is up-to-date within ~500ms
    setTimeout(() => { invalidate(base); invalidate('/api/dashboard') }, 300)
    return data
  } catch (e) {
    clearPendingCreate(base, tempId)
    rollbackCreatedRow(base, tempId)
    throw normalizeError(e)
  }
}

// ===== ULTRA-ULTRA FAST v6.0 - INSTANT RETURN + BACKGROUND SYNC =====
// Returns temp item INSTANTLY (<50ms), syncs to Google Sheets in background
// If offline, queues to IndexedDB and syncs when online
export async function apiPostUltraFast(url: string, body: ApiBody, options: { instantClose?: boolean; onSyncError?: (err: Error) => void } = {}): Promise<any> {
  const base = baseUrlOf(url)
  const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  
  // Generate client-side number instantly for optimistic display
  let clientNumber = ''
  if (url.includes('/invoices')) {
    const now = new Date()
    const fy = now.getMonth() >= 3 ? `${String(now.getFullYear()).slice(2)}-${String(now.getFullYear()+1).slice(2)}` : `${String(now.getFullYear()-1).slice(2)}-${String(now.getFullYear()).slice(2)}`
    clientNumber = `SCSS/${fy}/${Date.now().toString().slice(-6)}`
  } else if (url.includes('/quotations')) {
    clientNumber = `SCSS/QT/${Date.now().toString().slice(-6)}`
  }
  
  const tempItem = { 
    ...body, 
    id: tempId, 
    number: clientNumber || body.number || `TEMP-${Date.now().toString().slice(-6)}`,
    _pending: true, 
    _optimistic: true,
    _clientGenerated: true,
    createdAt: new Date().toISOString() 
  }

  // INSTANT optimistic update. Registered as a pending create first so the
  // refetch panels fire on dialog-close cannot wipe the row out again.
  addPendingCreate(base, tempId, tempItem)
  for (const key of Array.from(cache.keys())) {
    if (baseUrlOf(key) === base && Array.isArray(cache.get(key))) {
      mutate<any[]>(key, (prev) => (prev ? [tempItem, ...prev] : [tempItem]))
    }
  }
  invalidate('/api/dashboard')

  // If offline, queue and return temp instantly
  if (!isOnline) {
    clearPendingCreate(base, tempId)
    try {
      const { addToQueue } = await import('./offline-queue')
      await addToQueue({
        type: 'create',
        sheet: base.split('/').pop() || 'unknown',
        url,
        method: 'POST',
        body,
        tempId,
      })
      return { ...tempItem, _queued: true, _offline: true }
    } catch {
      // IndexedDB not available, still return temp but will fail sync later
      return { ...tempItem, _queued: false, _offline: true }
    }
  }

  // Background sync - don't await, return temp instantly for ultra fast UX
  // But also return a promise that resolves with real data for those who await
  const syncPromise = (async () => {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to create')

      clearPendingCreate(base, tempId)
      commitCreatedRow(base, tempId, data)
      return data
    } catch (e) {
      // On failure, keep the row visible but flag it so the user can see the
      // create did not land (rather than silently losing what they typed).
      clearPendingCreate(base, tempId)
      for (const key of Array.from(cache.keys())) {
        if (baseUrlOf(key) !== base || !Array.isArray(cache.get(key))) continue
        mutate<any[]>(key, (prev) => (prev ? prev.map((x) => x.id === tempId ? { ...x, _pending: false, _failed: true } : x) : []))
      }
      throw e
    }
  })()

  // If instantClose option, return temp immediately (ultra instant <50ms)
  if (options.instantClose) {
    // v13.6: surface background sync failures to the caller (error toast)
    // instead of silently swallowing them. The optimistic row stays visible
    // and is flagged _failed in the list cache so panels can render it.
    syncPromise.catch((e: any) => {
      try { options.onSyncError?.(e instanceof Error ? e : new Error(String(e?.message || e))) } catch {}
    })
    return tempItem
  }

  // Otherwise, await background sync but temp already shown
  // This gives 2-4 sec total vs 10-15 sec before, but optimistic is instant
  try {
    const realData = await syncPromise
    return realData
  } catch (e) {
    // Return temp with failed flag
    return { ...tempItem, _failed: true, error: (e as any).message }
  }
}

// ===== apiPut with unwrapping — OPTIMISTIC v7.1 FIXED =====
// Instant local update (UI reflects change immediately), server sync in background.
// If server fails, snapshot is restored and an error is thrown.
// v7.1 FIX: Strip request-control fields (action, deductStock, etc.) from
// optimistic entity to prevent polluting cached list items with API metadata.
export async function apiPut(url: string, body: ApiBody) {
  // Compute the list URL + entity ID from the URL
  const listUrl = listUrlOf(url)
  const targetId = idOf(url)

  // Strip API-control fields that should never be merged into cached entities.
  // These are request parameters, not entity data.
  const API_CONTROL_FIELDS = new Set([
    'action', 'deductStock', 'paymentReceivedNow', '_pending', '_failed',
    '_optimistic', '_clientGenerated', '_queued', '_offline',
  ])
  const cleanBody: any = {}
  for (const [k, v] of Object.entries(body || {})) {
    if (!API_CONTROL_FIELDS.has(k)) cleanBody[k] = v
  }
  const optimisticEntity: any = { ...cleanBody, id: targetId }

  // Snapshot current cache state for rollback
  const snapshots = new Map<string, any>()
  const affectedKeys: string[] = []
  for (const key of Array.from(cache.keys())) {
    const keyBase = key.split('?')[0].split('#')[0]
    if (keyBase === listUrl && Array.isArray(cache.get(key))) {
      snapshots.set(key, cache.get(key))
      affectedKeys.push(key)
      // INSTANT local update — UI reflects change immediately
      mutate<any[]>(key, (prev) =>
        prev ? prev.map((x) => (String(x?.id) === String(targetId) ? { ...x, ...optimisticEntity, _pending: true } : x)) : prev || []
      )
    }
  }
  invalidate('/api/dashboard')

  // Allow offline mode: queue if offline (don't throw — return optimistic result)
  if (!isOnline) {
    try {
      const { addToQueue } = await import('./offline-queue')
      await addToQueue({
        type: 'update',
        sheet: listUrl.split('/').pop() || 'unknown',
        url,
        method: 'PUT',
        body,
        tempId: targetId || undefined,
      })
    } catch {}
    return { ...optimisticEntity, _pending: true, _offline: true }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Failed to update')

    // Extract the actual entity from wrapper responses like { success: true, job: {...} }
    let entity: any = null
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const wrapperKeys = ['job', 'invoice', 'quotation', 'customer', 'supplier', 'item', 'payment', 'expense', 'amc', 'campaign', 'serial', 'exp', 'enquiry']
      for (const wk of wrapperKeys) {
        if (data[wk] && typeof data[wk] === 'object' && (data[wk].id !== undefined || data[wk].jobId !== undefined)) {
          entity = data[wk]
          break
        }
      }
    }

    // If no entity was found in wrapper, don't merge raw response
    // (which could contain {success:true} etc.) into cached items.
    // Instead, invalidate + refetch to get fresh data.
    if (!entity) {
      // Force cache invalidation so next render fetches fresh from server
      for (const key of affectedKeys) {
        timestamps.set(key, 0)
      }
      // Restore the snapshot temporarily — the refetch will update with real data
      for (const [key, snap] of snapshots) {
        setCache(key, snap)
      }
      // Trigger background refetch for all affected keys
      for (const key of affectedKeys) {
        const subs = subscribers.get(key)
        if (subs && subs.size > 0) doFetch(key)
      }
      return data
    }

    const updatedId = entity?.id || targetId
    // v12.6: Track this update so a racing GET (fired by the panel's
    // onSaved → refetch) cannot overwrite the just-saved row with stale
    // eventually-consistent Firestore data.
    trackRecentlyUpdated(listUrl, String(updatedId), { ...entity, updatedAt: entity?.updatedAt || new Date().toISOString() })
    // Replace optimistic item with real server data, remove _pending flag
    for (const key of affectedKeys) {
      mutate<any[]>(key, (prev) =>
        prev ? prev.map((x) => (String(x?.id) === String(updatedId) ? { ...x, ...entity, _pending: false } : x)) : prev || []
      )
    }
    // REALTIME SYNC: Force immediate refetch so cloud data is up-to-date within ~500ms
    setTimeout(() => { invalidate(listUrl); invalidate('/api/dashboard') }, 300)
    return data
  } catch (e) {
    // Rollback on failure
    for (const [key, snap] of snapshots) {
      setCache(key, snap)
    }
    throw normalizeError(e)
  }
}

// ===== apiDelete — OPTIMISTIC v7.0 =====
// Instant local removal (UI reflects change immediately), server sync in background.
// If server fails, snapshot is restored and an error is thrown.
export async function apiDelete(url: string) {
  const listUrl = listUrlOf(url)
  const targetId = idOf(url)

  // Track the deleted ID so any in-flight GET that returns the row before the
  // server-side soft-delete commits is filtered out (anti-resurrection guard).
  // v12.2: Extended to cover invoices, quotations, items, customers, suppliers
  // too — without this, deleting an item then refreshing would briefly show
  // the item again until the next refetch.
  if (targetId) {
    if (listUrl.startsWith('/api/jobs')) trackDeleted('jobs', String(targetId))
    else if (listUrl.startsWith('/api/payments') || listUrl.startsWith('/api/service-payments')) {
      trackDeleted('payments', String(targetId))
    }
    // Generic anti-resurrection tracking for all other list endpoints.
    // Uses the URL itself as the key prefix so different lists don't collide.
    trackDeletedGeneric(listUrl, String(targetId))
  }

  const snapshots = new Map<string, any>()
  for (const key of Array.from(cache.keys())) {
    const keyBase = key.split('?')[0].split('#')[0]
    if (keyBase === listUrl && Array.isArray(cache.get(key))) {
      snapshots.set(key, cache.get(key))
      // INSTANT local removal — UI reflects delete immediately
      mutate<any[]>(key, (prev) =>
        prev ? prev.filter((x) => String(x?.id) !== String(targetId)) : prev || []
      )
    }
  }
  invalidate('/api/dashboard')

  // Allow offline mode: queue if offline
  if (!isOnline) {
    try {
      const { addToQueue } = await import('./offline-queue')
      await addToQueue({
        type: 'delete',
        sheet: listUrl.split('/').pop() || 'unknown',
        url,
        method: 'DELETE',
        tempId: targetId || undefined,
      })
    } catch {}
    return { success: true, _pending: true, _offline: true }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const r = await fetch(url, { method: 'DELETE', signal: controller.signal })
    clearTimeout(timeout)
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || 'Failed to delete')
    // REALTIME SYNC: Force immediate refetch so cloud data is up-to-date within ~500ms
    setTimeout(() => { invalidate(listUrl); invalidate('/api/dashboard') }, 300)
    return data
  } catch (e) {
    // Rollback on failure — restore cache snapshot AND untrack the deleted ID
    // so the row is no longer filtered out by applyDeletedFilter().
    if (targetId) {
      if (listUrl.startsWith('/api/jobs')) {
        recentlyDeletedJobs.delete(String(targetId))
        deletedExpiry.delete(`jobs:${String(targetId)}`)
      } else if (listUrl.startsWith('/api/payments') || listUrl.startsWith('/api/service-payments')) {
        recentlyDeletedPayments.delete(String(targetId))
        deletedExpiry.delete(`payments:${String(targetId)}`)
      }
      // v12.2: Also clear generic tracking
      const genericSet = genericDeletedMap.get(listUrl)
      if (genericSet) {
        genericSet.delete(String(targetId))
        if (genericSet.size === 0) genericDeletedMap.delete(listUrl)
      }
    }
    for (const [key, snap] of snapshots) {
      setCache(key, snap)
    }
    throw normalizeError(e)
  }
}

export function prefetch(url: string) {
  if (!cache.has(url) || Date.now() - (timestamps.get(url) || 0) > STALE_MS) {
    doFetch(url).catch(() => {})
  }
}

// New: batch prefetch
export function prefetchBatch(urls: string[]) {
  urls.forEach(url => prefetch(url))
}

// New: clear all cache
export function clearCache() {
  cache.clear()
  timestamps.clear()
  // Notify all subscribers to refetch
  for (const key of subscribers.keys()) {
    notify(key)
  }
}

// New: export cache stats for debugging
export function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()).slice(0, 20),
    isOnline,
  }
}
