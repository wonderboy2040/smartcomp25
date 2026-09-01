/**
 * Server-side data layer — Firestore backend ONLY (ULTRA FAST v11.5 Firebase Edition)
 *
 * Google Sheets / Apps Script support has been REMOVED in v11.5. The only
 * backend is Firebase Firestore, talked to directly via the firebase-admin
 * SDK from the Next.js server process.
 *
 * PERFORMANCE:
 *   - Typical cache hit:        <1 ms  (in-process Map lookup)
 *   - Typical Firestore read:   <100 ms
 *   - Typical Firestore write:  <200 ms
 *   - Bulk invoice + stock + payment create (batched write): <300 ms total
 *
 * NOTES:
 *   - Every exported function signature is unchanged from v10. All 60+ /api
 *     routes and 30+ panel components continue to work without edits.
 *   - Soft-delete semantics: rows are marked `deleted: true`, never removed.
 *   - replaceAll() is permanently blocked for data protection.
 *   - Write-through cache: patches cached lists in place so the next GET
 *     is instant. Cache TTL is 60s.
 *   - Same `SheetRow` type, same `sanitizeRowData`, same return shapes.
 *
 * SCHEMA:
 *   Each "sheet" maps to a Firestore collection with the same name
 *   (Invoices, Items, Customers, ...). Each row is a doc whose doc-ID
 *   equals the row's `id` field. The `deleted` field is stored as a boolean.
 */

import { getDb, pingFirestore, getInitError, isFirebaseConfigured } from '@/lib/firebase'
// Re-exports kept for backward compat with /api routes that import these names.
// getAppsScriptUrl() now always returns undefined; getAppPin() still works.
export { getAppsScriptUrl, getAppPin, isFirebaseMode } from '@/lib/runtime-config'

// ===== CACHE: LRU with 60s TTL + 300 max =====
type CacheEntry = { data: any; expires: number; hits: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 15 * 1000 // 15s — ultra-fast realtime sync (was 60s)
const MAX_CACHE_SIZE = 300

// ===== 5s in-memory execution cache + hash tracking =====
type MemCacheEntry = { data: any; expires: number; hash: string }
const quantumMemCache = new Map<string, MemCacheEntry>()
const QUANTUM_MEM_TTL = 2 * 1000 // 2s — ultra-fast realtime sync (was 5s)
const lastDataHash = new Map<string, string>()
const lastPullTime = new Map<string, number>()
const deletedTracking = new Map<string, { id: string; expires: number }>()

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

function computeHash(data: any): string {
  if (!data) return 'null'
  try {
    if (Array.isArray(data)) {
      if (data.length === 0) return 'empty_0'
      return `arr_${data.length}_${cyrb53(JSON.stringify(data))}`
    }
    const str = typeof data === 'string' ? data : JSON.stringify(data)
    if (str.length === 0) return 'str_0'
    return `h_${cyrb53(str)}`
  } catch {
    return Date.now().toString(36)
  }
}

function getQuantumMemCache(key: string): { data: any; hash: string } | null {
  const entry = quantumMemCache.get(key)
  if (!entry) return null
  if (entry.expires < Date.now()) {
    quantumMemCache.delete(key)
    return null
  }
  return { data: entry.data, hash: entry.hash }
}

function setQuantumMemCache(key: string, data: any) {
  const hash = computeHash(data)
  quantumMemCache.set(key, { data, hash, expires: Date.now() + QUANTUM_MEM_TTL })
  return hash
}

function trackDeleted(sheet: string, id: string) {
  const key = `${sheet}:${id}`
  deletedTracking.set(key, { id, expires: Date.now() + 5 * 60 * 1000 })
  setTimeout(() => deletedTracking.delete(key), 5 * 60 * 1000)
}

function isRecentlyDeleted(sheet: string, id: string): boolean {
  const key = `${sheet}:${id}`
  const entry = deletedTracking.get(key)
  if (!entry) return false
  if (entry.expires < Date.now()) {
    deletedTracking.delete(key)
    return false
  }
  return true
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expires < Date.now()) {
    cache.delete(key)
    return null
  }
  entry.hits++
  cache.delete(key)
  cache.set(key, entry)
  return entry.data as T
}

function setCached(key: string, data: any) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  cache.set(key, { data, expires: Date.now() + CACHE_TTL, hits: 0 })
}

export function invalidateCache(sheet?: string) {
  if (!sheet) {
    cache.clear()
    quantumMemCache.clear()
    lastPullTime.clear()
    return
  }
  const prefix = `list:${sheet}:`
  const getPrefix = `get:${sheet}:`
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix) || key.startsWith(getPrefix) || key.startsWith('dashboard:') || key.startsWith('quantum:')) {
      cache.delete(key)
    }
  }
  for (const key of Array.from(quantumMemCache.keys())) {
    if (key.startsWith(prefix) || key.startsWith(getPrefix) || key.startsWith('dashboard:') || key.startsWith('quantum:')) {
      quantumMemCache.delete(key)
    }
  }
  for (const key of Array.from(lastPullTime.keys())) {
    if (key.startsWith(prefix) || key.startsWith(getPrefix) || key.startsWith('dashboard:') || key.startsWith('quantum:')) {
      lastPullTime.delete(key)
    }
  }
}

// ===== WRITE-THROUGH CACHE — patch cached lists in place =====
function parseListCacheKey(key: string): { sheet: string; filter?: string; search?: string; includeDeleted: boolean } | null {
  if (!key.startsWith('list:')) return null
  const rest = key.slice('list:'.length)
  const firstColon = rest.indexOf(':')
  if (firstColon === -1) return null
  const sheet = rest.slice(0, firstColon)
  const remainder = rest.slice(firstColon + 1)
  const includeDeleted = remainder.endsWith(':1')
  const body = remainder.slice(0, remainder.length - 2)
  const fColon = body.indexOf(':')
  const filter = fColon === -1 ? body : body.slice(0, fColon)
  const search = fColon === -1 ? undefined : body.slice(fColon + 1)
  return {
    sheet,
    filter: filter || undefined,
    search: search || undefined,
    includeDeleted,
  }
}

function rowMatchesFilter(row: any, filter?: string): boolean {
  if (!filter) return true
  const eq = filter.indexOf('=')
  if (eq === -1) return true
  const field = filter.slice(0, eq)
  const value = filter.slice(eq + 1)
  if (!field || value === undefined) return true
  return String((row || {})[field] ?? '') === String(value)
}

function rowMatchesSearch(row: any, search?: string): boolean {
  if (!search) return true
  const q = search.toLowerCase()
  const rowObj = row || {}
  for (const v of Object.values(rowObj)) {
    if (String(v ?? '').toLowerCase().includes(q)) return true
  }
  return false
}

function isDeletedRow(row: any): boolean {
  if (!row) return false
  return row.deleted === true || row.deleted === 'true' || String(row.deleted).toLowerCase() === 'true'
}

function patchListCache(sheet: string, row: any, kind: 'create' | 'update' | 'delete' | 'restore') {
  const id = row?.id
  for (const key of Array.from(cache.keys())) {
    if (!key.startsWith(`list:${sheet}:`)) continue
    const meta = parseListCacheKey(key)
    if (!meta) continue
    const list = getCached<any[]>(key)
    if (!Array.isArray(list)) continue
    const idx = list.findIndex((x: any) => String(x?.id) === String(id))
    const matches = rowMatchesFilter(row, meta.filter) && rowMatchesSearch(row, meta.search)

    if (kind === 'create') {
      if (idx === -1 && matches) list.unshift(row)
    } else if (kind === 'update') {
      if (idx !== -1) {
        if (matches && !isDeletedRow(row)) list[idx] = row
        else list.splice(idx, 1)
      } else if (matches && !isDeletedRow(row)) {
        list.unshift(row)
      }
    } else if (kind === 'delete') {
      if (idx !== -1) {
        if (meta.includeDeleted) list[idx] = { ...(list[idx] || {}), deleted: true }
        else list.splice(idx, 1)
      }
    } else if (kind === 'restore') {
      if (idx !== -1) {
        if (matches) list[idx] = row
        else list.splice(idx, 1)
      } else if (matches) {
        list.unshift(row)
      }
    }
    setCached(key, list)
  }
  const getKey = `get:${sheet}:${id}`
  if (kind === 'delete') cache.delete(getKey)
  else if (row) setCached(getKey, row)
}

function mergeWithCached(sheet: string, id: string, row: any): any {
  if (!row || typeof row !== 'object') return row
  const getKey = `get:${sheet}:${id}`
  const direct = getCached<any>(getKey)
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return { ...direct, ...row }
  }
  for (const key of Array.from(cache.keys())) {
    if (!key.startsWith(`list:${sheet}:`)) continue
    const list = getCached<any[]>(key)
    if (!Array.isArray(list)) continue
    const found = list.find((x: any) => String(x?.id) === String(id))
    if (found && typeof found === 'object') {
      return { ...found, ...row }
    }
  }
  return row
}

const reconcileTimers = new Map<string, ReturnType<typeof setTimeout>>()
function reconcileDelayMs(): number {
  const v = Number(process.env.SMARTCOMP_RECONCILE_DELAY_MS)
  return Number.isFinite(v) && v > 0 ? v : 400 // 400ms — near-instant write-through (was 1200ms)
}
function scheduleReconcile(sheet: string) {
  const existing = reconcileTimers.get(sheet)
  if (existing) clearTimeout(existing)
  reconcileTimers.set(
    sheet,
    setTimeout(() => {
      reconcileTimers.delete(sheet)
      listRows(sheet, { useCache: false }).catch(() => {})
    }, reconcileDelayMs())
  )
}

function invalidateAggregates() {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith('dashboard:') || key.startsWith('quantum:')) cache.delete(key)
  }
  for (const key of Array.from(quantumMemCache.keys())) {
    if (key.startsWith('dashboard:') || key.startsWith('quantum:')) quantumMemCache.delete(key)
  }
  for (const key of Array.from(lastPullTime.keys())) {
    if (key.startsWith('dashboard:') || key.startsWith('quantum:')) lastPullTime.delete(key)
  }
}

// ===== CONFIG =====
export type SheetRow = Record<string, unknown>

export function isConfigured(): boolean {
  return isFirebaseConfigured()
}

export function getConfigError(): string | null {
  if (isFirebaseConfigured()) return null
  return 'Firebase credentials not set. Set FIREBASE_SERVICE_ACCOUNT_BASE64 (or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) on Render, OR paste them via the in-app Setup Wizard.'
}

// ===== SANITIZATION =====
function sanitizeString(str: string): string {
  if (typeof str !== 'string') return str
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, 10000)
}

export function sanitizeRowData(data: SheetRow): SheetRow {
  if (!data || typeof data !== 'object') return data
  const sanitized: any = {}
  for (const [key, value] of Object.entries(data)) {
    // STRIP undefined values — Firestore throws "Cannot use 'undefined' as a
    // Firestore value" if they sneak through. This was the root cause of the
    // "invoice/quotation auto-deletes after create" bug: the API route didn't
    // pass customerName/Phone/Gstin, so they were undefined, the Firestore
    // write threw, the POST returned 500, and the optimistic temp item was
    // wiped by the next refetch.
    if (value === undefined) continue
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value)
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((v) => (typeof v === 'string' ? sanitizeString(v) : v))
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeRowData(value as SheetRow)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

// ===== ID GENERATION =====
function generateId(sheet: string): string {
  const prefix = sheet.toLowerCase().replace(/[^a-z]/g, '').slice(0, 4) || 'row'
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${ts}_${rand}`
}

// ===== TYPE COERCION =====
function docToRow(doc: any): any {
  if (!doc || !doc.exists) return null
  const data = doc.data() || {}
  return { ...data, id: data.id || doc.id }
}

// ===== CORE CRUD =====

/**
 * List rows from a sheet (Firestore collection).
 * Filter and search are applied in-memory after the fetch — Firestore query
 * index requirements would otherwise make every new filter field a
 * deployment hassle.
 */
export async function listRows<T = any>(
  sheet: string,
  options: { filter?: string; search?: string; useCache?: boolean; includeDeleted?: boolean } = {}
): Promise<T[]> {
  if (!isConfigured()) return [] as T[]

  const useCache = options.useCache !== false
  const cacheKey = `list:${sheet}:${options.filter || ''}:${options.search || ''}:${options.includeDeleted ? '1' : '0'}`

  if (useCache) {
    const cached = getCached<T[]>(cacheKey)
    if (cached) return cached
  }

  const db = await getDb()
  if (!db) return [] as T[]

  try {
    const snapshot = await db.collection(sheet).get()
    let rows: any[] = []
    snapshot.forEach((doc: any) => {
      const row = docToRow(doc)
      if (!row) return
      if (!options.includeDeleted && isDeletedRow(row)) return
      rows.push(row)
    })

    if (options.filter) {
      rows = rows.filter((r) => rowMatchesFilter(r, options.filter))
    }
    if (options.search) {
      rows = rows.filter((r) => rowMatchesSearch(r, options.search))
    }

    if (!options.includeDeleted && deletedTracking.size > 0) {
      rows = rows.filter((row: any) => {
        const id = row?.id
        return !id || !isRecentlyDeleted(sheet, String(id))
      })
    }

    if (useCache) setCached(cacheKey, rows)
    return rows as T[]
  } catch (e: any) {
    console.error(`[firestore] listRows(${sheet}) failed:`, e?.message)
    return [] as T[]
  }
}

/**
 * Paginated list with optional Firestore-side filtering and ordering.
 *
 * Uses Firestore query pushdown (`.where()` + `.orderBy()` + `.limit()`)
 * instead of loading the entire collection into memory. Returns a cursor
 * the caller can use to fetch the next page.
 *
 * NOTE: composite indexes may be required by Firestore for some
 * (where + orderBy) combinations; we fall back to in-memory pagination
 * if the index is missing.
 */
export async function listRowsPaginated<T = any>(
  sheet: string,
  options: {
    where?: { field: string; op?: FirebaseFirestore.WhereFilterOp; value: any }[]
    orderBy?: { field: string; direction?: 'asc' | 'desc' }
    limit?: number
    cursor?: string // opaque cursor returned by previous call
    includeDeleted?: boolean
  } = {},
): Promise<{ rows: T[]; nextCursor: string | null; totalApprox: number }> {
  if (!isConfigured()) return { rows: [] as T[], nextCursor: null, totalApprox: 0 }

  const pageSize = Math.min(Math.max(options.limit ?? 50, 1), 500)
  const includeDeleted = options.includeDeleted === true

  const db = await getDb()
  if (!db) return { rows: [] as T[], nextCursor: null, totalApprox: 0 }

  try {
    let q: any = db.collection(sheet)

    // Apply server-side filters (Firestore WhereFilterOp)
    if (Array.isArray(options.where)) {
      for (const w of options.where) {
        if (!w || !w.field) continue
        const op = w.op || '=='
        try {
          q = q.where(w.field, op as any, w.value)
        } catch {
          // ignore filter that can't be applied server-side
        }
      }
    }
    // v13.1 fix: previously we applied `where('deleted', '!=', true)` here
    // AND `orderBy(otherField)` — Firestore rejects this query at .get()
    // time because the first orderBy must match the inequality field. The
    // query would throw and fall through to the in-memory fallback, making
    // the Firestore pushdown dead code. Now we skip the server-side deleted
    // filter entirely and rely on the in-memory `isDeletedRow` check below
    // (already present on the post-fetch pass). This costs a few extra
    // docs of bandwidth but keeps the orderBy pushdown functional.
    if (options.orderBy && options.orderBy.field) {
      try {
        q = q.orderBy(options.orderBy.field, options.orderBy.direction || 'desc')
      } catch {
        // ignore — caller can sort in memory
      }
    }
    if (options.cursor) {
      try {
        // v13.1 fix: cursor is the Firestore doc.id (the actual primary key).
        // Previously we used `data.id` which can differ from the doc.id on
        // legacy/imported rows — causing the doc lookup to fail silently and
        // resetting the caller to page 1.
        const cursorDoc = await db.collection(sheet).doc(options.cursor).get()
        if (cursorDoc && cursorDoc.exists) {
          q = q.startAfter(cursorDoc)
        }
      } catch {
        // ignore bad cursor
      }
    }
    q = q.limit(pageSize + 1) // fetch 1 extra to detect "has more"

    const snapshot = await q.get()
    const rows: any[] = []
    // Track the actual Firestore doc.id for cursor pagination — this is
    // critical because `data.id` (the field stored in the row) may differ
    // from `doc.id` for legacy/imported rows.
    const docIds: string[] = []
    snapshot.forEach((doc: any) => {
      const row = docToRow(doc)
      if (!row) return
      if (!includeDeleted && isDeletedRow(row)) return
      rows.push(row)
      docIds.push(doc.id)
    })

    let nextCursor: string | null = null
    if (rows.length > pageSize) {
      // Use the actual Firestore doc.id (not data.id) for the next cursor.
      nextCursor = String(docIds[pageSize - 1] || rows[pageSize - 1]?.id || '')
      rows.length = pageSize
    }

    return { rows: rows as T[], nextCursor, totalApprox: rows.length }
  } catch (e: any) {
    // Fallback: in-memory pagination via listRows (preserves backward compat)
    const allRows = await listRows<T>(sheet, { includeDeleted })
    const sliced = allRows.slice(0, pageSize)
    const lastRow = sliced.length > 0 ? sliced[sliced.length - 1] : null
    return {
      rows: sliced,
      nextCursor: sliced.length === pageSize ? String((lastRow as any)?.id || '') : null,
      totalApprox: allRows.length,
    }
  }
}

export async function getBatchRows(sheets: string[]): Promise<Record<string, any[]>> {
  if (!isConfigured()) {
    const empty: Record<string, any[]> = {}
    sheets.forEach((s) => (empty[s] = []))
    return empty
  }
  const results = await Promise.all(sheets.map((sheet) => listRows(sheet).catch(() => [])))
  const map: Record<string, any[]> = {}
  sheets.forEach((sheet, i) => {
    map[sheet] = results[i]
  })
  return map
}

export async function getRow<T = any>(sheet: string, id: string): Promise<T | null> {
  if (!isConfigured()) return null
  const cacheKey = `get:${sheet}:${id}`
  const cached = getCached<T>(cacheKey)
  if (cached) return cached

  const db = await getDb()
  if (!db) return null

  try {
    const doc = await db.collection(sheet).doc(String(id)).get()
    const row = docToRow(doc)
    if (row) setCached(cacheKey, row)
    return row as T
  } catch (e: any) {
    console.error(`[firestore] getRow(${sheet}/${id}) failed:`, e?.message)
    return null
  }
}

export async function createRow<T = any>(sheet: string, data: SheetRow): Promise<T> {
  const sanitized = sanitizeRowData(data)
  if (!sanitized.id) sanitized.id = generateId(sheet)
  if (!sanitized.createdAt) sanitized.createdAt = new Date().toISOString()
  sanitized.updatedAt = new Date().toISOString()
  if (sanitized.deleted === undefined) sanitized.deleted = false

  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  try {
    await db.collection(sheet).doc(String(sanitized.id)).set(sanitized)
  } catch (e: any) {
    // v12.2: Wrap Firestore write errors with the sheet name + id so the
    // upstream API route's error response actually tells the user what went
    // wrong (was a bare "Cannot use 'undefined' as a Firestore value").
    const msg = String(e?.message || 'Unknown Firestore error')
    throw new Error(`Failed to create ${sheet} row ${sanitized.id}: ${msg}`)
  }
  patchListCache(sheet, sanitized, 'create')
  invalidateAggregates()
  scheduleReconcile(sheet)
  return sanitized as T
}

export async function updateRow<T = any>(sheet: string, id: string, data: SheetRow): Promise<T> {
  const sanitized = sanitizeRowData(data)
  sanitized.updatedAt = new Date().toISOString()

  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  const ref = db.collection(sheet).doc(String(id))
  try {
    await ref.set(sanitized, { merge: true })
  } catch (e: any) {
    const msg = String(e?.message || 'Unknown Firestore error')
    throw new Error(`Failed to update ${sheet} row ${id}: ${msg}`)
  }

  const updated = mergeWithCached(sheet, id, { ...sanitized, id })
  patchListCache(sheet, updated, 'update')
  invalidateAggregates()
  scheduleReconcile(sheet)
  return updated as T
}

// SOFT-DELETE ONLY
export async function deleteRow(sheet: string, id: string): Promise<boolean> {
  trackDeleted(sheet, id)
  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  await db.collection(sheet).doc(String(id)).set({ deleted: true, updatedAt: new Date().toISOString() }, { merge: true })
  patchListCache(sheet, { id, deleted: true }, 'delete')
  invalidateAggregates()
  scheduleReconcile(sheet)
  return true
}

export async function restoreRow(sheet: string, id: string): Promise<boolean> {
  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  await db.collection(sheet).doc(String(id)).set({ deleted: false, updatedAt: new Date().toISOString() }, { merge: true })
  const restored = mergeWithCached(sheet, id, { id, deleted: false })
  patchListCache(sheet, restored, 'restore')
  invalidateAggregates()
  scheduleReconcile(sheet)
  return true
}

export async function bulkCreate(sheet: string, data: SheetRow[]): Promise<number> {
  if (data.length === 0) return 0
  const sanitized = data.map(sanitizeRowData)
  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  const chunks: SheetRow[][] = []
  for (let i = 0; i < sanitized.length; i += 450) {
    chunks.push(sanitized.slice(i, i + 450))
  }

  const createdRows: any[] = []
  for (const chunk of chunks) {
    const batch = db.batch()
    for (const item of chunk) {
      if (!item.id) item.id = generateId(sheet)
      if (!item.createdAt) item.createdAt = new Date().toISOString()
      item.updatedAt = new Date().toISOString()
      if (item.deleted === undefined) item.deleted = false
      batch.set(db.collection(sheet).doc(String(item.id)), item)
      createdRows.push(item)
    }
    await batch.commit()
  }

  for (const row of createdRows) patchListCache(sheet, row, 'create')
  invalidateAggregates()
  scheduleReconcile(sheet)
  return createdRows.length
}

export async function replaceAll(_sheet: string, _data: SheetRow[]): Promise<number> {
  throw new Error(
    'replaceAll() is permanently disabled for data protection. Use createRow() or updateRow() instead.'
  )
}

export async function bulkUpdate(sheet: string, updates: { id: string; data: SheetRow }[]): Promise<number> {
  if (updates.length === 0) return 0
  const sanitized = updates.map((u) => ({ id: u.id, data: sanitizeRowData(u.data) }))
  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  const chunks: { id: string; data: SheetRow }[][] = []
  for (let i = 0; i < sanitized.length; i += 450) {
    chunks.push(sanitized.slice(i, i + 450))
  }

  const updatedRows: any[] = []
  for (const chunk of chunks) {
    const batch = db.batch()
    for (const u of chunk) {
      const data = { ...u.data, updatedAt: new Date().toISOString() }
      batch.set(db.collection(sheet).doc(String(u.id)), data, { merge: true })
      updatedRows.push(mergeWithCached(sheet, u.id, { ...data, id: u.id }))
    }
    await batch.commit()
  }

  for (const row of updatedRows) patchListCache(sheet, row, 'update')
  invalidateAggregates()
  scheduleReconcile(sheet)
  return updatedRows.length
}

// ===== SHOP =====
const SHOP_DOC_ID = 'shop_main'

export async function getShop(): Promise<any | null> {
  if (!isConfigured()) return null
  const cacheKey = 'shop:single'
  const cached = getCached<any>(cacheKey)
  if (cached !== null) return cached

  const db = await getDb()
  if (!db) return null

  try {
    const doc = await db.collection('Shop').doc(SHOP_DOC_ID).get()
    const row = docToRow(doc)
    if (row) setCached(cacheKey, row)
    return row
  } catch (e: any) {
    console.error('[firestore] getShop failed:', e?.message)
    return null
  }
}

export async function saveShop(data: SheetRow): Promise<any> {
  const sanitized = sanitizeRowData(data)
  sanitized.id = SHOP_DOC_ID
  sanitized.updatedAt = new Date().toISOString()
  if (!sanitized.createdAt) sanitized.createdAt = new Date().toISOString()
  if (sanitized.deleted === undefined) sanitized.deleted = false

  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  await db.collection('Shop').doc(SHOP_DOC_ID).set(sanitized, { merge: true })
  invalidateCache()
  return sanitized
}

// ===== DASHBOARD =====
export async function getDashboardStats(): Promise<any> {
  const cacheKey = 'dashboard:stats'
  const cached = getCached<any>(cacheKey)
  if (cached) return cached

  const [items, customers, suppliers, invoices, quotations, payments, enquiries, jobs, servicePayments] = await Promise.all([
    listRows<any>('Items').catch(() => []),
    listRows<any>('Customers').catch(() => []),
    listRows<any>('Suppliers').catch(() => []),
    listRows<any>('Invoices').catch(() => []),
    listRows<any>('Quotations').catch(() => []),
    listRows<any>('Payments').catch(() => []),
    listRows<any>('Enquiries').catch(() => []),
    listRows<any>('Jobs').catch(() => []),
    listRows<any>('ServicePayments').catch(() => []),
  ])

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthMs = startOfMonth.getTime()
  const todayMs = startOfToday.getTime()

  const num = (v: any) => Number(v) || 0
  const inMonth = (d: any) => {
    const t = new Date(d || 0).getTime()
    return t >= monthMs
  }
  const isToday = (d: any) => {
    const t = new Date(d || 0).getTime()
    return t >= todayMs
  }

  const totalItems = items.length
  const lowStockCount = items.filter((i) => Number(i.quantity) <= Number(i.minQuantity || 0)).length
  const stockValueCost = items.reduce((s, i) => s + num(i.costPrice) * num(i.quantity), 0)
  const stockValueSelling = items.reduce((s, i) => s + num(i.sellingPrice) * num(i.quantity), 0)

  const monthInvoices = invoices.filter((i) => inMonth(i.date || i.createdAt))
  const monthSales = monthInvoices.reduce((s, i) => s + num(i.grandTotal), 0)
  const monthProfit = monthInvoices.reduce((s, i) => s + num(i.profit), 0)
  const monthCashSales = monthInvoices.filter((i) => /cash/i.test(String(i.paymentType))).reduce((s, i) => s + num(i.grandTotal), 0)
  const monthCreditSales = monthInvoices.filter((i) => /credit/i.test(String(i.paymentType))).reduce((s, i) => s + num(i.grandTotal), 0)

  const totalOutstanding = invoices.reduce((s, i) => s + num(i.amountDue), 0)

  const monthQuotations = quotations.filter((q) => inMonth(q.date || q.createdAt))
  const monthQuotationValue = monthQuotations.reduce((s, q) => s + num(q.grandTotal), 0)

  const todayPayments = payments.filter((p) => isToday(p.date || p.createdAt))
  const todayPaymentTotal = todayPayments.reduce((s, p) => s + num(p.amount), 0)

  const pendingEnquiries = enquiries.filter((e) => !e.status || e.status === 'pending' || e.status === 'sent').length

  const pendingJobs = jobs.filter((j) => !['Completed', 'Delivered', 'Cancelled'].includes(j.status)).length
  const completedJobs = jobs.filter((j) => j.status === 'Completed').length
  const deliveredJobs = jobs.filter((j) => j.status === 'Delivered').length
  const highPriorityJobs = jobs.filter((j) => j.priority === 'high' && !['Completed', 'Delivered', 'Cancelled'].includes(j.status)).length
  const todayJobs = jobs.filter((j) => isToday(j.createdAt)).length
  const monthJobs = jobs.filter((j) => inMonth(j.createdAt)).length

  const todayService = servicePayments.filter((p) => isToday(p.date || p.createdAt))
  const todayServiceTotal = todayService.reduce((s, p) => s + num(p.amount), 0)
  const todayServiceUPI = todayService.filter((p) => /upi/i.test(String(p.mode))).reduce((s, p) => s + num(p.amount), 0)
  const todayServiceCash = todayService.filter((p) => /cash/i.test(String(p.mode))).reduce((s, p) => s + num(p.amount), 0)

  const monthService = servicePayments.filter((p) => inMonth(p.date || p.createdAt))
  const monthServiceTotal = monthService.reduce((s, p) => s + num(p.amount), 0)
  const monthServiceUPI = monthService.filter((p) => /upi/i.test(String(p.mode))).reduce((s, p) => s + num(p.amount), 0)
  const monthServiceCash = monthService.filter((p) => /cash/i.test(String(p.mode))).reduce((s, p) => s + num(p.amount), 0)

  const sortDesc = (arr: any[], field: string) =>
    arr.slice().sort((a, b) => new Date(b[field] || b.createdAt || 0).getTime() - new Date(a[field] || a.createdAt || 0).getTime())

  const stats = {
    totalItems,
    lowStockCount,
    totalCustomers: customers.length,
    totalSuppliers: suppliers.length,
    stockValueCost,
    stockValueSelling,
    monthSales,
    monthProfit,
    monthCashSales,
    monthCreditSales,
    totalOutstanding,
    monthQuotationValue,
    totalQuotations: quotations.length,
    todayPaymentTotal,
    pendingEnquiries,
    totalJobs: jobs.length,
    pendingJobs,
    completedJobs,
    deliveredJobs,
    highPriorityJobs,
    todayJobs,
    monthJobs,
    todayServiceTotal,
    todayServiceUPI,
    todayServiceCash,
    monthServiceTotal,
    monthServiceUPI,
    monthServiceCash,
  }

  const data = {
    stats,
    pendingInvoices: invoices.filter((i) => num(i.amountDue) > 0).slice(0, 10),
    recentInvoices: sortDesc(invoices, 'date').slice(0, 10),
    recentPayments: sortDesc(payments, 'date').slice(0, 10),
    recentEnquiries: sortDesc(enquiries, 'createdAt').slice(0, 10),
    lowStockList: items.filter((i) => Number(i.quantity) <= Number(i.minQuantity || 0)).slice(0, 20),
    recentJobs: sortDesc(jobs, 'createdAt').slice(0, 10),
  }

  setCached(cacheKey, data)
  return data
}

// ===== CONNECTION TEST =====
export async function testConnection(): Promise<{ success: boolean; message: string; urlPreview?: string }> {
  if (!isFirebaseConfigured()) {
    return { success: false, message: 'Firebase credentials not set. Set FIREBASE_SERVICE_ACCOUNT_BASE64 (or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY).' }
  }
  try {
    const result = await pingFirestore()
    return result.ok
      ? { success: true, message: `Connected to Firestore successfully! (project: ${result.projectId || 'unknown'})` }
      : { success: false, message: result.message || 'Firestore ping failed' }
  } catch (e: any) {
    return { success: false, message: e?.message || 'Firestore connection failed' }
  }
}

export function getConfiguredUrlPreview(): { configured: boolean; urlPreview: string | null; endsWithExec: boolean } {
  if (isFirebaseConfigured()) {
    return { configured: true, urlPreview: 'firestore (in-process SDK)', endsWithExec: true }
  }
  return { configured: false, urlPreview: null, endsWithExec: false }
}

export async function seedData(): Promise<any> {
  const now = new Date().toISOString()

  const items = [
    { id: 'item_seed_1', name: 'HP Laptop 15s', sku: 'HP-15S-001', category: 'Laptops', gstApplicable: true, gstRate: 18, costPrice: 35000, sellingPrice: 42000, quantity: 5, minQuantity: 2, unit: 'pcs', hsnCode: '8471', warrantyDays: 365, deleted: false, createdAt: now, updatedAt: now },
    { id: 'item_seed_2', name: 'Dell Keyboard', sku: 'DLL-KB-001', category: 'Accessories', gstApplicable: true, gstRate: 18, costPrice: 450, sellingPrice: 700, quantity: 20, minQuantity: 5, unit: 'pcs', hsnCode: '8471', warrantyDays: 90, deleted: false, createdAt: now, updatedAt: now },
    { id: 'item_seed_3', name: 'Logitech Mouse', sku: 'LOG-MS-001', category: 'Accessories', gstApplicable: true, gstRate: 18, costPrice: 250, sellingPrice: 450, quantity: 15, minQuantity: 5, unit: 'pcs', hsnCode: '8471', warrantyDays: 90, deleted: false, createdAt: now, updatedAt: now },
  ]
  const customers = [
    { id: 'cust_seed_1', name: 'Rahul Sharma', phone: '9876543210', email: 'rahul@example.com', address: 'MG Road, Bangalore', gstNumber: '', state: 'Karnataka', creditBalance: 0, creditLimit: 0, creditDays: 0, creditScore: 100, deleted: false, createdAt: now, updatedAt: now },
    { id: 'cust_seed_2', name: 'Priya Enterprises', phone: '9123456780', email: 'priya@enterprises.com', address: 'Brigade Road, Bangalore', gstNumber: '29ABCDE1234F1Z5', state: 'Karnataka', creditBalance: 0, creditLimit: 50000, creditDays: 30, creditScore: 90, deleted: false, createdAt: now, updatedAt: now },
  ]

  const results: any = {}
  results.items = await bulkCreate('Items', items)
  results.customers = await bulkCreate('Customers', customers)
  invalidateCache()
  return results
}

// ===== QUANTUM: getAllData single-call =====
export async function getAllDataQuantum(): Promise<any> {
  const cacheKey = 'quantum:getAllData'

  const last = lastPullTime.get(cacheKey) || 0
  if (Date.now() - last < 1000) {
    const mem = getQuantumMemCache(cacheKey)
    if (mem) return mem.data
  }

  const cached = getCached(cacheKey)
  if (cached) {
    lastPullTime.set(cacheKey, Date.now())
    return cached
  }

  const mem = getQuantumMemCache(cacheKey)
  if (mem) {
    lastPullTime.set(cacheKey, Date.now())
    return mem.data
  }

  try {
    const [jobs, items, payments, customers, shopRows] = await Promise.all([
      listRows<any>('Jobs').catch(() => []),
      listRows<any>('Items').catch(() => []),
      listRows<any>('ServicePayments').catch(() => []),
      listRows<any>('Customers').catch(() => []),
      listRows('Shop').catch(() => []),
    ])

    const data = {
      jobs,
      spareParts: items,
      items,
      payments,
      servicePayments: payments,
      customers,
      shop: (shopRows as any[])[0] || null,
      timestamp: new Date().toISOString(),
    }

    const newHash = computeHash(data)
    const oldHash = lastDataHash.get(cacheKey)
    if (oldHash === newHash) {
      const existing = getCached<any>(cacheKey) || (mem as any)?.data
      if (existing) return existing
    }
    lastDataHash.set(cacheKey, newHash)
    lastPullTime.set(cacheKey, Date.now())
    setCached(cacheKey, data)
    setQuantumMemCache(cacheKey, data)
    return data
  } catch (e) {
    console.warn('getAllDataQuantum failed:', e)
    return null
  }
}

export async function getBatchDataQuantum(): Promise<any> {
  const cacheKey = 'quantum:getBatchData'
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const [shop, items, customers, invoices] = await Promise.all([
      getShop().catch(() => null),
      listRows<any>('Items').catch(() => []),
      listRows<any>('Customers').catch(() => []),
      listRows<any>('Invoices').catch(() => []),
    ])
    const data = { shop, items, customers, invoices }
    setCached(cacheKey, data)
    return data
  } catch {
    return null
  }
}

// ===== ULTRA FAST BULK TRANSACTIONS =====
// These do invoice/quotation/job + stock + customer + payment in a SINGLE
// in-process transaction (Firestore batched writes). Typical total latency
// is <300 ms.

function nextInvoiceNumber(prefix: string, existing: any[]): string {
  const year = new Date().getFullYear()
  const yearPrefix = `${prefix}${year}`
  let max = 0
  for (const inv of existing) {
    const num = String(inv.number || '').replace(yearPrefix, '').replace(/\D/g, '')
    const n = parseInt(num, 10)
    if (!isNaN(n) && n > max) max = n
  }
  // v12.2: Add a millisecond-based floor so two invoices created in the same
  // second by different requests don't collide on the same number. The
  // existing-list scan is the source of truth for the floor; this just adds
  // a safety net when the list is briefly stale during concurrent creates.
  const timeFloor = Math.max(0, Date.now() % 100000)
  const seq = Math.max(max + 1, timeFloor)
  return `${yearPrefix}${String(seq).padStart(4, '0')}`
}

export async function createInvoiceFull(data: {
  number?: string
  customerId: string
  customerName: string
  customerPhone: string
  customerGstin: string
  date: string
  itemsJson: string
  subtotal: number
  gstAmount: number
  courierCharges: number
  otherCharges: number
  discount: number
  grandTotal: number
  totalCost: number
  profit: number
  paymentType: string
  paymentStatus: string
  amountPaid: number
  amountDue: number
  notes: string
  template?: string
  gstMode?: string
  stockUpdates?: { id: string; deductQty: number }[]
  customerUpdate?: { id: string; creditBalance: number }
  payment?: any
  // v4.0: optional engineer who sold these items. Used by the Engineers
  // panel to compute sales commission per engineer.
  engineerId?: string
  engineerName?: string
}): Promise<any> {
  const sanitized = sanitizeRowData(data as any)
  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  let invoiceNumber = sanitized.number
  if (!invoiceNumber) {
    const shop = await getShop()
    const prefix = shop?.invoicePrefix || 'INV'
    const existing = await listRows<any>('Invoices')
    invoiceNumber = nextInvoiceNumber(prefix, existing)
  }

  const invoiceId = generateId('invoices')
  const invoiceRow: any = {
    id: invoiceId,
    number: invoiceNumber,
    customerId: sanitized.customerId || '',
    customerName: sanitized.customerName || '',
    customerPhone: sanitized.customerPhone || '',
    customerGstin: sanitized.customerGstin || '',
    date: sanitized.date || new Date().toISOString(),
    itemsJson: sanitized.itemsJson || '[]',
    serialsJson: sanitized.serialsJson || '[]',
    subtotal: Number(sanitized.subtotal) || 0,
    gstAmount: Number(sanitized.gstAmount) || 0,
    courierCharges: Number(sanitized.courierCharges) || 0,
    otherCharges: Number(sanitized.otherCharges) || 0,
    discount: Number(sanitized.discount) || 0,
    grandTotal: Number(sanitized.grandTotal) || 0,
    totalCost: Number(sanitized.totalCost) || 0,
    profit: Number(sanitized.profit) || 0,
    paymentType: sanitized.paymentType || 'cash',
    paymentStatus: sanitized.paymentStatus || 'unpaid',
    amountPaid: Number(sanitized.amountPaid) || 0,
    amountDue: Number(sanitized.amountDue) || 0,
    notes: sanitized.notes || '',
    template: sanitized.template || 'tally-classic',
    gstMode: sanitized.gstMode || 'gst',
    // v4.0: Engineer attribution
    engineerId: sanitized.engineerId || '',
    engineerName: sanitized.engineerName || '',
    shareToken: '',
    createdAt: new Date().toISOString(),
    deleted: false,
  }

  const batch = db.batch()
  batch.set(db.collection('Invoices').doc(invoiceId), invoiceRow)

  if (Array.isArray(sanitized.stockUpdates)) {
    // v13.5 PERF: fetch ALL stock items in ONE parallel round instead of a
    // sequential `await get()` per line item. On a 5-item invoice this cuts
    // 4 Firestore round-trips (each ~30-80ms on Render) off the critical
    // save path. The batch write itself is untouched (still atomic).
    const updates = (sanitized.stockUpdates as any[]).filter((su) => su?.id && su.deductQty)
    if (updates.length > 0) {
      const snaps = await Promise.all(
        updates.map((su) => db.collection('Items').doc(String(su.id)).get())
      )
      snaps.forEach((itemSnap, idx) => {
        const itemData = itemSnap.data() as any
        if (!itemData) return
        const su = updates[idx]
        const newQty = Math.max(0, Number(itemData.quantity || 0) - Number(su.deductQty))
        batch.set(db.collection('Items').doc(String(su.id)), { quantity: newQty, updatedAt: new Date().toISOString() }, { merge: true })
      })
    }
  }

  let paymentRow: any = null
  const customerUpdate: any = sanitized.customerUpdate
  if (customerUpdate?.id) {
    const custRef = db.collection('Customers').doc(String(customerUpdate.id))
    batch.set(custRef, { creditBalance: Number(customerUpdate.creditBalance) || 0, updatedAt: new Date().toISOString() }, { merge: true })
  }

  const payment: any = sanitized.payment
  if (payment && Number(payment.amount) > 0) {
    const paymentId = generateId('pay')
    paymentRow = {
      id: paymentId,
      invoiceId,
      invoiceNumber,
      customerName: sanitized.customerName,
      amount: Number(payment.amount) || 0,
      type: payment.type || sanitized.paymentType || 'cash',
      date: payment.date || sanitized.date || new Date().toISOString(),
      notes: payment.notes || '',
      reference: payment.reference || '',
      createdAt: new Date().toISOString(),
      deleted: false,
    }
    batch.set(db.collection('Payments').doc(paymentId), paymentRow)
  }

  await batch.commit()

  patchListCache('Invoices', invoiceRow, 'create')
  if (paymentRow) patchListCache('Payments', paymentRow, 'create')
  invalidateCache('Items')
  invalidateCache('Customers')
  invalidateCache('ItemSerials')
  invalidateAggregates()
  scheduleReconcile('Invoices')
  scheduleReconcile('Payments')

  return { success: true, data: invoiceRow, payment: paymentRow }
}

export async function createQuotationFull(data: any): Promise<any> {
  const sanitized = sanitizeRowData(data)
  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  let quotationNumber = sanitized.number
  if (!quotationNumber) {
    const shop = await getShop()
    const prefix = shop?.quotationPrefix || 'QTN'
    const existing = await listRows<any>('Quotations')
    quotationNumber = nextInvoiceNumber(prefix, existing)
  }

  const quotationId = generateId('quotations')
  const row: any = {
    id: quotationId,
    number: quotationNumber,
    customerId: sanitized.customerId || '',
    customerName: sanitized.customerName || '',
    customerPhone: sanitized.customerPhone || '',
    customerGstin: sanitized.customerGstin || '',
    date: sanitized.date || new Date().toISOString(),
    validTill: sanitized.validTill || '',
    itemsJson: sanitized.itemsJson || '[]',
    subtotal: Number(sanitized.subtotal) || 0,
    gstAmount: Number(sanitized.gstAmount) || 0,
    courierCharges: Number(sanitized.courierCharges) || 0,
    otherCharges: Number(sanitized.otherCharges) || 0,
    discount: Number(sanitized.discount) || 0,
    grandTotal: Number(sanitized.grandTotal) || 0,
    notes: sanitized.notes || '',
    status: sanitized.status || 'sent',
    template: sanitized.template || 'tally-classic',
    gstMode: sanitized.gstMode || 'gst',
    convertedToInvoiceId: '',
    shareToken: '',
    createdAt: new Date().toISOString(),
    deleted: false,
  }

  await db.collection('Quotations').doc(quotationId).set(row)
  patchListCache('Quotations', row, 'create')
  invalidateAggregates()
  scheduleReconcile('Quotations')
  return { success: true, data: row }
}

export async function completeJobFull(data: {
  id: string
  status?: string
  partsUsedJson?: string
  finalAmount?: number
  serviceCharge?: number
  paidAmount?: number
  paymentMode?: string
  partsProfit?: number
  serviceProfit?: number
  warrantyDays?: number
  warrantyExpiry?: string
  completedDate?: string
  diagnosisNotes?: string
  notes?: string
  stockUpdates?: { id: string; deductQty: number }[]
  payment?: any
}): Promise<any> {
  const sanitized = sanitizeRowData(data as any)
  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  const jobId = String(sanitized.id)
  const jobRef = db.collection('Jobs').doc(jobId)
  const jobSnap = await jobRef.get()
  const existing = (jobSnap.data() as any) || {}

  const completedDate = sanitized.completedDate || new Date().toISOString()
  const warrantyDays = Number(sanitized.warrantyDays) || 0
  const warrantyExpiry = sanitized.warrantyExpiry || (warrantyDays > 0 ? new Date(Date.now() + warrantyDays * 86400000).toISOString() : '')

  const jobUpdate: any = {
    status: sanitized.status || 'Completed',
    partsUsedJson: sanitized.partsUsedJson || existing.partsUsedJson || '[]',
    finalAmount: Number(sanitized.finalAmount) || 0,
    serviceCharge: Number(sanitized.serviceCharge) || 0,
    paidAmount: Number(sanitized.paidAmount) || 0,
    paymentMode: sanitized.paymentMode || '',
    // v12.2: ensure paymentType + grossProfit are persisted (the jobs route
    // passes them but they were dropped here, leading to inconsistent state
    // when the job was re-read later).
    paymentType: sanitized.paymentType || '',
    grossProfit: Number(sanitized.grossProfit) || 0,
    partsProfit: Number(sanitized.partsProfit) || 0,
    serviceProfit: Number(sanitized.serviceProfit) || 0,
    warrantyDays,
    warrantyExpiry,
    completedDate,
    diagnosisNotes: sanitized.diagnosisNotes || '',
    notes: sanitized.notes || '',
    updatedAt: new Date().toISOString(),
    deliveredAt: sanitized.status === 'Delivered' ? completedDate : (existing.deliveredAt || ''),
  }

  const batch = db.batch()
  batch.set(jobRef, jobUpdate, { merge: true })

  if (Array.isArray(sanitized.stockUpdates)) {
    // v13.5 PERF: same parallel-read fix as createInvoiceFull — one round
    // trip for ALL parts instead of sequential per-part awaits.
    const updates = (sanitized.stockUpdates as any[]).filter((su) => su?.id && su.deductQty)
    if (updates.length > 0) {
      const snaps = await Promise.all(
        updates.map((su) => db.collection('Items').doc(String(su.id)).get())
      )
      snaps.forEach((itemSnap, idx) => {
        const itemData = itemSnap.data() as any
        if (!itemData) return
        const su = updates[idx]
        const newQty = Math.max(0, Number(itemData.quantity || 0) - Number(su.deductQty))
        batch.set(db.collection('Items').doc(String(su.id)), { quantity: newQty, updatedAt: new Date().toISOString() }, { merge: true })
      })
    }
  }

  let paymentRow: any = null
  const jobPayment: any = sanitized.payment
  if (jobPayment && Number(jobPayment.amount) > 0) {
    const paymentId = generateId('spay')
    paymentRow = {
      id: paymentId,
      jobId,
      customerName: existing.customerName || '',
      amount: Number(jobPayment.amount) || 0,
      mode: jobPayment.mode || sanitized.paymentMode || 'cash',
      type: jobPayment.type || 'service',
      date: jobPayment.date || completedDate,
      notes: jobPayment.notes || '',
      createdAt: new Date().toISOString(),
      deleted: false,
    }
    batch.set(db.collection('ServicePayments').doc(paymentId), paymentRow)
  }

  await batch.commit()

  const updated = mergeWithCached('Jobs', jobId, { ...jobUpdate, id: jobId, status: jobUpdate.status })
  patchListCache('Jobs', updated, 'update')
  if (paymentRow) patchListCache('ServicePayments', paymentRow, 'create')
  invalidateCache('Items')
  invalidateCache('ItemSerials')
  invalidateAggregates()
  scheduleReconcile('Jobs')
  return { success: true, data: updated, payment: paymentRow }
}

// ===== EXPORT HELPERS =====
export async function exportSheetData(sheet: string): Promise<{ sheet: string; data: any[]; exportedAt: string }> {
  const data = await listRows(sheet, { useCache: false, includeDeleted: true })
  return {
    sheet,
    data,
    exportedAt: new Date().toISOString(),
  }
}

export async function exportAllData(): Promise<Record<string, any>> {
  const sheets = ['Shop', 'Items', 'Customers', 'Suppliers', 'Invoices', 'Quotations', 'Payments', 'Enquiries', 'Jobs', 'ServicePayments', 'Expenses', 'ItemSerials', 'PersonalExpenditure', 'Campaigns', 'AMCContracts', 'PurchaseOrders', 'SupplierPayments', 'StockAdjustments', 'ExpenseBudgets', 'GstReconciliations', 'Settings']
  const batch = await getBatchRows(sheets)
  return {
    version: '11.5',
    exportedAt: new Date().toISOString(),
    sheets: batch,
    backend: 'firestore',
  }
}

export function getCacheStats() {
  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    ttl: CACHE_TTL,
    ultraFast: true,
    version: '11.5',
    backend: 'firestore',
    circuitBreaker: {
      active: false,
      failures: 0,
      resetIn: 0,
    },
  }
}

// ===== ULTRA-ULTRA FAST v11.5 - aliases for backward compat =====
export async function createInvoiceUltra(data: any): Promise<any> {
  return createInvoiceFull(data)
}

export async function createQuotationUltra(data: any): Promise<any> {
  return createQuotationFull(data)
}

// ============================================================================
// v12.8 ATOMIC OPERATIONS — Firestore batch wrappers for multi-write flows
// ============================================================================
// These wrappers fix the silent-corruption bugs flagged in the v12.8 audit:
//   - Quotation → Invoice conversion was 5 separate writes with `.catch(() => {})`
//     on the payment create — partial failures left the invoice "paid" with no
//     payment row, stock not deducted, customer credit not adjusted.
//   - Invoice DELETE used `Promise.all(restoreOps)` THEN deleted the invoice —
//     if the invoice delete failed, restores were already committed.
//
// All wrappers below commit a single Firestore batch — either ALL writes
// succeed or NONE do. There is no partial state.
// ============================================================================

/**
 * Atomically convert a quotation into an invoice.
 *
 * Single Firestore batch performs all 5 writes:
 *   1. Create the invoice row
 *   2. Create the payment row (if amountPaid > 0) — NO MORE silent .catch
 *   3. Mark the quotation as `status: 'converted'`
 *   4. Deduct stock for each line item (using FieldValue.increment for atomicity)
 *   5. Adjust customer credit (only the unpaid portion)
 *
 * If ANY step fails, the entire batch is rolled back — no orphan invoice,
 * no missing payment, no undeducted stock.
 */
export async function convertQuotationToInvoice(opts: {
  quotationId: string
  quotation: any
  invoiceNumber: string
  invoiceId: string
  invoiceRow: any
  paymentRow?: any | null  // null = no payment
  stockUpdates?: { id: string; deductQty: number }[]
  customerUpdate?: { id: string; newCreditBalance: number } | null
}): Promise<{ success: true; invoiceId: string; invoiceNumber: string }> {
  const { quotationId, quotation: _quotation, invoiceNumber, invoiceId, invoiceRow, paymentRow, stockUpdates, customerUpdate } = opts

  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  // v12.8: Use Firestore FieldValue.increment for stock — atomic, no race.
  // Lazy-import to keep firebase-admin out of the route's cold-start path.
  const adminFirestore = await import('firebase-admin/firestore')
  const increment = (adminFirestore as any).FieldValue.increment

  const batch = db.batch()

  // 1. Create invoice
  batch.set(db.collection('Invoices').doc(invoiceId), invoiceRow)

  // 2. Create payment (if any) — NO MORE silent .catch
  if (paymentRow && paymentRow.id) {
    batch.set(db.collection('Payments').doc(String(paymentRow.id)), paymentRow)
  }

  // 3. Mark quotation converted
  batch.set(db.collection('Quotations').doc(quotationId), {
    status: 'converted',
    convertedToInvoiceId: invoiceId,
    updatedAt: new Date().toISOString(),
  }, { merge: true })

  // 4. Stock deduction — atomic via FieldValue.increment
  if (stockUpdates && stockUpdates.length > 0) {
    for (const su of stockUpdates) {
      if (!su.id || !su.deductQty) continue
      batch.set(db.collection('Items').doc(String(su.id)), {
        quantity: increment(-Math.abs(su.deductQty)),
        updatedAt: new Date().toISOString(),
      }, { merge: true })
    }
  }

  // 5. Customer credit adjustment
  if (customerUpdate && customerUpdate.id) {
    batch.set(db.collection('Customers').doc(String(customerUpdate.id)), {
      creditBalance: Number(customerUpdate.newCreditBalance) || 0,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
  }

  // Commit — atomic. All writes succeed or all fail.
  await batch.commit()

  // Patch the in-memory cache so the UI updates instantly without a refetch.
  patchListCache('Invoices', invoiceRow, 'create')
  if (paymentRow && paymentRow.id) patchListCache('Payments', paymentRow, 'create')
  patchListCache('Quotations', {
    id: quotationId,
    status: 'converted',
    convertedToInvoiceId: invoiceId,
  }, 'update')
  if (stockUpdates && stockUpdates.length > 0) {
    invalidateCache('Items')
  }
  if (customerUpdate && customerUpdate.id) {
    invalidateCache('Customers')
  }
  invalidateAggregates()
  scheduleReconcile('Invoices')
  scheduleReconcile('Quotations')
  if (paymentRow) scheduleReconcile('Payments')

  return { success: true, invoiceId, invoiceNumber }
}

/**
 * Atomically delete an invoice + restore stock + adjust customer credit +
 * delete associated payments.
 *
 * Single Firestore batch:
 *   1. Soft-delete the invoice
 *   2. Restore stock via FieldValue.increment(+qty) for each item
 *   3. Reduce customer credit by the invoice's amountDue
 *   4. Soft-delete all payments linked to this invoice
 *
 * If ANY step fails, the entire batch is rolled back — no half-restored state.
 */
export async function deleteInvoiceAtomic(opts: {
  invoiceId: string
  invoice: any
  stockRestores?: { id: string; restoreQty: number }[]
  customerUpdate?: { id: string; newCreditBalance: number } | null
  paymentIdsToDelete?: string[]
}): Promise<{ success: true; restoredStock: number; deletedPayments: number }> {
  const { invoiceId, invoice: _invoice, stockRestores, customerUpdate, paymentIdsToDelete } = opts

  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  const adminFirestore = await import('firebase-admin/firestore')
  const increment = (adminFirestore as any).FieldValue.increment

  const batch = db.batch()

  // 1. Soft-delete the invoice FIRST (so a partial failure leaves it deleted)
  batch.set(db.collection('Invoices').doc(invoiceId), {
    deleted: true,
    updatedAt: new Date().toISOString(),
  }, { merge: true })

  // 2. Restore stock atomically
  let restoredStock = 0
  if (stockRestores && stockRestores.length > 0) {
    for (const sr of stockRestores) {
      if (!sr.id || !sr.restoreQty) continue
      batch.set(db.collection('Items').doc(String(sr.id)), {
        quantity: increment(Math.abs(sr.restoreQty)),
        updatedAt: new Date().toISOString(),
      }, { merge: true })
      restoredStock++
    }
  }

  // 3. Customer credit adjustment
  if (customerUpdate && customerUpdate.id) {
    batch.set(db.collection('Customers').doc(String(customerUpdate.id)), {
      creditBalance: Number(customerUpdate.newCreditBalance) || 0,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
  }

  // 4. Soft-delete payments
  let deletedPayments = 0
  if (paymentIdsToDelete && paymentIdsToDelete.length > 0) {
    for (const pid of paymentIdsToDelete) {
      batch.set(db.collection('Payments').doc(String(pid)), {
        deleted: true,
        updatedAt: new Date().toISOString(),
      }, { merge: true })
      deletedPayments++
    }
  }

  await batch.commit()

  // Patch cache
  patchListCache('Invoices', { id: invoiceId, deleted: true }, 'delete')
  if (stockRestores && stockRestores.length > 0) invalidateCache('Items')
  if (customerUpdate && customerUpdate.id) invalidateCache('Customers')
  if (paymentIdsToDelete && paymentIdsToDelete.length > 0) invalidateCache('Payments')
  invalidateAggregates()
  scheduleReconcile('Invoices')
  if (paymentIdsToDelete && paymentIdsToDelete.length > 0) scheduleReconcile('Payments')

  return { success: true, restoredStock, deletedPayments }
}

// ============================================================================
// BACKUP & RESTORE (v12.8) — full Firestore export/import for Google Drive
// ============================================================================

/**
 * Export ALL collections to a single JSON object. Used by:
 *   - /api/backup GET (manual download)
 *   - /api/backup POST (scheduled Google Drive upload)
 *   - /api/cron/backup (daily auto-backup)
 *
 * The result is a self-contained JSON blob that can be restored via
 * `restoreAllData(json)`. Each sheet's rows are included with their
 * full document data (including soft-deleted rows).
 */
export async function exportAllDataForBackup(): Promise<{
  version: string
  exportedAt: string
  backend: string
  sheets: Record<string, { sheet: string; data: any[]; exportedAt: string }>
  totals: Record<string, number>
}> {
  const sheets = [
    'Shop', 'Items', 'Customers', 'Suppliers', 'Invoices', 'Quotations',
    'Payments', 'Enquiries', 'Jobs', 'ServicePayments', 'Expenses',
    'ItemSerials', 'PersonalExpenditure', 'Campaigns', 'AMCContracts',
    'PurchaseOrders', 'SupplierPayments', 'StockAdjustments',
    'ExpenseBudgets', 'GstReconciliations', 'Settings', 'Engineers',
  ]
  const batch = await getBatchRows(sheets)
  const totals: Record<string, number> = {}
  for (const sheet of sheets) {
    const rows = (batch as any)[sheet] || []
    totals[sheet] = Array.isArray(rows) ? rows.length : 0
  }
  return {
    version: '12.8',
    exportedAt: new Date().toISOString(),
    backend: 'firestore',
    sheets: batch as any,
    totals,
  }
}

/**
 * Restore data from a backup JSON. Two modes:
 *   - `mode: 'merge'` (default): only inserts rows whose id doesn't already exist.
 *     Existing rows are left untouched. Safe — never overwrites newer data.
 *   - `mode: 'overwrite'`: replaces all existing rows with the backup's version.
 *     Destructive — use only when the user explicitly confirms.
 *
 * Returns a summary of inserted / skipped / overwritten counts per sheet.
 */
export async function restoreAllData(
  backup: any,
  mode: 'merge' | 'overwrite' = 'merge',
): Promise<{
  summary: Record<string, { inserted: number; skipped: number; overwritten: number }>
  totalInserted: number
  totalSkipped: number
  totalOverwritten: number
}> {
  if (!backup || typeof backup !== 'object') {
    throw new Error('Invalid backup format — expected an object')
  }
  const sheets = backup.sheets || backup
  if (!sheets || typeof sheets !== 'object') {
    throw new Error('Invalid backup format — missing `sheets` field')
  }

  const db = await getDb()
  if (!db) throw new Error(getInitError() || 'Firebase not initialized')

  const summary: Record<string, { inserted: number; skipped: number; overwritten: number }> = {}
  let totalInserted = 0
  let totalSkipped = 0
  let totalOverwritten = 0

  for (const [sheetName, sheetData] of Object.entries(sheets)) {
    const rows = (sheetData as any)?.data || (sheetData as any) || []
    if (!Array.isArray(rows)) {
      summary[sheetName] = { inserted: 0, skipped: 0, overwritten: 0 }
      continue
    }

    summary[sheetName] = { inserted: 0, skipped: 0, overwritten: 0 }

    // For overwrite mode, fetch existing IDs once so we can report overwrites.
    let existingIds: Set<string> | null = null
    if (mode === 'overwrite') {
      try {
        const existing = await listRows<any>(sheetName, { useCache: false, includeDeleted: true })
        existingIds = new Set(existing.map((r) => String(r.id)))
      } catch {
        existingIds = new Set()
      }
    }

    // Batch the writes — Firestore allows up to 500 ops per batch.
    let batch = db.batch()
    let opsInBatch = 0
    for (const row of rows) {
      if (!row || !row.id) continue
      const rowId = String(row.id)

      if (mode === 'merge') {
        // For merge mode, check if the row already exists.
        // To avoid an extra read per row, we use create-or-merge semantics:
        // we set with merge:true so existing fields are preserved. But we
        // need to know if it existed. To keep this O(1) per row, we trust
        // the user's choice: merge mode = only set if not present.
        // For correctness, we DO read each row.
        try {
          const existing = await db.collection(sheetName).doc(rowId).get()
          if (existing.exists) {
            summary[sheetName].skipped++
            totalSkipped++
            continue
          }
        } catch {
          // If read fails, treat as not-existing and proceed to insert.
        }
      } else if (mode === 'overwrite' && existingIds && existingIds.has(rowId)) {
        summary[sheetName].overwritten++
        totalOverwritten++
      }

      batch.set(db.collection(sheetName).doc(rowId), row, { merge: mode === 'overwrite' })
      summary[sheetName].inserted++
      totalInserted++
      opsInBatch++

      if (opsInBatch >= 450) {
        await batch.commit()
        batch = db.batch()
        opsInBatch = 0
      }
    }
    if (opsInBatch > 0) {
      await batch.commit()
    }

    // Invalidate the cache for this sheet so the next read fetches fresh data.
    invalidateCache(sheetName)
  }

  invalidateAggregates()
  return { summary, totalInserted, totalSkipped, totalOverwritten }
}

