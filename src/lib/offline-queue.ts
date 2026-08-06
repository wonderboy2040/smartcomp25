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
    const id = `queue_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const fullOp: QueueOperation = {
      ...op,
      id,
      timestamp: Date.now(),
      retries: 0,
    }
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.add(fullOp)
      req.onsuccess = () => resolve(id)
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('Failed to add to offline queue:', e)
    throw e
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

// Client-side number generation - INSTANT, no server needed
export function generateClientInvoiceNumber(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const fyStart = month >= 4 ? year : year - 1
  const fyEnd = fyStart + 1
  const fyShort = `${String(fyStart).slice(2)}-${String(fyEnd).slice(2)}`
  // Use timestamp last 6 digits + random 3 digits for uniqueness
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.floor(Math.random() * 900 + 100)
  return `SCSS/${fyShort}/${timestamp}${random}`.slice(0, 18) // Keep reasonable length
}

export function generateClientQuotationNumber(): string {
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.floor(Math.random() * 900 + 100)
  return `SCSS/QT/${timestamp}${random}`
}

export function generateClientJobNumber(): string {
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`
  const random = String(Math.floor(Math.random() * 900 + 100)).padStart(3, '0')
  return `SC${dateStr}${random}`
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
        } else {
          // Retry logic
          if (op.retries < 3) {
            // Update retries
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
          }
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

// Auto-sync when online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('Back online, processing offline queue...')
    processQueue().then(result => {
      if (result.success > 0) {
        console.log(`Synced ${result.success} offline operations`)
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
