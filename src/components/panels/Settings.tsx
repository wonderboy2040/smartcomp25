'use client'

import { useState, useEffect } from 'react'
import { useFetch, apiPost, apiPut } from '@/lib/api'
// Import from pdf-templates, NOT @/lib/pdf — the latter pulls jspdf +
// jspdf-autotable + qrcode into the client bundle (autotable is side-effectful
// and cannot be tree-shaken).
import { PDF_TEMPLATES, AD_BANNER_VARIANTS } from '@/lib/pdf-templates'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Store, Settings as SettingsIcon, FileSpreadsheet, RefreshCw, CheckCircle2, AlertCircle, Database, Sparkles, Code, Copy, ExternalLink, Loader2, ShieldCheck, Zap, Cloud, Send, X, Bug, Download, HardDrive, Activity, Cpu, BarChart3, FileJson, FileText, Star, Megaphone } from 'lucide-react'
import { BUSINESS_GROWTH } from '@/lib/business-growth'

export function SettingsPanel() {
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-4 sm:p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
            <SettingsIcon className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">Settings</h1>
            <p className="text-xs sm:text-sm text-slate-300 truncate">Configure your shop info and view sync status</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="shop">
        <TabsList className="grid w-full grid-cols-6 h-auto">
          <TabsTrigger value="shop" className="flex items-center gap-1 py-2 text-[11px] sm:text-xs">
            <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Shop
          </TabsTrigger>
          <TabsTrigger value="growth" className="flex items-center gap-1 py-2 text-[11px] sm:text-xs">
            <Megaphone className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Growth</span><span className="sm:hidden">Grow</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-1 py-2 text-[11px] sm:text-xs">
            <Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">WhatsApp</span><span className="sm:hidden">WA</span>
          </TabsTrigger>
          <TabsTrigger value="sync" className="flex items-center gap-1 py-2 text-[11px] sm:text-xs">
            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Sync
          </TabsTrigger>
          <TabsTrigger value="data" className="flex items-center gap-1 py-2 text-[11px] sm:text-xs">
            <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Data
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex items-center gap-1 py-2 text-[11px] sm:text-xs">
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Backup v3.0</span><span className="sm:hidden">Backup</span>
          </TabsTrigger>
        </TabsList>

        {/* ===== Growth & Marketing Tab ===== */}
        <TabsContent value="growth">
          <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Star className="w-4 h-4 text-amber-600" />
                </div>
                Google Review Link
              </CardTitle>
              <CardDescription>
                Your Google review link is automatically embedded in PDF invoice footers and WhatsApp share messages. More reviews = higher local search ranking.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-white border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-slate-500 uppercase font-medium">Your Review URL</p>
                  <p className="text-sm font-mono text-slate-900 truncate">{BUSINESS_GROWTH.googleReviewUrl}</p>
                </div>
                <a
                  href={BUSINESS_GROWTH.googleReviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex-shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </a>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-xs text-emerald-900 font-medium mb-1">✓ Where it shows up:</p>
                <ul className="text-[11px] text-emerald-700 space-y-0.5 ml-4 list-disc">
                  <li>PDF invoice footer (every invoice/quotation/service invoice)</li>
                  <li>WhatsApp share message (when invoice is fully paid)</li>
                  <li>Customer tracking page (track/[jobId])</li>
                  <li>Daily Business Snapshot reports</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white shadow-sm mt-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Megaphone className="w-4 h-4 text-violet-600" />
                </div>
                Marketing Campaigns
              </CardTitle>
              <CardDescription>
                Pre-built WhatsApp campaign templates. Tap to copy and share with customers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'newCustomer', label: '🎁 New Customer Offer', desc: 'Rs.200 OFF first service' },
                { key: 'repeat', label: '🙏 Repeat Customer', desc: 'Priority service + free cleaning' },
                { key: 'winback', label: '👋 Win-Back (Inactive 60d+)', desc: '15% OFF + free diagnostic' },
                { key: 'festival', label: '🎊 Festival Offer', desc: 'Up to 20% OFF' },
              ].map((c) => (
                <div key={c.key} className="bg-white border border-violet-200 rounded-lg p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{c.label}</p>
                    <p className="text-[11px] text-slate-500">{c.desc}</p>
                    <p className="text-[11px] text-slate-700 mt-1.5 line-clamp-2">{BUSINESS_GROWTH.campaigns[c.key as keyof typeof BUSINESS_GROWTH.campaigns]}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0 border-violet-200 text-violet-700 hover:bg-violet-50"
                    onClick={() => {
                      navigator.clipboard?.writeText(BUSINESS_GROWTH.campaigns[c.key as keyof typeof BUSINESS_GROWTH.campaigns])
                    }}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm mt-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                </div>
                Referral Program
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-white border border-emerald-200 rounded-lg p-3">
                <p className="text-sm text-slate-700 whitespace-pre-line">{BUSINESS_GROWTH.referralOffer}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shop" className="mt-4">
          <ShopSettings />
        </TabsContent>
        <TabsContent value="whatsapp" className="mt-4 space-y-4">
          <WhatsAppSettings />
          <MigrationHelper />
        </TabsContent>
        <TabsContent value="sync" className="mt-4">
          <SyncStatus />
        </TabsContent>
        <TabsContent value="data" className="mt-4">
          <DataSettings />
        </TabsContent>
        <TabsContent value="backup" className="mt-4 space-y-4">
          <BackupExport />
          <SystemHealth />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ShopSettings() {
  const { toast } = useToast()
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const { data: shop, refetch } = useFetch<any>('/api/shop', undefined)
  const { data: recentInvoices } = useFetch<any[]>('/api/invoices?limit=1', undefined)

  const designTemplate = form.pdfTemplate || 'tally-classic'
  const designBanner = form.adBannerVariant || 'flyer'
  const previewInvoiceId = (recentInvoices && recentInvoices[0] && recentInvoices[0].id) || null
  // Debounce the live preview so rapid template/banner toggles don't each
  // trigger a full (heavy) server-side PDF regeneration + iframe reload.
  const [debouncedDesign, setDebouncedDesign] = useState({ template: designTemplate, banner: designBanner })
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDesign({ template: designTemplate, banner: designBanner }), 450)
    return () => clearTimeout(t)
  }, [designTemplate, designBanner])
  const previewUrl = previewInvoiceId
    ? `/api/pdf/${previewInvoiceId}?type=invoice&template=${encodeURIComponent(debouncedDesign.template)}&banner=${encodeURIComponent(debouncedDesign.banner)}`
    : null

  useEffect(() => {
    if (shop) setForm({ ...shop, pdfTemplate: shop.pdfTemplate || 'tally-classic', adBannerVariant: shop.adBannerVariant || 'flyer' })
  }, [shop])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPut('/api/shop', form)
      toast({ title: 'Shop settings saved' })
      refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Store className="w-4 h-4 text-emerald-600" />
          </div>
          Shop Information
        </CardTitle>
        <CardDescription>This info appears on your invoices and quotations</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Shop Name *</Label>
            <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Owner Name</Label>
            <Input value={form.owner || ''} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>GST Number</Label>
            <Input value={form.gstNumber || ''} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} placeholder="29ABCDE1234F1Z5" className="mt-1" />
          </div>
          <div>
            <Label>State</Label>
            <Input value={form.state || ''} onChange={(e) => setForm({ ...form, state: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Invoice Prefix</Label>
            <Input value={form.invoicePrefix || ''} onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Quotation Prefix</Label>
            <Input value={form.quotationPrefix || ''} onChange={(e) => setForm({ ...form, quotationPrefix: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>UPI ID (for Invoice QR Code)</Label>
            <Input value={form.upiId || ''} onChange={(e) => setForm({ ...form, upiId: e.target.value })} placeholder="yourname@upi" className="mt-1" />
          </div>
          <div>
            <Label>Bank Name</Label>
            <Input value={form.bankName || ''} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="State Bank of India" className="mt-1" />
          </div>
          <div>
            <Label>Account Number</Label>
            <Input value={form.bankAccount || ''} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} placeholder="41400936006" className="mt-1" />
          </div>
          <div>
            <Label>IFSC Code</Label>
            <Input value={form.bankIfsc || ''} onChange={(e) => setForm({ ...form, bankIfsc: e.target.value })} placeholder="SBIN0015319" className="mt-1" />
          </div>
          <div>
            <Label>Branch</Label>
            <Input value={form.bankBranch || ''} onChange={(e) => setForm({ ...form, bankBranch: e.target.value })} placeholder="Yadgir" className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Textarea value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label>Default Invoice Terms</Label>
            <Textarea value={form.termsInvoice || ''} onChange={(e) => setForm({ ...form, termsInvoice: e.target.value })} rows={2} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label>Default Quotation Terms</Label>
            <Textarea value={form.termsQuotation || ''} onChange={(e) => setForm({ ...form, termsQuotation: e.target.value })} rows={2} className="mt-1" />
          </div>
        </div>
        {/* ===== Invoice & Quotation Design (template + banner + live preview) ===== */}
        <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white shadow-sm mt-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-indigo-600" />
              </div>
              Invoice &amp; Quotation Design
            </CardTitle>
            <CardDescription>Choose the default PDF template &amp; ad banner. Saved to settings and used for every Invoice, Quotation &amp; Service Invoice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">PDF Template</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {PDF_TEMPLATES.map((tpl) => {
                  const active = (form.pdfTemplate || 'tally-classic') === tpl.id
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setForm({ ...form, pdfTemplate: tpl.id })}
                      className={`p-2.5 rounded-xl border-2 text-left transition-all ${active ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-4 h-4 rounded" style={{ background: `rgb(${tpl.accent.join(',')})` }} />
                        <span className="text-[11px] font-bold text-slate-900 truncate">{tpl.name}</span>
                      </div>
                      <p className="text-[9px] text-slate-500 line-clamp-2 leading-tight">{tpl.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Ad Banner (bottom showcase)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {AD_BANNER_VARIANTS.map((v) => {
                  const active = (form.adBannerVariant || 'flyer') === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setForm({ ...form, adBannerVariant: v.id })}
                      className={`p-2.5 rounded-xl border-2 text-left transition-all ${active ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <span className="text-[11px] font-bold text-slate-900">{v.name}</span>
                      <p className="text-[9px] text-slate-500 line-clamp-2 leading-tight mt-0.5">{v.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">Live Preview</p>
                {previewUrl && <a href={previewUrl} download target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="h-7 text-[11px]">Download PDF</Button></a>}
              </div>
              {previewUrl ? (
                <iframe src={previewUrl} title="Invoice design preview" className="w-full h-[520px] rounded-xl border border-slate-200 bg-white" />
              ) : (
                <div className="w-full h-40 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-center text-xs text-slate-500 px-4">
                  Create at least one invoice to see a live preview here. Your saved template &amp; banner will apply automatically.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Button onClick={handleSave} disabled={saving} className="bg-slate-900 hover:bg-slate-800 mt-2 w-full sm:w-auto">
          {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...</> : 'Save Shop Info'}
        </Button>
      </CardContent>
    </Card>
  )
}

function SyncStatus() {
  const { toast } = useToast()
  const { data: status, refetch } = useFetch<any>('/api/sheets/sync', undefined)
  const { data: settingsInfo } = useFetch<any>('/api/settings', undefined)
  const [testing, setTesting] = useState(false)
  const [debugging, setDebugging] = useState(false)
  const [copying, setCopying] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [codeContent, setCodeContent] = useState<string>('')
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastSuccess, setLastSuccess] = useState<string | null>(null)
  const [debugResult, setDebugResult] = useState<any | null>(null)

  const handleTest = async () => {
    setTesting(true)
    setLastError(null)
    setLastSuccess(null)
    try {
      const r = await fetch('/api/settings', { method: 'POST' })
      const res = await r.json()
      if (res.success) {
        setLastSuccess(res.message || 'Connected to Google Sheets successfully!')
        toast({ title: 'Connection successful!', description: 'Your Google Sheet is connected.' })
      } else {
        setLastError(res.message || 'Connection failed')
        toast({ title: 'Connection failed', description: 'See details below', variant: 'destructive', duration: 10000 })
      }
      refetch()
    } catch (e: any) {
      setLastError(e.message || 'Network error')
      toast({ title: 'Error', description: e.message, variant: 'destructive', duration: 10000 })
    } finally {
      setTesting(false)
    }
  }

  const handleCopyCode = async () => {
    setCopying(true)
    try {
      const r = await fetch('/api/apps-script-code')
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${r.status}`)
      }
      const text = await r.text()
      setCodeContent(text)

      // Try clipboard copy
      try {
        await navigator.clipboard.writeText(text)
        toast({
          title: 'Code copied to clipboard!',
          description: 'Now paste it into your Apps Script editor (Ctrl+A → Delete → Ctrl+V).',
          duration: 8000,
        })
      } catch {
        // Clipboard API failed — show the code in a modal so user can manually copy
        setShowCode(true)
        toast({
          title: 'Could not auto-copy',
          description: 'Click "Show code" to view and manually copy the code.',
          duration: 8000,
        })
      }
    } catch (e: any) {
      toast({ title: 'Could not fetch code', description: e.message, variant: 'destructive', duration: 10000 })
    } finally {
      setCopying(false)
    }
  }

  const handleDownloadCode = async () => {
    try {
      const r = await fetch('/api/apps-script-code')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const text = await r.text()
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'code.gs'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: 'Downloaded code.gs', description: 'Open this file → copy contents → paste into Apps Script editor.' })
    } catch (e: any) {
      toast({ title: 'Download failed', description: e.message, variant: 'destructive' })
    }
  }

  const handleDebug = async () => {
    setDebugging(true)
    setDebugResult(null)
    try {
      const r = await fetch('/api/debug-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'GET', action: 'test' }),
      })
      const res = await r.json()
      setDebugResult(res)
      if (res.success && res.looksLikeJson) {
        toast({ title: 'Apps Script is working!', description: 'Response is valid JSON' })
      } else {
        toast({ title: 'See debug output below', description: res.diagnosis || 'Check the response details', variant: 'destructive', duration: 10000 })
      }
    } catch (e: any) {
      setDebugResult({ error: e.message, bodyPreview: e.stack })
      toast({ title: 'Debug failed', description: e.message, variant: 'destructive' })
    } finally {
      setDebugging(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
              <Cloud className="w-4 h-4 text-violet-600" />
            </div>
            Google Sheets Sync Status
          </CardTitle>
          <CardDescription>Your data is stored directly in Google Sheets via Apps Script</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Show the configured URL (masked) so user can verify format */}
          {settingsInfo?.urlConfigured && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Code className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <span className="text-xs font-medium text-slate-700">Configured APPS_SCRIPT_URL:</span>
              </div>
              <code className="block text-[10px] sm:text-xs bg-white px-2 py-1.5 rounded border border-slate-200 break-all font-mono text-slate-600">
                {settingsInfo.urlPreview || '(not set)'}
              </code>
              <div className="flex items-center gap-2 flex-wrap">
                {settingsInfo.urlEndsWithExec ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> URL ends with /exec ✓
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
                    <AlertCircle className="w-3 h-3 mr-1" /> URL does NOT end with /exec ✗
                  </Badge>
                )}
                {settingsInfo.urlPreview && (
                  <a
                    href={settingsInfo.urlPreview.includes('...')
                      ? '#'
                      : settingsInfo.urlPreview + '?action=test&t=' + Date.now()}
                    target="_blank"
                    rel="noreferrer"
                    className={`text-[10px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 ${settingsInfo.urlPreview.includes('...') ? 'pointer-events-none opacity-50' : ''}`}
                    onClick={(e) => {
                      if (settingsInfo.urlPreview.includes('...')) {
                        e.preventDefault()
                        toast({ title: 'Cannot open masked URL', description: 'The URL is masked for security. Open it manually in your browser.', variant: 'destructive' })
                      }
                    }}
                  >
                    <ExternalLink className="w-3 h-3" /> Open in browser
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-emerald-100/50 rounded-xl border border-emerald-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">
                  {status?.enabled ? 'Connected to Google Sheets' : 'Not Connected'}
                </p>
                <p className="text-xs text-slate-600">
                  {status?.enabled ? 'All data syncs in real-time' : 'APPS_SCRIPT_URL not set'}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              Active
            </Badge>
          </div>

          {/* Desktop-mode: change cloud URL / PIN without reinstalling */}
          {settingsInfo?.runtimeConfigActive && (
            <DesktopCloudConfigEditor />
          )}

          {status?.counts && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 p-3 rounded-xl text-center border border-blue-100">
                <p className="text-2xl font-bold text-blue-700">{status.counts.invoices}</p>
                <p className="text-xs text-blue-600 mt-0.5">Invoices</p>
              </div>
              <div className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 p-3 rounded-xl text-center border border-cyan-100">
                <p className="text-2xl font-bold text-cyan-700">{status.counts.quotations}</p>
                <p className="text-xs text-cyan-600 mt-0.5">Quotations</p>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-3 rounded-xl text-center border border-emerald-100">
                <p className="text-2xl font-bold text-emerald-700">{status.counts.payments}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Payments</p>
              </div>
            </div>
          )}

          {/* ===== ONE-CLICK FIX: Copy latest Apps Script code ===== */}
          <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm">
                  Quick Fix: Update your Apps Script code (v2.7)
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  If Test Connection fails or returns HTML, your deployed Apps Script is outdated.
                  Click below to copy the latest code, then paste it into your Apps Script editor.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleCopyCode}
                disabled={copying}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1 min-w-[160px]"
                size="sm"
              >
                {copying
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Copying...</>
                  : <><Copy className="w-4 h-4 mr-1.5" /> Copy latest Apps Script code</>}
              </Button>
              <Button
                onClick={handleDownloadCode}
                variant="outline"
                size="sm"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-100"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Download code.gs
              </Button>
              {codeContent && (
                <Button
                  onClick={() => setShowCode(s => !s)}
                  variant="ghost"
                  size="sm"
                  className="text-slate-600"
                >
                  <Code className="w-4 h-4 mr-1.5" /> {showCode ? 'Hide' : 'Show'} code
                </Button>
              )}
            </div>

            {/* Collapsible code viewer (shown if clipboard failed or user clicked Show) */}
            {showCode && codeContent && (
              <div className="mt-3">
                <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[10px] sm:text-xs overflow-auto max-h-72">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700 sticky top-0 bg-slate-900 -mt-3 -mx-3 px-3 pt-3">
                    <span className="font-semibold text-cyan-400">apps-script/code.gs (v2.7, {codeContent.length} chars)</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(codeContent); toast({ title: 'Copied to clipboard' }) }}
                      className="text-emerald-400 hover:text-emerald-300 text-[10px] font-medium"
                    >
                      <Copy className="w-3 h-3 inline mr-1" /> Copy
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap break-all text-slate-300">{codeContent}</pre>
                </div>
              </div>
            )}

            {/* Step-by-step instructions */}
            <details className="mt-3 group">
              <summary className="text-xs font-medium text-emerald-700 cursor-pointer hover:text-emerald-800 list-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                Show step-by-step deployment instructions
              </summary>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-700 mt-2 pl-2">
                <li>Click <strong>"Copy latest Apps Script code"</strong> above (or download the file).</li>
                <li>Open your Google Sheet → click <strong>Extensions → Apps Script</strong>.</li>
                <li>In the Apps Script editor, press <strong>Ctrl+A</strong> (select all) then <strong>Delete</strong>.</li>
                <li>Press <strong>Ctrl+V</strong> to paste the new code. Press <strong>Ctrl+S</strong> to save.</li>
                <li>Click <strong>Deploy → Manage deployments</strong> in the top-right.</li>
                <li>Click the <strong>pencil (edit) icon</strong> on your existing deployment.</li>
                <li>Under <strong>Version</strong>, select <strong>"New version"</strong>.</li>
                <li>Set <strong>"Who has access"</strong> to <strong>"Anyone"</strong>.</li>
                <li>Click <strong>Deploy</strong> → authorize if prompted → copy the new <code className="bg-emerald-100 px-1 rounded">/exec</code> URL.</li>
                <li>Update your <code className="bg-emerald-100 px-1 rounded">APPS_SCRIPT_URL</code> env var on Render/Vercel if the URL changed → redeploy.</li>
                <li>Come back here → click <strong>"Test Connection"</strong>. It should succeed.</li>
              </ol>
            </details>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleTest} disabled={testing} className="flex-1">
              {testing ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Testing...</> : <><Zap className="w-4 h-4 mr-1.5" /> Test Connection</>}
            </Button>
            <Button variant="outline" onClick={handleDebug} disabled={debugging} className="flex-1">
              {debugging ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Debugging...</> : <><Bug className="w-4 h-4 mr-1.5" /> Debug Connection</>}
            </Button>
          </div>

          {/* Debug result — shows the FULL response from Apps Script */}
          {debugResult && (
            <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[10px] sm:text-xs overflow-x-auto max-h-80 overflow-y-auto">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700">
                <span className="font-semibold text-cyan-400">Apps Script Response</span>
                <button onClick={() => setDebugResult(null)} className="text-slate-400 hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1">
                <div><span className="text-slate-400">Status:</span> <span className={debugResult.success ? 'text-green-400' : 'text-red-400'}>{debugResult.status} {debugResult.statusText}</span></div>
                <div><span className="text-slate-400">Content-Type:</span> <span className="text-yellow-300">{debugResult.contentType}</span></div>
                <div><span className="text-slate-400">Redirected:</span> <span className="text-yellow-300">{String(debugResult.redirected)}</span></div>
                {debugResult.finalUrl && <div><span className="text-slate-400">Final URL:</span> <span className="text-yellow-300 break-all">{debugResult.finalUrl}</span></div>}
                <div><span className="text-slate-400">Body length:</span> <span className="text-yellow-300">{debugResult.bodyLength} chars</span></div>
                <div><span className="text-slate-400">Page title:</span> <span className="text-yellow-300">{debugResult.title || '(none)'}</span></div>
                <div><span className="text-slate-400">Is JSON:</span> <span className={debugResult.looksLikeJson ? 'text-green-400' : 'text-red-400'}>{String(debugResult.looksLikeJson)}</span></div>
                <div><span className="text-slate-400">Is HTML:</span> <span className={debugResult.isHtml ? 'text-red-400' : 'text-green-400'}>{String(debugResult.isHtml)}</span></div>
                <div><span className="text-slate-400">Looks like login page:</span> <span className={debugResult.looksLikeLoginPage ? 'text-red-400' : 'text-green-400'}>{String(debugResult.looksLikeLoginPage)}</span></div>
                <div><span className="text-slate-400">Looks like error page:</span> <span className={debugResult.looksLikeErrorPage ? 'text-red-400' : 'text-green-400'}>{String(debugResult.looksLikeErrorPage)}</span></div>
              </div>
              {debugResult.diagnosis && (
                <div className="mt-2 p-2 bg-blue-900/50 rounded text-blue-200 text-xs leading-relaxed">
                  <span className="font-semibold">Diagnosis: </span>{debugResult.diagnosis}
                </div>
              )}
              <div className="mt-2">
                <div className="text-slate-400 mb-1">Body preview (first 2000 chars):</div>
                <pre className="whitespace-pre-wrap break-all text-slate-300">{debugResult.bodyPreview}</pre>
              </div>
            </div>
          )}

          {/* Persistent error/success display — stays visible until dismissed */}
          {lastError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-red-800 mb-1">Connection Failed</p>
                <p className="text-xs text-red-700 break-words whitespace-pre-wrap">{lastError}</p>
              </div>
              <button onClick={() => setLastError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {lastSuccess && !lastError && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-emerald-800 mb-1">Connected!</p>
                <p className="text-xs text-emerald-700 break-words">{lastSuccess}</p>
              </div>
              <button onClick={() => setLastSuccess(null)} className="text-emerald-400 hover:text-emerald-600 flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Quick Fix guide — shown when there's an error */}
          {lastError && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mt-2">
              <div className="flex items-start gap-2">
                <Bug className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 flex-1 min-w-0">
                  <p className="font-bold mb-2">Quick Fix Guide (3 steps):</p>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>
                      <strong>Open your Google Sheet</strong> → Extensions → Apps Script
                    </li>
                    <li>
                      <strong>Delete everything</strong> in the code editor, then paste the <strong>NEW</strong> code.gs from this app's <code className="bg-amber-100 px-1 rounded">apps-script/code.gs</code> file (v2.6 — fixed test action)
                    </li>
                    <li>
                      Click <strong>Deploy → Manage deployments</strong> → click the pencil icon → <strong>Version: New version</strong> → <strong>Deploy</strong> → copy the new <code className="bg-amber-100 px-1 rounded">/exec</code> URL
                    </li>
                  </ol>
                  <div className="mt-3 p-2 bg-white border border-amber-200 rounded text-[11px]">
                    <p className="font-semibold mb-1">Why this happens:</p>
                    <p>The Apps Script returned an HTML error page (titled "SmartComp") instead of JSON. This means the OLD script code has a runtime error — usually because it tries to access sheets before checking if the script is properly deployed. The NEW code (v2.6) handles the <code className="bg-amber-100 px-1 rounded">test</code> action WITHOUT touching sheets, so Test Connection will work even if sheets aren't set up yet.</p>
                  </div>
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-[11px]">
                    <p className="font-semibold mb-1">After updating code.gs:</p>
                    <p>1. Click <strong>"Debug Connection"</strong> button above — it should now show "Is JSON: true" and "Status: 200"</p>
                    <p>2. Then click <strong>"Test Connection"</strong> — it should succeed</p>
                    <p>3. Refresh the page — data will start loading</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-2">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700">
                <p className="font-medium mb-1">How it works:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Data is stored directly in your Google Sheet (no other database)</li>
                  <li>APPS_SCRIPT_URL env var connects your app to the Sheet</li>
                  <li>6 sheets auto-created: Shop, Items, Customers, Suppliers, Invoices, Quotations, Payments, Enquiries</li>
                  <li>Multi-device support: any device accessing this URL sees the same data</li>
                  <li>Works on Render/Vercel free tier (no database needed)</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Code className="w-4 h-4 text-white" />
            </div>
            Apps Script Setup Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p className="font-medium text-slate-900">Open Google Sheets</p>
                <p className="text-xs text-slate-600">
                  <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                    sheets.new <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p className="font-medium text-slate-900">Open Apps Script</p>
                <p className="text-xs text-slate-600">Extensions → Apps Script</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p className="font-medium text-slate-900">Paste code from apps-script/code.gs</p>
                <p className="text-xs text-slate-600">Then Deploy → Web app → Anyone access</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <p className="font-medium text-slate-900">Set APPS_SCRIPT_URL env var</p>
                <p className="text-xs text-slate-600">In Render/Vercel dashboard, add environment variable</p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

function DataSettings() {
  const { toast } = useToast()
  const [seeding, setSeeding] = useState(false)

  const handleSeed = async () => {
    if (!confirm('Load sample data? This will add demo items, customers, and suppliers. Existing data will not be modified.')) return
    setSeeding(true)
    try {
      await apiPost('/api/seed/init', {})
      toast({ title: 'Sample data loaded', description: 'Demo items, customers, and suppliers added' })
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setSeeding(false)
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
            <Database className="w-4 h-4 text-orange-600" />
          </div>
          Data Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900 mb-1">Quick Setup</p>
              <p className="text-xs text-blue-700 mb-3">
                Load demo data to quickly explore the system. Includes sample items (laptops, RAM, SSDs, etc.), customers, and suppliers with WhatsApp numbers.
              </p>
              <Button onClick={handleSeed} disabled={seeding} size="sm" className="bg-blue-600 hover:bg-blue-700">
                {seeding ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Loading...</> : 'Load Sample Data'}
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 space-y-2">
          <p className="font-medium text-slate-700">Data Storage Info:</p>
          <p>All data is stored in your Google Sheet (configured via APPS_SCRIPT_URL).</p>
          <p>No local database - works on Render/Vercel free tier.</p>
          <p>Multi-device support: all devices share the same Google Sheet data.</p>
          <p>To view raw data: open your Google Sheet directly.</p>
        </div>
      </CardContent>
    </Card>
  )
}

function WhatsAppSettings() {
  const { toast } = useToast()
  const { data: status } = useFetch<any>('/api/whatsapp/status', undefined)
  const [testPhone, setTestPhone] = useState('')
  const [testMsg, setTestMsg] = useState('Hello from Smart Computers Panel — this is a test message.')
  const [sending, setSending] = useState(false)

  const handleTest = async () => {
    if (!testPhone) {
      toast({ title: 'Enter a phone number', variant: 'destructive' })
      return
    }
    setSending(true)
    try {
      const r = await apiPost('/api/whatsapp/test-send', { phone: testPhone, message: testMsg })
      if (r.success) {
        toast({ title: 'Test message sent', description: `Message ID: ${r.messageId || 'OK'}` })
      } else {
        toast({ title: 'Send failed', description: r.error || 'Unknown error', variant: 'destructive' })
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  const configured = !!status?.configured

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Cloud className="w-5 h-5 text-green-600" /> WhatsApp Cloud API
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Configure automatic message sending and incoming reply capture. Set the env vars below in your Render dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className={`rounded-lg p-3 ${configured ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          <div className="flex items-start gap-2">
            {configured ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />}
            <div className="text-sm flex-1">
              <p className={`font-medium ${configured ? 'text-emerald-900' : 'text-amber-900'}`}>
                {configured ? 'Cloud API: Connected' : 'Cloud API: Not configured'}
              </p>
              {configured ? (
                <div className="text-xs text-emerald-700 mt-1 space-y-0.5">
                  <p>Business number: <code className="bg-white px-1 rounded">{status?.businessNumber}</code></p>
                  <p>Phone Number ID: <code className="bg-white px-1 rounded">{status?.phoneNumberId}</code></p>
                  <p>Template: <code className="bg-white px-1 rounded">{status?.templateName}</code></p>
                  <p>Webhook verify token: {status?.verifyTokenSet ? '✓ set' : '✗ not set'}</p>
                </div>
              ) : (
                <p className="text-xs text-amber-700 mt-1">
                  Set the env vars below in Render dashboard to enable automatic sending + reply capture.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Required env vars */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Required Environment Variables (set in Render dashboard):</p>
          <div className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs font-mono space-y-1 overflow-x-auto">
            <div><span className="text-emerald-400">WA_TOKEN</span>=your_permanent_access_token</div>
            <div><span className="text-emerald-400">WA_PHONE_NUMBER_ID</span>=123456789012345</div>
            <div><span className="text-emerald-400">WA_BUSINESS_NUMBER</span>=919876543210</div>
            <div><span className="text-emerald-400">WA_VERIFY_TOKEN</span>=smartcomp_wh_2026</div>
            <div><span className="text-emerald-400">WA_TEMPLATE_NAME</span>=rate_enquiry  <span className="text-slate-500"># optional, default: rate_enquiry</span></div>
          </div>
        </div>

        {/* Setup steps */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Setup steps (one-time, ~15 min):</p>
          <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside">
            <li>Go to <a href="https://business.facebook.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">business.facebook.com</a> → create a Meta Business account (free).</li>
            <li>Add a new app → choose "Business" type → add "WhatsApp" product.</li>
            <li>Get a new SIM with a number you don't use for personal WhatsApp. Add it as a test number in Meta.</li>
            <li>Copy the <strong>Permanent Access Token</strong> and <strong>Phone Number ID</strong> from WhatsApp → API Setup.</li>
            <li>Set these as <code className="bg-slate-100 px-1 rounded">WA_TOKEN</code> and <code className="bg-slate-100 px-1 rounded">WA_PHONE_NUMBER_ID</code> env vars in Render.</li>
            <li>Create a message template named <code className="bg-slate-100 px-1 rounded">rate_enquiry</code> in WhatsApp → Message Templates (body: "Hello {'{1}'}, please provide rates for: {'{2}'}"). Wait for approval (~2 hours).</li>
            <li>In WhatsApp → Configuration, set webhook URL to <code className="bg-slate-100 px-1 rounded">https://your-render-url/api/whatsapp/webhook</code> and verify token = <code className="bg-slate-100 px-1 rounded">WA_VERIFY_TOKEN</code> value. Subscribe to "messages" field.</li>
            <li>Redeploy on Render. Done — messages auto-send and replies auto-capture.</li>
          </ol>
        </div>

        {/* Test message */}
        <div className="space-y-2 pt-2 border-t border-slate-200">
          <p className="text-sm font-medium text-slate-700">Send Test Message</p>
          <p className="text-xs text-slate-500">Verify your Cloud API setup is working. The recipient must have messaged your business number in the last 24h (otherwise use a template).</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input
              placeholder="e.g. 919876543210"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="sm:col-span-1"
            />
            <Input
              placeholder="Message"
              value={testMsg}
              onChange={(e) => setTestMsg(e.target.value)}
              className="sm:col-span-2"
            />
          </div>
          <Button onClick={handleTest} disabled={!configured || sending} size="sm" className="bg-green-600 hover:bg-green-700">
            {sending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sending...</> : <><Send className="w-3.5 h-3.5 mr-1" /> Send Test</>}
          </Button>
          {!configured && (
            <p className="text-xs text-amber-600 mt-1">Configure WA_TOKEN and WA_PHONE_NUMBER_ID first.</p>
          )}
        </div>

        {/* Webhook URL reminder */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          <p className="font-medium flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Webhook URL for Meta dashboard:</p>
          <code className="block bg-white px-2 py-1 rounded mt-1 break-all">https://your-render-domain.com/api/whatsapp/webhook</code>
          <p className="mt-1">Verify token: the value you set as <code className="bg-white px-1 rounded">WA_VERIFY_TOKEN</code> env var.</p>
        </div>
      </CardContent>
    </Card>
  )
}

function MigrationHelper() {
  const { toast } = useToast()
  const { data: status } = useFetch<any>('/api/whatsapp/status', undefined)
  const [step, setStep] = useState<'idle' | 'code-sent' | 'done'>('idle')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const configured = !!status?.configured

  const handleRequest = async () => {
    setBusy(true)
    try {
      const r = await apiPost('/api/whatsapp/migrate', { action: 'request' })
      if (r.success) {
        setStep('code-sent')
        toast({ title: 'Code sent', description: 'Check your SMS for the 6-digit code' })
      } else {
        toast({ title: 'Failed', description: r.error || r.message, variant: 'destructive' })
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = async () => {
    if (!/^\d{6}$/.test(code)) {
      toast({ title: 'Enter 6-digit code', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const r = await apiPost('/api/whatsapp/migrate', { action: 'submit', code })
      if (r.success) {
        setStep('done')
        toast({ title: 'Migration complete!', description: 'Your number is now on Cloud API' })
      } else {
        toast({ title: 'Migration failed', description: r.error || r.message, variant: 'destructive' })
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return null
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Zap className="w-5 h-5 text-amber-600" /> Migrate WhatsApp Business Number
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Move your existing WhatsApp Business app number to Cloud API. Suppliers will keep receiving messages from the same number.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
          <p className="font-medium flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Important:</p>
          <p>• After migration, the WhatsApp Business app on this number will STOP working.</p>
          <p>• All sending/receiving will go through Cloud API (via this panel).</p>
          <p>• Suppliers will see messages from the same number — no disruption for them.</p>
          <p>• Make sure you have SMS access to this number (Meta sends a 6-digit code via SMS).</p>
        </div>

        {step === 'idle' && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Step 1: Request migration code. Meta will SMS a 6-digit code to your business number.</p>
            <Button onClick={handleRequest} disabled={busy} className="bg-amber-600 hover:bg-amber-700">
              {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sending...</> : <><Send className="w-3.5 h-3.5 mr-1" /> Request Migration Code</>}
            </Button>
          </div>
        )}

        {step === 'code-sent' && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Step 2: Enter the 6-digit code you received via SMS.</p>
            <Input
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-2xl tracking-[0.5em] font-mono max-w-xs"
              inputMode="numeric"
            />
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleSubmit} disabled={busy || code.length !== 6} className="bg-emerald-600 hover:bg-emerald-700">
                {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Migrating...</> : <><ShieldCheck className="w-4 h-4 mr-1" /> Complete Migration</>}
              </Button>
              <Button variant="outline" onClick={handleRequest} disabled={busy}>Resend code</Button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Migration successful!</p>
              <p className="text-xs mt-1">Your number is now on Cloud API. You can close WhatsApp Business app on your phone. Use the WhatsApp panel to send enquiries — they'll auto-send from this number.</p>
            </div>
          </div>
        )}

        <details className="text-xs text-slate-500 pt-2 border-t border-slate-200">
          <summary className="cursor-pointer font-medium text-slate-700">Advanced: Deregister / Re-migrate</summary>
          <div className="mt-2 space-y-1">
            <p>If migration got stuck or you need to reset, click below to deregister the number from Cloud API. After this, you'll need to re-run the migration flow.</p>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={async () => {
                if (!confirm('Deregister this number from Cloud API? You will need to re-migrate to use it again.')) return
                setBusy(true)
                try {
                  const r = await apiPost('/api/whatsapp/deregister', {})
                  toast({ title: r.success ? 'Deregistered' : 'Failed', description: r.error || r.message, variant: r.success ? 'default' : 'destructive' })
                  if (r.success) setStep('idle')
                } catch (e: any) {
                  toast({ title: 'Error', description: e.message, variant: 'destructive' })
                } finally {
                  setBusy(false)
                }
              }}
              disabled={busy}
            >
              Deregister Number
            </Button>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}

// ===== NEW v3.0: Backup & Export =====
function BackupExport() {
  const { toast } = useToast()
  const [exporting, setExporting] = useState<string | null>(null)

  const handleExport = async (format: 'json' | 'csv', sheet?: string) => {
    const key = sheet ? `${format}-${sheet}` : `${format}-all`
    setExporting(key)
    try {
      const url = sheet ? `/api/export?sheet=${sheet}&format=${format}` : `/api/export?format=${format}`
      const r = await fetch(url)
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
        throw new Error(err.error || 'Export failed')
      }

      if (format === 'csv') {
        const text = await r.text()
        const blob = new Blob([text], { type: 'text/csv' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = sheet ? `${sheet}-${new Date().toISOString().split('T')[0]}.csv` : `export-${Date.now()}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(a.href)
      } else {
        const data = await r.json()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = sheet ? `${sheet}-${new Date().toISOString().split('T')[0]}.json` : `smartcomp-backup-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(a.href)
      }

      toast({ title: 'Export downloaded', description: `${sheet || 'Full backup'} exported as ${format.toUpperCase()}` })
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' })
    } finally {
      setExporting(null)
    }
  }

  const sheets = [
    { id: 'Items', label: 'Stock / Items', icon: HardDrive },
    { id: 'Customers', label: 'Customers', icon: Store },
    { id: 'Suppliers', label: 'Suppliers', icon: Store },
    { id: 'Invoices', label: 'Invoices', icon: FileText },
    { id: 'Quotations', label: 'Quotations', icon: FileText },
    { id: 'Jobs', label: 'Service Jobs', icon: Activity },
    { id: 'Expenses', label: 'Expenses', icon: BarChart3 },
    { id: 'Payments', label: 'Payments', icon: FileJson },
  ]

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <Download className="w-4 h-4 text-blue-600" />
          </div>
          Backup & Export (NEW v3.0)
        </CardTitle>
        <CardDescription>Download your data as JSON or CSV - complete backup safety</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-5 h-5 text-emerald-600" />
              <span className="font-semibold text-sm text-slate-900">Full Backup (JSON)</span>
            </div>
            <p className="text-xs text-slate-600 mb-3">All 16 sheets in one file - perfect for migration or safety backup</p>
            <Button onClick={() => handleExport('json')} disabled={!!exporting} size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700">
              {exporting === 'json-all' ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileJson className="w-4 h-4 mr-1" />}
              Download Full Backup
            </Button>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-sm text-slate-900">Data Protection</span>
            </div>
            <p className="text-xs text-slate-600 mb-2">v3.0 guarantees:</p>
            <ul className="text-[11px] text-slate-700 space-y-0.5 mb-2">
              <li>✓ Soft-delete only - never loses data</li>
              <li>✓ 45s cache + circuit breaker</li>
              <li>✓ Sanitized inputs + rate limiting</li>
              <li>✓ Daily backup reminder</li>
            </ul>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">Protected Edition v3.0</Badge>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Export Individual Sheets:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {sheets.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 min-w-0">
                  <s.icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="text-xs font-medium truncate">{s.label}</span>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => handleExport('json', s.id)} disabled={!!exporting}>
                    JSON
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => handleExport('csv', s.id)} disabled={!!exporting}>
                    CSV
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SystemHealth() {
  const { data: health, refetch } = useFetch<any>('/api/health', undefined)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <Activity className="w-4 h-4 text-purple-600" />
            </div>
            System Health v3.0
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-8">
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {health ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                <Cpu className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                <p className="text-[10px] text-slate-600 uppercase">Version</p>
                <p className="font-bold text-sm text-emerald-700">{health.version}</p>
                <p className="text-[10px] text-slate-500">{health.codename}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <BarChart3 className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <p className="text-[10px] text-slate-600 uppercase">Status</p>
                <p className="font-bold text-sm text-blue-700 capitalize">{health.status}</p>
                <p className="text-[10px] text-slate-500">{health.configured ? 'Configured ✓' : 'Not configured'}</p>
              </div>
            </div>

            <div className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs font-mono space-y-1">
              <div className="flex justify-between"><span className="text-slate-400">Uptime:</span> <span className="text-emerald-400">{Math.floor((health.uptime || 0) / 60)} min</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Node:</span> <span className="text-cyan-400">{health.env?.nodeVersion || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Cache size:</span> <span className="text-yellow-400">{health.cache?.size || 0} / {health.cache?.maxSize || 200}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Circuit breaker:</span> <span className={health.cache?.circuitBreaker?.active ? 'text-red-400' : 'text-green-400'}>{health.cache?.circuitBreaker?.active ? 'ACTIVE ⚠️' : 'OK ✓'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Features:</span> <span className="text-purple-400">{Object.keys(health.features || {}).filter((k: any) => (health.features as any)[k]).length} enabled</span></div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {Object.entries(health.features || {}).map(([k, v]) => (
                <Badge key={k} variant="outline" className={`${v ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'} text-[9px]`}>
                  {k}: {v ? '✓' : '✗'}
                </Badge>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-6 text-slate-500 text-sm">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading health data...
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * DesktopCloudConfigEditor — visible only when the app is running inside the
 * Electron desktop wrapper (runtimeConfigActive = true). Lets the user change
 * the Google Apps Script URL and PIN without reinstalling the .exe.
 *
 * Why this exists:
 *   - All add/edit/delete operations go through APPS_SCRIPT_URL → Google Sheet
 *   - On desktop, the URL is stored in %APPDATA%/smartcomp/config.json
 *   - Same Google Sheet = same data on Mobile + Tablet + Browser + Desktop
 *   - Changing the URL here instantly repoints this desktop to a different
 *     sheet (or fixes a stale deployment URL) without a rebuild
 */
function DesktopCloudConfigEditor() {
  const { toast } = useToast()
  const [url, setUrl] = useState('')
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [reveal, setReveal] = useState(false)

  // We don't auto-fill the URL field because the API returns it masked for
  // security. The user pastes a fresh URL when they want to switch sheets.
  useEffect(() => {
    // no-op — kept for future hooks
  }, [])

  const handleSave = async () => {
    if (!url.trim()) {
      toast({ title: 'URL required', variant: 'destructive' })
      return
    }
    if (!url.includes('/exec')) {
      toast({ title: 'Invalid URL', description: 'URL must end with /exec', variant: 'destructive' })
      return
    }
    if (pin && !/^\d{4,8}$/.test(pin)) {
      toast({ title: 'Invalid PIN', description: 'PIN must be 4-8 digits', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appsScriptUrl: url.trim(), appPin: pin.trim() }),
      })
      const res = await r.json()
      if (res.success) {
        toast({
          title: 'Saved',
          description: 'This desktop now points to the same Google Sheet as your other devices.',
        })
        setPin('')
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

  return (
    <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Cloud className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-slate-900">Desktop Cloud Connection</h3>
        <Badge variant="outline" className="ml-auto bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
          Desktop mode
        </Badge>
      </div>
      <p className="text-xs text-slate-600">
        This desktop app talks to the same Google Sheet as your phone, tablet, and browser.
        Paste a new Apps Script URL here if your deployment changed. All add/edit/delete
        actions will sync live to every device.
      </p>
      <div className="space-y-2">
        <Label className="text-xs font-medium text-slate-700">Google Apps Script URL (/exec)</Label>
        <Input
          type={reveal ? 'text' : 'password'}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/AKfycb.../exec"
          className="h-9 text-xs font-mono"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            type="button"
            className="h-7 text-[10px] text-slate-600"
            onClick={() => setReveal((v) => !v)}
          >
            {reveal ? 'Hide' : 'Reveal'}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-medium text-slate-700">
          PIN (leave blank to keep current)
        </Label>
        <Input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="4-8 digits"
          className="h-9 text-xs"
          inputMode="numeric"
          pattern="\d{4,8}"
        />
      </div>
      <Button onClick={handleSave} disabled={saving} className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-xs">
        {saving ? (
          <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving...</>
        ) : (
          <><ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Save & Reconnect</>
        )}
      </Button>
    </div>
  )
}
