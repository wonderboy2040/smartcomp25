/**
 * SmartComp Service Worker registration.
 *
 * - Registers /sw.js on first load (gives offline PWA support).
 * - On every load, checks for a new SW version and triggers update.
 * - Cleans up only OLD caches (handled by sw.js activate handler) —
 *   no longer nukes ALL service workers like the previous self-destruct script.
 * - Listens for 'SKIP_WAITING' messages from the page to force-update.
 */
(function () {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  // Skip SW registration on localhost dev unless explicitly enabled,
  // to avoid caching confusion during development.
  const isLocalhost =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  const enableOnLocalhost = location.search.includes('sw=1')
  if (isLocalhost && !enableOnLocalhost) return

  function register() {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Bump SW_VERSION in sw.js on every deploy to trigger updates.
        if (reg.waiting) {
          // New version waiting — activate immediately.
          reg.waiting.postMessage('SKIP_WAITING')
        }
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && reg.waiting) {
              // New version installed — activate it now.
              reg.waiting.postMessage('SKIP_WAITING')
            }
          })
        })
        // If controller changed (new SW took over), reload once so the page
        // picks up the new precached assets.
        let refreshing = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return
          refreshing = true
          window.location.reload()
        })
      })
      .catch((err) => {
        // SW registration is non-fatal — app works without it.
        console.warn('[SW] registration failed:', err)
      })
  }

  // Register after window load so it doesn't compete with first paint.
  if (document.readyState === 'complete') {
    register()
  } else {
    window.addEventListener('load', register)
  }
})()
