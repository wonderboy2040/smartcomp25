/**
 * SmartComp Mobile — offline-first write queue.
 *
 * Mirrors the web app's offline-queue.ts behaviour: any POST/PUT/DELETE
 * that fails due to network or auth-cookie-expiry is queued locally and
 * replayed on next foreground event.
 *
 * The web app uses IndexedDB; the mobile app uses AsyncStorage (simpler,
 * RN-native, no schema migrations). Entries are JSON-serializable so they
 * survive app crashes and reboots.
 *
 * Replay is throttled (3s between batches) and respects a max retry count
 * (default 10). After 10 retries the entry is dropped and the user is
 * notified so they don't get stuck with a forever-pending write.
 *
 * Auto-replay triggers:
 *   1. AppState 'active' (app comes to foreground)
 *   2. Every enqueue() call (best-effort immediate flush)
 *   3. Manual flush button on the Settings screen
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, type AppStateStatus } from 'react-native'
import { apiRequest, getAuthCookie } from './api'
import type { OfflineQueueEntry } from '@/types'

const STORAGE_KEY = 'smartcomp.offlineQueue'
const MAX_RETRIES = 10

let queue: OfflineQueueEntry[] | null = null
let isFlushing = false
let lastFlushAt = 0
const FLUSH_DEBOUNCE_MS = 3000

let appStateSubscribed = false
function ensureAppStateListener(): void {
  if (appStateSubscribed) return
  appStateSubscribed = true
  try {
    AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void flush().catch(() => null)
      }
    })
  } catch {
    // AppState might be unavailable on web-preview
  }
}

export async function enqueue(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<string> {
  const entry: OfflineQueueEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method,
    path,
    body,
    createdAt: Date.now(),
    retryCount: 0,
  }
  const q = await load()
  q.push(entry)
  await persist()
  ensureAppStateListener()
  void flush().catch(() => null)
  return entry.id
}

async function load(): Promise<OfflineQueueEntry[]> {
  if (queue) return queue
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    queue = raw ? (JSON.parse(raw) as OfflineQueueEntry[]) : []
  } catch {
    queue = []
  }
  return queue
}

async function persist(): Promise<void> {
  if (!queue) return
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // ignore
  }
}

export async function size(): Promise<number> {
  const q = await load()
  return q.length
}

export async function peekAll(): Promise<OfflineQueueEntry[]> {
  const q = await load()
  return [...q]
}

export async function remove(id: string): Promise<void> {
  const q = await load()
  const idx = q.findIndex((e) => e.id === id)
  if (idx >= 0) {
    q.splice(idx, 1)
    await persist()
  }
}

export async function clear(): Promise<void> {
  queue = []
  await persist()
}

/**
 * Attempt to flush all queued writes. Throttled to avoid hot-looping
 * when offline + retry timer + foreground event all fire in quick
 * succession.
 */
export async function flush(force = false): Promise<{ flushed: number; failed: number }> {
  if (isFlushing) return { flushed: 0, failed: 0 }
  const now = Date.now()
  if (!force && now - lastFlushAt < FLUSH_DEBOUNCE_MS) {
    return { flushed: 0, failed: 0 }
  }
  isFlushing = true
  lastFlushAt = now

  const q = await load()
  let flushed = 0
  let failed = 0
  // Snapshot the queue length so we don't process entries added during flush
  // in this same call. They'll be picked up next time.
  const snapshot = [...q]
  for (const entry of snapshot) {
    if (!getAuthCookie()) {
      // Not authenticated — wait until login.
      break
    }
    try {
      await apiRequest(entry.path, {
        method: entry.method,
        body: entry.body,
        timeoutMs: 15000,
      })
      await remove(entry.id)
      flushed++
    } catch (e: any) {
      entry.retryCount = (entry.retryCount || 0) + 1
      entry.lastError = String(e?.message || e).slice(0, 200)
      if (entry.retryCount >= MAX_RETRIES) {
        await remove(entry.id)
        failed++
      } else {
        // Update the entry in-place so the persisted queue reflects the
        // new retry count.
        const idx = q.findIndex((x) => x.id === entry.id)
        if (idx >= 0) q[idx] = entry
      }
    }
  }
  await persist()
  isFlushing = false
  return { flushed, failed }
}
