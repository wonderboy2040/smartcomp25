'use client'

import { useState, useEffect } from 'react'

/**
 * v13.7 PERF: media-query hook.
 *
 * Heavy list panels (Invoices, Quotations, Customers, Stock, Jobs, Payments)
 * render BOTH a mobile card list and a desktop table, with one of them hidden
 * via CSS (`sm:hidden` / `hidden sm:block`). React still created and
 * reconciled both trees — on a phone that meant 200 hidden table rows being
 * rendered for nothing on every mount and every data refresh (the "lag").
 *
 * With this hook the panel renders only the layout the viewport actually
 * uses, halving the render work.
 *
 * Safe init: panels are lazy client-only components (mounted after user
 * interaction), so `window` exists on first render — no hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.matchMedia(query).matches
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      const mql = window.matchMedia(query)
      setMatches(mql.matches)
      const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    } catch {
      return undefined
    }
  }, [query])

  return matches
}

/** True when the viewport is at least the `sm` breakpoint (640px). */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 640px)')
}
