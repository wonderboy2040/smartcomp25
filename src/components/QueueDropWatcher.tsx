'use client'

import { useEffect } from 'react'
import { toast } from '@/hooks/use-toast'

/**
 * Global listener for permanently-dropped offline-queue operations.
 * When a queued create/update/delete can never reach the server, the user
 * must know — otherwise they see an optimistic row that silently vanishes.
 */
export function QueueDropWatcher() {
  useEffect(() => {
    function onDrop(e: Event) {
      const detail = (e as CustomEvent).detail || {}
      toast({
        variant: 'destructive',
        title: 'Offline change could not be saved',
        description: `${detail.reason || 'Sync failed'} — please re-enter it once you are back online.`,
        duration: 10000,
      })
    }
    window.addEventListener('smartcomp:queue-dropped', onDrop)
    return () => window.removeEventListener('smartcomp:queue-dropped', onDrop)
  }, [])

  return null
}
