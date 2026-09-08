'use client'

import { useEffect, useState } from 'react'

/**
 * v13.8 PERF: debounce a rapidly-changing value (search input) so the
 * expensive downstream work — list re-filter + full table re-render — runs
 * ONCE after the user stops typing instead of on every keystroke.
 *
 * The search input itself stays fully controlled and instant (it re-renders
 * only itself); the filtered list + row table follow 250ms later.
 *
 * Used by the heavy list panels (Invoices, Quotations, Jobs, Stock,
 * Suppliers) whose 200-2000 row re-renders per keystroke were the main
 * source of "typing lag" on low-end phones.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
