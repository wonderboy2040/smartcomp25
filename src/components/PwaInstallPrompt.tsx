'use client'

import { useState, useEffect } from 'react'
import { Download, X, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * PWA Install Prompt — shows a custom banner when the browser fires
 * the `beforeinstallprompt` event (Chrome/Edge/Android).
 * iOS Safari doesn't support this event, so iOS users get a one-time
 * tip to "Add to Home Screen" via the Share button.
 */
const DISMISS_KEY = 'smartcomp_pwa_install_dismissed'
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showIOS, setShowIOS] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if ((window.navigator as any).standalone === true) return

    // Check dismissal
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY)
      if (dismissed && Date.now() - Number(dismissed) < DISMISS_TTL) return
    } catch {}

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS detection (no beforeinstallprompt support)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)
    if (isIOS && isSafari) {
      // Show iOS tip after 3 seconds if not dismissed
      const t = setTimeout(() => setShowIOS(true), 3000)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', handler)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setVisible(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setVisible(false)
    setShowIOS(false)
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
  }

  if (!visible && !showIOS) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl shadow-2xl border border-slate-700 overflow-hidden">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">Install SmartComp App</p>
              <p className="text-xs text-slate-300 mt-0.5">
                {showIOS
                  ? 'Tap Share → Add to Home Screen for full-screen app experience'
                  : 'Works offline • Full-screen • Instant access'}
              </p>
              <div className="flex gap-2 mt-3">
                {!showIOS && (
                  <Button size="sm" onClick={handleInstall} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs">
                    <Download className="w-3.5 h-3.5 mr-1" /> Install
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 text-slate-400 hover:text-white text-xs">
                  Not now
                </Button>
              </div>
            </div>
            <button onClick={handleDismiss} className="text-slate-400 hover:text-white flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
