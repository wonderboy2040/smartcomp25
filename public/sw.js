/**
 * SmartComp Service Worker — runtime caching strategy.
 *
 * The previous version was a "self-destruct" SW that just unregistered
 * itself on every install. That was a workaround for a stale-cache bug
 * but it left the PWA with zero offline support (the manifest promises
 * installability).
 *
 * This version uses a stale-while-revalidate strategy for static assets
 * (so cached JS/CSS loads instantly even on slow networks) and network-first
 * for HTML and /api/* (so the user always sees fresh data when online,
 * with a cached fallback when offline).
 *
 * Versioned with a cache-busting SW_VERSION constant — bump on every
 * deploy so existing clients pick up the new precache list.
 */

const SW_VERSION = 'smartcomp-v12-6-1-pro'
const STATIC_CACHE = `${SW_VERSION}-static`
const RUNTIME_CACHE = `${SW_VERSION}-runtime`

// Hard cap on runtime-cache entries. Without a limit the cache grew forever
// on long-lived installs (every static asset + every /api GET ever fetched),
// eventually slowing cache.match() and eating device storage — visible as UI
// lag after weeks of use. FIFO eviction keeps the most recent entries.
const RUNTIME_CACHE_MAX_ENTRIES = 200

// Auth & mutation-adjacent endpoints must never be served from the offline
// cache — otherwise a logged-out device could keep reading PIN-protected
// data, and stale auth status can loop the login flow.
const NEVER_CACHE_API = [
  '/api/auth/',
  '/api/backup',
  '/api/export',
  '/api/whatsapp/send',
]

async function trimRuntimeCache(cache) {
  try {
    const keys = await cache.keys()
    const overflow = keys.length - RUNTIME_CACHE_MAX_ENTRIES
    if (overflow <= 0) return
    for (let i = 0; i < overflow; i++) await cache.delete(keys[i])
  } catch {
    /* non-fatal — best effort housekeeping */
  }
}

// Assets to precache on install. Keep this short — large precache lists
// slow down first install and waste storage on the device.
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/logo.svg',
  '/favicon.ico',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      // Use individual fetches with catch — a single failure shouldn't
      // abort the whole precache.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: 'no-store' })
            .then((res) => (res.ok ? cache.put(url, res) : null))
            .catch(() => null)
        )
      )
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete old caches from previous SW versions
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(SW_VERSION))
          .map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Only handle GET — POST/PUT/DELETE go straight to network
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Don't intercept cross-origin requests (analytics, fonts, etc.)
  if (url.origin !== self.location.origin) return

  // Strategy 1: Network-first for HTML and /api/* — always show fresh data
  // when online, fall back to cache when offline.
  const isHtml = req.mode === 'navigate' || req.destination === 'document'
  const isApi = url.pathname.startsWith('/api/')
  const sensitiveApi = NEVER_CACHE_API.some((p) => url.pathname.startsWith(p))
  if (isHtml || (isApi && !sensitiveApi)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: 'no-store' })
          // Only cache successful HTML/JSON responses
          if (fresh.ok) {
            const cache = await caches.open(RUNTIME_CACHE)
            await cache.put(req, fresh.clone())
            trimRuntimeCache(cache)
          }
          return fresh
        } catch (e) {
          // Offline — try cache, then offline.html for navigations
          const cached = await caches.match(req)
          if (cached) return cached
          if (isHtml) {
            const offline = await caches.match('/offline.html')
            if (offline) return offline
          }
          throw e
        }
      })()
    )
    return
  }

  // Strategy 2: Stale-while-revalidate for static assets (_next/static/*,
  // images, fonts). Returns cached version instantly if present, then
  // refreshes in the background for next time.
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE)
      const cached = await cache.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            cache.put(req, res.clone()).then(() => trimRuntimeCache(cache))
          }
          return res
        })
        .catch(() => cached) // network failed — fall through to cached (may be undefined)
      const resolved = cached || (await network)
      // BUGFIX: respondWith() rejects when handed undefined. Previously, a
      // first-ever fetch of an asset while offline produced a TypeError in
      // the fetch event and the browser had no response at all. Return a
      // synthetic 504 so callers get a proper network-style failure.
      if (resolved) return resolved
      return new Response('Offline — asset not cached', {
        status: 504,
        statusText: 'Gateway Timeout (offline)',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    })()
  )
})

// Allow the page to trigger an immediate update
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
