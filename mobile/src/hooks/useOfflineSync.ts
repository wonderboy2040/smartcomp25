/**
 * useOfflineSync — exposes the offline queue size + a flush trigger.
 * Used by the Settings screen and the queue badge on the More tab.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { flush, peekAll, clear as clearQueue } from '@/lib/offline-queue'

export function useOfflineSync() {
  const qc = useQueryClient()

  const sizeQuery = useQuery({
    queryKey: ['offline-queue-size'],
    queryFn: async () => {
      const items = await peekAll()
      return items.length
    },
    refetchInterval: 5000,
    initialData: 0,
  })

  const peekQuery = useQuery({
    queryKey: ['offline-queue-peek'],
    queryFn: () => peekAll(),
    refetchInterval: 10000,
  })

  const flushMutation = useMutation({
    mutationFn: async (force = false) => flush(force),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['offline-queue-size'] })
      await qc.invalidateQueries({ queryKey: ['offline-queue-peek'] })
    },
  })

  const clearMutation = useMutation({
    mutationFn: async () => clearQueue(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['offline-queue-size'] })
      await qc.invalidateQueries({ queryKey: ['offline-queue-peek'] })
    },
  })

  return {
    size: sizeQuery.data || 0,
    entries: peekQuery.data || [],
    flush: () => flushMutation.mutateAsync(true),
    clear: () => clearMutation.mutateAsync(),
    isFlushing: flushMutation.isPending,
  }
}
