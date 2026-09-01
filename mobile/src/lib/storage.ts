/**
 * SmartComp Mobile — AsyncStorage-backed cache.
 *
 * Used for offline reads of dashboard / lists. Read-through: if the API
 * responds, we cache the response; if the API fails (offline), we serve
 * the last-known-good response. TTL is 5 minutes for list endpoints and
 * 60 seconds for the dashboard (more volatile).
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes
const DASHBOARD_TTL = 60 * 1000 // 60 seconds

interface CacheEntry<T> {
  data: T
  at: number
  ttl: number
}

function key(path: string): string {
  return `smartcomp.cache.${path.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

export async function getCached<T>(path: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key(path))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    return parsed.data
  } catch {
    return null
  }
}

export async function getCachedFresh<T>(
  path: string
): Promise<{ data: T; at: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(key(path))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    return { data: parsed.data, at: parsed.at }
  } catch {
    return null
  }
}

export async function setCached<T>(
  path: string,
  data: T,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  const entry: CacheEntry<T> = { data, at: Date.now(), ttl }
  try {
    await AsyncStorage.setItem(key(path), JSON.stringify(entry))
  } catch {
    // ignore quota errors
  }
}

export async function isCacheFresh(path: string, ttl: number = DEFAULT_TTL): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key(path))
    if (!raw) return false
    const parsed = JSON.parse(raw) as CacheEntry<unknown>
    return Date.now() - parsed.at < (parsed.ttl || ttl)
  } catch {
    return false
  }
}

export async function invalidatePath(path: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(path))
  } catch {
    // ignore
  }
}

export async function clearAll(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const cacheKeys = keys.filter((k) => k.startsWith('smartcomp.cache.'))
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys)
    }
  } catch {
    // ignore
  }
}

export const CACHE_TTL = {
  DASHBOARD: DASHBOARD_TTL,
  LIST: DEFAULT_TTL,
  DETAIL: 60 * 60 * 1000, // 1 hour for detail pages (less volatile)
} as const
