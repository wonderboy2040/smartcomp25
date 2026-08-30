/**
 * Offline Queue & Instant Optimistic Handler - ULTRA FAST v6.0
 * 
 * Features:
 * - Client-side number generation (instant, no server roundtrip for number)
 * - IndexedDB queue for offline support
 * - Instant return with temp ID, background sync to Google Sheets
 * - Rollback on failure with retry
 * 
 * This makes Add Item, Invoice, Quotation feel INSTANT (<100ms) even if server takes 2-4 sec
 */

type QueueOperation = {
  id: string
  type: 'create' | 'update' | 'delete'
  sheet: string
  url: string
  method: string
  body?: any
  timestamp: number
  retries: number
  tempId?: string
}

const DB_NAME = 'smartcomp_offline_queue'
const STORE_NAME = 'operations'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function addToQueue(op: Omit<QueueOperation, 'id' | 'timestamp' | 'retries'>): Promise<string> {
  try {
    const db = await openDB()
    // v13: enforce max queue size to prevent unbounded growth when offline for long
    const existing = await getQueue()
    const MAX_QUEUE_SIZE = 500
    if (existing.length >= MAX_QUEUE_SIZE) {
      // Drop oldest items (FIFO eviction) — keeps newest work intact
      const sorted = existing.sort((a, b) => a.timestamp - b.timestamp)
      const toDrop = sorted.slice(0, existing.length - MAX_QUEUE_SIZE + 1)
      for (const old of toDrop) {
        notifyQueueDrop(old, 'Queue size limit — oldest evicted')
        await removeFromQueue(old.id).catch(() => {})
      }
    }
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const newOp: QueueOperation = { ...op, id, timestamp: Date.now(), retries: 0 }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.add(newOp)
      req.onsuccess = () => resolve(id)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return ''
  }
}

export async function getQueue(): Promise<QueueOperation[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {}
}

export async function clearQueue(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {}
}

// Client-side TEMPORARY number generation - INSTANT, no server needed
// NOTE (v13): These are PLACEHOLDER numbers used only for the optimistic UI.
// The server ALWAYS assigns the final number on create. To make the
// transition seamless, the client marks queued ops with `clientNumber`
// which the server returns in the response — the UI then reconciles.
// This eliminates the previous collision bug where client-generated
// SCSS/fy/timestamp+random numbers conflicted with server-assigned
// SCSS/fy/seq numbers.
export function generateClientInvoiceNumber(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const fyStart = month >= 4 ? year : year - 1
  const fyEnd = fyStart + 1
  const fyShort = `${String(fyStart).slice(2)}-${String(fyEnd).slice(2)}`
  // Prefix with 'DRAFT-' so the server can detect and replace it
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.floor(Math.random() * 900 + 100)
  return `DRAFT-SCSS/${fyShort}/${timestamp}${random}`.slice(0, 22)
}

export function generateClientQuotationNumber(): string {
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.floor(Math.random() * 900 + 100)
  return `DRAFT-SCSS/QT/${timestamp}${random}`
}

export function generateClientJobNumber(): string {
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`
  const random = String(Math.floor(Math.random() * 900 + 100)).padStart(3, '0')
  return `DRAFT-SC${dateStr}${random}`
}

// Helper: detect if a number is a client-side draft placeholder
export function isDraftNumber(num: string | undefined | null): boolean {
  if (!num) return false
  return String(num).startsWith('DRAFT-')
}

// Background sync processor
let syncing = false

export async function processQueue(): Promise<{ success: number; failed: number }> {
  if (syncing) return { success: 0, failed: 0 }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { success: 0, failed: 0 }
  
  syncing = true
  let success = 0
  let failed = 0
  
  try {
    const queue = await getQueue()
    // Sort by timestamp
    queue.sort((a, b) => a.timestamp - b.timestamp)
    
    for (const op of queue) {
      try {
        const res = await fetch(op.url, {
          method: op.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(op.body),
        })

        if (res.ok) {
          await removeFromQueue(op.id)
          success++
        } else if (res.status >= 400 && res.status < 500) {
          // Client error (validation/auth) — retrying can never succeed.
          // Drop immediately and surface it so the user knows data was lost.
          await removeFromQueue(op.id)
          failed++
          console.error('Queue operation rejected permanently:', res.status, op)
          notifyQueueDrop(op, `Server rejected (${res.status})`)
        } else if (op.retries < 3) {
          // Server error / rate limit — transient, worth retrying
          try {
            const db = await openDB()
            const tx = db.transaction(STORE_NAME, 'readwrite')
            const store = tx.objectStore(STORE_NAME)
            store.put({ ...op, retries: op.retries + 1 })
          } catch {}
          failed++
        } else {
          await removeFromQueue(op.id)
          failed++
          console.error('Queue operation failed after 3 retries:', op)
          notifyQueueDrop(op, 'Failed after 3 retries')
        }
      } catch (e) {
        console.error('Queue sync error:', e)
        failed++
      }

      // Small delay between operations to avoid hammering
      await new Promise(r => setTimeout(r, 200))
    }
  } finally {
    syncing = false
  }
  
  return { success, failed }
}

/**
 * Fired when a queued operation is permanently dropped so its optimistic row
 * would never reach the server. Any mounted UI can listen for
 * 'smartcomp:queue-dropped' to warn the user before they assume success.
 */
function notifyQueueDrop(op: QueueOperation, reason: string): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('smartcomp:queue-dropped', {
      detail: { type: op.type, sheet: op.sheet, url: op.url, tempId: op.tempId, reason },
    }))
  } catch {}
}

// Auto-sync when online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.info('Back online, processing offline queue...')
    processQueue().then(result => {
      if (result.success > 0) {
        console.info(`Synced ${result.success} offline operations`)
        // Could show toast here
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`SmartComp: Synced ${result.success} operations`)
        }
      }
    })
  })
  
  // Periodic sync every 30 seconds if online
  setInterval(() => {
    if (navigator.onLine) {
      processQueue()
    }
  }, 30000)
}

// Check if we have pending offline operations
export async function hasPendingOperations(): Promise<boolean> {
  const queue = await getQueue()
  return queue.length > 0
}

export async function getPendingCount(): Promise<number> {
  const queue = await getQueue()
  return queue.length
}
