'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { ExternalLink, Copy, CheckCircle2, Loader2, AlertCircle, Sparkles, ShieldCheck, Cloud, Flame, Zap } from 'lucide-react'

/**
 * SetupWizard (v11.5 — Firebase only).
 *
 * Shown by src/app/page.tsx when /api/config returns `configured: false`.
 * Walks the user through creating a Firebase service account, copying the
 * service-account JSON, base64-encoding it, and pasting it into the
 * FIREBASE_SERVICE_ACCOUNT_BASE64 env var on Render / Vercel — or, in
 * desktop mode, into the in-app form below.
 *
 * Apps Script / Google Sheets option has been completely removed.
 */
export function SetupWizard() {
  const { toast } = useToast()
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedCmd, setCopiedCmd] = useState(false)
  const [configStatus, setConfigStatus] = useState<{ configured: boolean; runtimeConfigActive?: boolean } | null>(null)
  const [b64Input, setB64Input] = useState('')
  const [pinInput, setPinInput] = useState('')

  const checkConfig = async () => {
    try {
      const r = await fetch('/api/config')
      const data = await r.json()
      setConfigStatus(data)
      if (data.configured) {
        window.location.reload()
      }
    } catch {}
  }

  useEffect(() => {
    // Poll every 5 seconds to check if env var has been set
    const interval = setInterval(checkConfig, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleTest = async () => {
    setTesting(true)
    try {
      const r = await fetch('/api/config', { method: 'POST' })
      const res = await r.json()
      if (res.success) {
        toast({ title: 'Connection successful!', description: 'Firestore is reachable.' })
      } else {
        toast({ title: 'Connection failed', description: res.message, variant: 'destructive' })
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setTesting(false)
    }
  }

  // Desktop-only: save Firebase creds to runtime config file via the API
  const handleSaveDesktop = async () => {
    if (!b64Input.trim()) {
      toast({ title: 'Service account required', description: 'Paste the base64-encoded service-account JSON.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseServiceAccountBase64: b64Input.trim(), appPin: pinInput.trim() }),
      })
      const res = await r.json()
      if (res.success) {
        toast({ title: 'Saved!', description: 'Connecting to Firestore...' })
        setTimeout(() => window.location.reload(), 800)
      } else {
        toast({ title: 'Save failed', description: res.message, variant: 'destructive' })
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const copyCmd = () => {
    const cmd = `base64 service-account.json | tr -d '\\n'`
    navigator.clipboard.writeText(cmd)
    setCopiedCmd(true)
    setTimeout(() => setCopiedCmd(false), 2000)
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-3 sm:p-4 safe-top safe-bottom">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-amber-400 to-orange-600 rounded-2xl shadow-lg shadow-amber-500/30 mb-4">
            <Flame className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
          </div>
          <h1 className="text-xl sm:text-3xl font-bold text-white mb-2">Welcome to Smart Computers</h1>
          <p className="text-sm sm:text-base text-slate-400 px-2">Firebase setup — one-time, ultra fast (sub-100ms reads).</p>
        </div>

        {/* Status banner */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-200">Setup Required</p>
            <p className="text-xs text-amber-300/80 mt-0.5">
              {configStatus?.runtimeConfigActive
                ? 'Desktop mode: paste your base64-encoded Firebase service-account JSON below.'
                : 'FIREBASE_SERVICE_ACCOUNT_BASE64 env var is not set. Follow the steps below.'}
            </p>
          </div>
        </div>

        {/* Desktop-mode creds entry */}
        {configStatus?.runtimeConfigActive && (
          <Card className="bg-card/95 backdrop-blur border border-amber-500/40 shadow-2xl mb-4">
            <CardContent className="p-4 sm:p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-amber-500" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Connect to Firebase</h2>
              </div>
              <p className="text-xs text-slate-600">
                Paste the base64-encoded service-account JSON. All your data will sync live across Mobile, Tablet, Browser and this Desktop app via the same Firestore project.
              </p>
              <textarea
                placeholder="Paste base64-encoded service-account JSON here..."
                value={b64Input}
                onChange={(e) => setB64Input(e.target.value)}
                className="w-full min-h-[100px] rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-mono"
              />
              <Input
                type="password"
                placeholder="Optional: 4-8 digit PIN lock"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="h-11 text-sm"
                inputMode="numeric"
                pattern="\d{4,8}"
              />
              <Button onClick={handleSaveDesktop} disabled={saving} className="w-full bg-amber-600 hover:bg-amber-700 h-11">
                {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</> : <><ShieldCheck className="w-4 h-4 mr-1.5" /> Save & Connect</>}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Steps */}
        <Card className="bg-card/95 backdrop-blur border border-border shadow-2xl">
          <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900">One-Time Firebase Setup (4 Steps)</h2>
            </div>

            {/* Step 1 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-amber-700">1</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 text-sm sm:text-base">Create a Firebase Project</p>
                <p className="text-xs text-slate-600 mt-1">
                  Go to{' '}
                  <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-amber-600 hover:underline inline-flex items-center gap-0.5">
                    console.firebase.google.com <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  → Add project → name it (e.g. <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">smartcomp-prod</code>) → Continue. No Google Analytics needed.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-amber-700">2</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 text-sm sm:text-base">Create a Service Account</p>
                <p className="text-xs text-slate-600 mt-1">
                  Project settings → Service accounts tab → Click <strong>Generate new private key</strong> → Save the JSON file as <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">service-account.json</code>.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-amber-700">3</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 text-sm sm:text-base">Base64-encode the JSON</p>
                <p className="text-xs text-slate-600 mt-1">Run this command in your terminal:</p>
                <div className="mt-2 bg-slate-900 rounded-lg p-3 font-mono text-[10px] sm:text-xs text-slate-300 overflow-x-auto flex items-center justify-between gap-2">
                  <div>
                    <div className="text-slate-500"># macOS / Linux</div>
                    <div className="mt-1 break-all"><span className="text-amber-400">base64</span> service-account.json | tr -d '\n'</div>
                    <div className="text-slate-500 mt-2"># Windows (PowerShell)</div>
                    <div className="mt-1 break-all"><span className="text-amber-400">[Convert]::ToBase64String</span>([IO.File]::ReadAllBytes('service-account.json'))</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={copyCmd} className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 h-7 text-xs flex-shrink-0">
                    {copiedCmd ? <><CheckCircle2 className="w-3 h-3 mr-1" /> Copied!</> : <><Copy className="w-3 h-3 mr-1" /> Copy</>}
                  </Button>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-amber-700">4</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 text-sm sm:text-base">Set Environment Variable</p>
                <p className="text-xs text-slate-600 mt-1">
                  Paste the base64 string as <code className="bg-slate-900 text-amber-400 px-1.5 py-0.5 rounded text-[10px]">FIREBASE_SERVICE_ACCOUNT_BASE64</code> on Render / Vercel:
                </p>
                <div className="mt-2 bg-slate-900 rounded-lg p-3 font-mono text-[10px] sm:text-xs text-slate-300 overflow-x-auto">
                  <div className="text-slate-500"># Render / Vercel Environment Variables:</div>
                  <div className="mt-1 break-all"><span className="text-amber-400">FIREBASE_SERVICE_ACCOUNT_BASE64</span>=<span className="text-emerald-300">eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwicHJvamVjdF9pZCI6InNtYXJ0Y29tcC...</span></div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  After setting this, the app will automatically detect it and load. No need to refresh manually.
                </p>
              </div>
            </div>

            {/* Test button */}
            <div className="pt-3 border-t border-slate-200">
              <Button onClick={handleTest} disabled={testing} className="w-full bg-slate-900 hover:bg-slate-800 h-11">
                {testing ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Testing...</> : <><ShieldCheck className="w-4 h-4 mr-1.5" /> Test Connection</>}
              </Button>
              <p className="text-xs text-slate-500 text-center mt-2">
                <Zap className="w-3 h-3 inline mr-1 text-amber-500" />
                Ultra fast · Sub-100ms reads · 50K free reads/day · Free 1 GiB storage
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500 mt-4 sm:mt-6">
          Need help? Check the README.md file in your project for detailed Firebase setup instructions.
        </p>
      </div>
    </div>
  )
}
