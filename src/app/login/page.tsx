'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Store, Loader2, Lock, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react'

function LoginInner() {
  const params = useSearchParams()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pinRequired, setPinRequired] = useState<boolean | null>(null)
  const [success, setSuccess] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    fetch('/api/auth/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setPinRequired(!!d.pinRequired))
      .catch(() => setPinRequired(true))
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.length < 4) { setError('Please enter a valid PIN (4-8 digits)'); return }
    setLoading(true)
    setError('')
    setSuccess(false)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        credentials: 'include',
        cache: 'no-store',
      })
      const d = await r.json().catch(() => ({}))
      
      if (!r.ok) {
        setError(d.error || 'Incorrect PIN. Please try again.')
        setPin('')
        setTimeout(() => inputRef.current?.focus(), 100)
        return
      }
      
      setSuccess(true)
      let nextUrl = params.get('next') || '/'
      if (!nextUrl.startsWith('/')) nextUrl = '/'
      if (nextUrl.startsWith('//')) nextUrl = '/'
      
      setTimeout(() => {
        window.location.href = nextUrl
      }, 600)
      
    } catch {
      setError('Network error. Please check connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (pinRequired === false) {
      window.location.href = '/'
    }
  }, [pinRequired])

  if (pinRequired === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background text-foreground transition-colors duration-300">
      {/* Subtle background ambient — premium light gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-10 bg-gradient-to-br from-primary to-primary/50 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-10 bg-gradient-to-br from-emerald-500 to-emerald-300 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.02] bg-gradient-to-br from-primary via-transparent to-transparent blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20">
            <Store className="w-9 h-9 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Smart Computers</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">Sales & Service Panel</p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border bg-card text-card-foreground shadow-xl shadow-black/[0.05] overflow-hidden">
          <div className="p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-foreground">Enter PIN</h2>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <div className="relative">
                  <input
                    ref={inputRef}
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="\d{4,8}"
                    autoComplete="off"
                    value={pin}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 8)
                      setPin(v)
                      if (error) setError('')
                      if (success) setSuccess(false)
                    }}
                    placeholder="••••"
                    className="w-full text-center text-2xl tracking-[0.4em] font-mono py-4 px-12 rounded-xl border-2 bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-bold"
                    disabled={loading || success}
                    aria-label="Enter PIN"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
                    aria-label={showPin ? "Hide PIN" : "Show PIN"}
                  >
                    {showPin ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-3 flex items-start gap-2.5 animate-in slide-in-from-top-1">
                  <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-destructive">Incorrect PIN</p>
                    <p className="text-xs text-destructive/80 mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              {success && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 flex items-center gap-2.5 animate-in slide-in-from-top-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400">Access Granted</p>
                    <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Redirecting...</p>
                  </div>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || pin.length < 4 || success}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/20 transition-all active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Login
                  </>
                )}
              </button>

            </form>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground/70 font-medium">
            Smart Computers © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading secure access...</p>
          </div>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  )
}
