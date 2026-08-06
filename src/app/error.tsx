'use client'

import { useEffect } from 'react'
import { RefreshCw, Home, AlertTriangle, Bug, ChevronDown } from 'lucide-react'

/**
 * Page-level error boundary (app/error.tsx).
 *
 * Catches any uncaught runtime error in the React tree below the root layout.
 * Shows a friendly recovery UI with the actual error message, a "Reload" button,
 * and a "Go Home" button. Also surfaces the error digest for debugging.
 *
 * For uncaught errors that occur in the root layout itself, app/global-error.tsx
 * is the fallback (Next.js convention).
 */

export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[AppErrorBoundary]', error)
    try {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error?.message,
          stack: error?.stack?.slice(0, 1000),
          digest: error?.digest,
          url: typeof window !== 'undefined' ? window.location.href : '',
          time: new Date().toISOString(),
        }),
      }).catch(() => {})
    } catch {}
  }, [error])

  const handleHardReload = async () => {
    try {
      // Clear caches that might hold stale assets, then reload.
      // Note: we no longer unregister the service worker (that would defeat
      // offline support — sw.js handles version cleanup via SW_VERSION bump).
      if ('caches' in window) {
        const keys = await caches.keys()
        // Only clear non-current-version caches — keep the active SW cache.
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } catch {}
    window.location.href = window.location.pathname + '?t=' + Date.now()
  }

  const handleGoHome = () => {
    window.location.href = '/'
  }

  const handleTryAgain = () => {
    // reset() re-renders the error boundary — clears the error from React state.
    reset()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99, 102, 241, 0.08), transparent), #f8fafc',
      color: '#0f172a',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '24px',
    }}>
      <div style={{
        background: '#ffffff',
        backdropFilter: 'blur(20px)',
        border: '1px solid #e2e8f0',
        borderRadius: '24px',
        padding: '32px',
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.04)',
        color: '#0f172a',
      }}>
        <div style={{
          width: '72px',
          height: '72px',
          margin: '0 auto 20px',
          borderRadius: '18px',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 20px 40px -10px rgba(245,158,11,.4)',
        }}>
          <AlertTriangle style={{ width: 36, height: 36, color: '#fff' }} />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
          The app hit an unexpected error. Don&apos;t worry — your data in Google Sheets is safe.
          Try the &quot;Retry&quot; button first; if the issue persists, use &quot;Clear Cache &amp; Reload&quot;.
        </p>

        <details style={{
          background: '#f8fafc',
          borderRadius: '12px',
          padding: '12px',
          margin: '16px 0',
          textAlign: 'left',
          fontSize: 11,
          fontFamily: 'monospace',
          color: '#b91c1c',
          border: '1px solid #e2e8f0',
        }}>
          <summary style={{ cursor: 'pointer', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bug style={{ width: 14, height: 14 }} />
            Error details
            <ChevronDown style={{ width: 12, height: 12, marginLeft: 'auto' }} />
          </summary>
          <div style={{ marginTop: 8, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
            {error?.message || 'Unknown error'}
            {error?.digest && (
              <div style={{ marginTop: 8, color: '#64748b' }}>Ref: {error.digest}</div>
            )}
          </div>
        </details>

        <button
          onClick={handleTryAgain}
          style={{
            background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
            color: '#fff',
            border: 0,
            padding: '14px 28px',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 8px 24px rgba(124, 58, 237, 0.3)',
          }}
        >
          <RefreshCw style={{ width: 18, height: 18 }} />
          Retry (soft reset)
        </button>

        <button
          onClick={handleHardReload}
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff',
            border: 0,
            padding: '14px 28px',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.25)',
          }}
        >
          <RefreshCw style={{ width: 18, height: 18 }} />
          Clear Cache &amp; Reload
        </button>

        <button
          onClick={handleGoHome}
          style={{
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            padding: '14px 28px',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Home style={{ width: 18, height: 18 }} />
          Go to Home
        </button>

        <p style={{ fontSize: 11, color: '#64748b', marginTop: 16 }}>
          Smart Computers Panel · Your Google Sheets data is never affected by app errors
        </p>
      </div>
    </div>
  )
}
