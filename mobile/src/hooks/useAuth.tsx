/**
 * useAuth — auth context provider + hook.
 *
 * Wraps the React Query bootstrap + auth state machine so any screen
 * can read `isAuthenticated`, `pinRequired`, `login(pin)`, `logout()`
 * without re-fetching /api/auth/status on every screen.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loginWithPin, logout as apiLogout, bootstrapAuth } from '@/lib/auth'
import { flush as flushQueue } from '@/lib/offline-queue'
import { hapticError, hapticSuccess } from '@/lib/haptics'
import type { AuthStatus } from '@/types'

interface AuthContextValue {
  status: AuthStatus
  loading: boolean
  login: (pin: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>({ pinRequired: false, authenticated: false })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const s = await bootstrapAuth()
    setStatus(s)
    if (s.authenticated) {
      // After successful auth bootstrap, kick the offline queue in case
      // any writes are pending.
      void flushQueue().catch(() => null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const s = await bootstrapAuth()
      if (!cancelled) {
        setStatus(s)
        setLoading(false)
        if (s.authenticated) void flushQueue().catch(() => null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(
    async (pin: string) => {
      const res = await loginWithPin(pin)
      if (res.success) {
        await refresh()
        hapticSuccess()
      } else {
        hapticError()
      }
      return res
    },
    [refresh]
  )

  const logout = useCallback(async () => {
    await apiLogout()
    setStatus({ pinRequired: status.pinRequired, authenticated: false })
  }, [status.pinRequired])

  const value = useMemo<AuthContextValue>(
    () => ({ status, loading, login, logout, refresh }),
    [status, loading, login, logout, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
