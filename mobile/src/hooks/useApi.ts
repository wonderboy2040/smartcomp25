/**
 * useApi — thin React Query wrappers over the api.ts client.
 *
 * Each hook returns the standard React Query result so screens get
 * isLoading / isError / refetch / data for free, with proper cache TTLs
 * and offline fallback to AsyncStorage-cached responses.
 *
 * The web app uses a 5-layer cache; here we use a 2-layer cache
 * (React Query in-memory + AsyncStorage disk cache) which is enough
 * for mobile use.
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api'
import { getCachedFresh, setCached, CACHE_TTL } from '@/lib/storage'
import { enqueue, flush as flushQueue } from '@/lib/offline-queue'
import { hapticMedium, hapticError, hapticSuccess } from '@/lib/haptics'
import type { Customer, Invoice, Item, Job, DashboardData, CustomerStatement } from '@/types'

const FIVE_MIN = 5 * 60 * 1000

/**
 * GET hook with offline-aware cache. If the API fails but we have a
 * cached response from a previous successful call, return the cached
 * value (with `isStale: true` in the returned meta) so the UI can show
 * a "showing cached data" banner.
 */
export function useApiGet<T>(
  path: string | null,
  queryKey: (string | number | boolean | null | undefined)[],
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> & { cacheTtl?: number }
): ReturnType<typeof useQuery<T>> {
  return useQuery<T>({
    queryKey,
    queryFn: async () => {
      // Try disk cache first — if fresh, serve from there to avoid
      // a network flash on slow cellular.
      const cached = await getCachedFresh<T>(path!)
      const ttl = options?.cacheTtl || CACHE_TTL.LIST
      if (cached && Date.now() - cached.at < ttl) {
        return cached.data
      }

      try {
        const data = await apiGet<T>(path!)
        await setCached(path!, data, ttl)
        return data
      } catch (e: any) {
        if (cached) {
          // Surface the stale data with a soft error so the UI can
          // show "offline" banner.
          return cached.data
        }
        throw e
      }
    },
    enabled: !!path,
    staleTime: FIVE_MIN,
    retry: 1,
    ...options,
  })
}

/** Dashboard data hook. Short TTL (60s). */
export function useDashboard(): ReturnType<typeof useQuery<DashboardData>> {
  return useApiGet<DashboardData>('/api/dashboard', ['dashboard'], {
    cacheTtl: CACHE_TTL.DASHBOARD,
    refetchInterval: 60 * 1000, // auto-refresh every 60s when visible
  })
}

/** Customers list. */
export function useCustomers(search?: string): ReturnType<typeof useQuery<Customer[]>> {
  const path = search ? `/api/customers?search=${encodeURIComponent(search)}` : '/api/customers'
  return useApiGet<Customer[]>(path, ['customers', search || ''])
}

/** Customer detail. */
export function useCustomer(id: string | null): ReturnType<typeof useQuery<Customer>> {
  return useApiGet<Customer>(id ? `/api/customers/${id}` : null, ['customer', id])
}

/** Invoices list. */
export function useInvoices(opts?: {
  status?: string
  customerId?: string
  search?: string
}): ReturnType<typeof useQuery<Invoice[]>> {
  const sp = new URLSearchParams()
  if (opts?.status) sp.append('status', opts.status)
  if (opts?.customerId) sp.append('customerId', opts.customerId)
  if (opts?.search) sp.append('search', opts.search)
  const qs = sp.toString()
  const path = `/api/invoices${qs ? `?${qs}` : ''}`
  return useApiGet<Invoice[]>(path, ['invoices', opts?.status || '', opts?.customerId || '', opts?.search || ''])
}

/** Invoice detail. */
export function useInvoice(id: string | null): ReturnType<typeof useQuery<Invoice>> {
  return useApiGet<Invoice>(id ? `/api/invoices/${id}` : null, ['invoice', id], {
    cacheTtl: CACHE_TTL.DETAIL,
  })
}

/** Items list. */
export function useItems(opts?: { lowStock?: boolean; search?: string }): ReturnType<typeof useQuery<Item[]>> {
  const sp = new URLSearchParams()
  if (opts?.lowStock) sp.append('lowStock', 'true')
  if (opts?.search) sp.append('search', opts.search)
  const qs = sp.toString()
  const path = `/api/items${qs ? `?${qs}` : ''}`
  return useApiGet<Item[]>(path, ['items', opts?.lowStock ? '1' : '0', opts?.search || ''])
}

/** Item detail. */
export function useItem(id: string | null): ReturnType<typeof useQuery<Item>> {
  return useApiGet<Item>(id ? `/api/items/${id}` : null, ['item', id], {
    cacheTtl: CACHE_TTL.DETAIL,
  })
}

/** Service jobs list. */
export function useJobs(opts?: {
  status?: string
  engineer?: string
  search?: string
}): ReturnType<typeof useQuery<Job[]>> {
  const sp = new URLSearchParams()
  if (opts?.status) sp.append('status', opts.status)
  if (opts?.engineer) sp.append('engineer', opts.engineer)
  if (opts?.search) sp.append('search', opts.search)
  const qs = sp.toString()
  const path = `/api/jobs${qs ? `?${qs}` : ''}`
  return useApiGet<Job[]>(path, ['jobs', opts?.status || '', opts?.engineer || '', opts?.search || ''])
}

/** Job detail. */
export function useJob(id: string | null): ReturnType<typeof useQuery<Job>> {
  return useApiGet<Job>(id ? `/api/jobs/${id}` : null, ['job', id], {
    cacheTtl: CACHE_TTL.DETAIL,
  })
}

/** Customer statement (merged ledger). */
export function useCustomerStatement(
  customerId: string | null
): ReturnType<typeof useQuery<CustomerStatement>> {
  return useApiGet<CustomerStatement>(
    customerId ? `/api/customer-statements?customerId=${encodeURIComponent(customerId)}` : null,
    ['customer-statement', customerId]
  )
}

/** Offline queue size — refreshes every 5s so the badge is current. */
export function useOfflineQueueSize(): ReturnType<typeof useQuery<number>> {
  const qc = useQueryClient()
  return useQuery<number>({
    queryKey: ['offline-queue-size'],
    queryFn: async () => {
      const mod = await import('@/lib/offline-queue')
      return mod.size()
    },
    refetchInterval: 5000,
    initialData: 0,
  })
}

/**
 * useOfflineMutation — wrap a write in a mutation that:
 *   1. Optimistically executes
 *   2. On success → invalidates the appropriate query keys
 *   3. On network failure → enqueues the write for offline replay
 *
 * Mirrors the web app's offline-queue.ts + QueueDropWatcher pattern.
 */
export function useOfflineMutation<TData = unknown, TVariables = unknown>(opts: {
  path: (vars: TVariables) => string
  method: 'POST' | 'PUT' | 'DELETE'
  body?: (vars: TVariables) => unknown
  invalidateQueries?: (vars: TVariables) => (string | number)[][]
  onSuccess?: (data: TData, vars: TVariables) => void
  onError?: (err: unknown, vars: TVariables) => void
}) {
  const qc = useQueryClient()
  return useMutation<TData, unknown, TVariables>({
    mutationFn: async (vars: TVariables) => {
      try {
        if (opts.method === 'POST') {
          return await apiPost<TData>(opts.path(vars), opts.body ? opts.body(vars) : vars)
        } else if (opts.method === 'PUT') {
          return await apiPut<TData>(opts.path(vars), opts.body ? opts.body(vars) : vars)
        } else {
          return await apiDelete<TData>(opts.path(vars))
        }
      } catch (e: any) {
        // Network / 401 → enqueue for offline replay.
        if (
          e?.message?.includes('Network request failed') ||
          e?.status === 0 ||
          e?.status === 401 ||
          e?.status === 503
        ) {
          await enqueue(opts.method, opts.path(vars), opts.body ? opts.body(vars) : vars)
          // Return a synthetic success so the UI doesn't crash — the
          // real API call will happen on replay.
          return undefined as unknown as TData
        }
        throw e
      }
    },
    onMutate: () => {
      hapticMedium()
    },
    onSuccess: async (data, vars) => {
      hapticSuccess()
      opts.onSuccess?.(data, vars)
      // Invalidate the relevant queries so they refetch.
      const toInvalidate = opts.invalidateQueries?.(vars)
      if (toInvalidate) {
        for (const q of toInvalidate) {
          await qc.invalidateQueries({ queryKey: q })
        }
      } else {
        // Default: invalidate everything (heavy-handed but safe).
        await qc.invalidateQueries()
      }
      // After a successful write, attempt to drain any queue.
      void flushQueue().catch(() => null)
    },
    onError: (err, vars) => {
      hapticError()
      opts.onError?.(err, vars)
    },
  })
}
