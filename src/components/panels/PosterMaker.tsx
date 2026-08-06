'use client'

import { useState, useRef, useCallback } from 'react'
import { useFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import {
  Image as ImageIcon, Download, Plus, Trash2, Palette, Phone, MapPin,
  Shield, Zap, Star, CheckCircle, Cpu, HardDrive, Monitor, Keyboard, Mouse, Printer,
  Upload, AlertCircle, Loader2, Eye, Sparkles
} from 'lucide-react'

const RESOLUTIONS = [
  { id: '719x1160', name: '719 × 1160', w: 719, h: 1160, label: 'Story / Tall' },
  { id: '853x1280', name: '853 × 1280', w: 853, h: 1280, label: 'Poster / Print' },
  { id: '1280x1600', name: '1280 × 1600', w: 1280, h: 1600, label: 'FHD Large' },
]

const TEMPLATES = [
  { id: 'chatgpt-pro', name: 'ChatGPT Pro', bg: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 55%, #e0e7ff 100%)', headerBg: '#0f172a', accent: '#f97316', accent2: '#ef4444', style: 'chatgpt' },
  { id: 'apex-tech', name: 'Apex Tech', bg: '#f0f2f5', headerBg: '#1e293b', accent: '#3b82f6', accent2: '#ffffff', style: 'apex' },
  { id: 'teal-product', name: 'Teal Product', bg: 'linear-gradient(180deg, #134e4a 0%, #0d9488 60%, #115e59 100%)', headerBg: 'transparent', accent: '#5eead4', accent2: '#fbbf24', style: 'teal' },
  { id: 'service-pro', name: 'Service Pro', bg: '#1e3a5f', headerBg: '#1e3a5f', accent: '#f97316', accent2: '#fbbf24', style: 'service' },
  { id: 'tech-clean', name: 'Tech Clean', bg: 'linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%)', headerBg: '#334155', accent: '#3b82f6', accent2: '#ef4444', style: 'clean' },
  { id: 'dark-premium', name: 'Dark Premium', bg: 'linear-gradient(135deg, #0c0a09 0%, #1c1917 100%)', headerBg: 'transparent', accent: '#fbbf24', accent2: '#f59e0b', style: 'dark' },
  { id: 'split-design', name: 'Split Design', bg: '#ffffff', headerBg: '#1e40af', accent: '#1e40af', accent2: '#f59e0b', style: 'split' },
  { id: 'bold-offer', name: 'Bold Offer', bg: 'linear-gradient(135deg, #7c2d12 0%, #431407 100%)', headerBg: 'transparent', accent: '#fb923c', accent2: '#fde047', style: 'bold' },
  { id: 'corporate-navy', name: 'Corporate', bg: 'linear-gradient(180deg, #1e3a8a 0%, #1e40af 100%)', headerBg: 'transparent', accent: '#60a5fa', accent2: '#dbeafe', style: 'corporate' },
  { id: 'rgb-gaming', name: 'RGB Gaming', bg: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #1e1b4b 100%)', headerBg: 'transparent', accent: '#a855f7', accent2: '#22c55e', style: 'gaming' },
  { id: 'minimal-white', name: 'Minimal White', bg: '#ffffff', headerBg: '#ffffff', accent: '#0ea5e9', accent2: '#0284c7', style: 'minimal' },
]

export function PosterMakerPanel() {
  const { toast } = useToast()
  const posterRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: shop } = useFetch<any>('/api/shop', undefined)
  const { data: stockItems } = useFetch<any[]>('/api/items', undefined)

  const [template, setTemplate] = useState(TEMPLATES[0])
  const [resolution, setResolution] = useState(RESOLUTIONS[0])
  const [exporting, setExporting] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [product, setProduct] = useState({
    name: 'ASUS Vivobook 15',
    model: 'X1504VAP-BQ224WS',
    headline: 'POWERFUL STYLISH PRODUCTIVE',
    subheadline: 'STYLE THAT STANDS OUT',
    imageUrl: '',
    imageBase64: '',
    specs: [
      { icon: 'cpu', label: 'Intel Core 5 120U', desc: 'Powerful Performance' },
      { icon: 'harddrive', label: '16GB DDR4 RAM', desc: 'Smooth Multitasking' },
      { icon: 'monitor', label: '512GB PCIe SSD', desc: 'Blazing Fast Storage' },
      { icon: 'monitor', label: '15.6" FHD Display', desc: 'Clear & Bright' },
      { icon: 'keyboard', label: 'Backlit Keyboard', desc: 'Type in Comfort' },
      { icon: 'shield', label: 'Windows 11 + Office', desc: 'Pre-installed' },
    ],
    badges: ['1 YEAR WARRANTY', 'MICROSOFT OFFICE', 'FREE BACKPACK'],
    offerText: 'Biggest Deal of the Year',
    mrpText: '₹65,500',
    priceText: '₹49,990',
    ctaText: 'BUY NOW!',
    phone: '9876543210',
    address: 'SP Road, Bangalore',
  })

  const shopName = shop?.name || 'Smart Computers Sales & Service'
  const shopTagline = 'YOUR TRUSTED TECH PARTNER'
  const t = template
  const isDark = t.style === 'dark' || t.style === 'gaming' || t.style === 'bold' || t.style === 'service' || t.style === 'corporate' || t.style === 'teal'
  const textColor = isDark || t.style === 'apex' ? '#ffffff' : '#1e293b'
  const subTextColor = isDark ? '#ffffff99' : '#64748b'
  const bodyBg = t.bg

  // ── AI PRODUCT IMAGE (FREE) ─────────────────────────────────────────
  // Calls /api/poster/generate in 'product-image' mode — Pollinations.ai
  // renders a clean textless product photo; the template draws all text on
  // top, so prices/specs/phone are always crisp (no garbled AI text).
  const handleAIGenerate = useCallback(async () => {
    if (!product.name.trim()) {
      toast({ title: 'Product name required', description: 'Enter the product name first (e.g. ASUS Vivobook 16)', variant: 'destructive' })
      return
    }
    setAiGenerating(true)
    setImageError(false)
    try {
      const specsSummary = product.specs.map((s) => s.label).filter(Boolean).join(', ').slice(0, 250)
      const res = await fetch('/api/poster/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: '',
          itemName: product.name,
          itemDetails: `${product.model ? product.model + ' — ' : ''}${specsSummary}`,
          itemPrice: '',
          style: 'photorealistic',
          size: 'square',
          includeShopBranding: false,
          mode: 'product-image',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || `Failed (${res.status})`)
      setProduct((p) => ({ ...p, imageBase64: data.image, imageUrl: '' }))
      const providerLabel =
        data.provider === 'svg-product-art'
          ? 'AI free providers busy — smart vector art used (still looks pro!)'
          : `${data.provider}${data.provider === 'pollinations-256' ? ' (256px, upscaled)' : ''}`
      toast({
        title: '✅ Product image ready!',
        description: `${(data.elapsedMs / 1000).toFixed(1)}s • ${providerLabel} • FREE`,
      })
    } catch (e: any) {
      toast({ title: 'AI image failed', description: e?.message, variant: 'destructive' })
    } finally {
      setAiGenerating(false)
    }
  }, [product.name, product.model, product.specs, toast])

  // ── LOAD FROM STOCK ─────────────────────────────────────────────────
  const handleLoadFromStock = useCallback((itemId: string) => {
    const item = (stockItems || []).find((i) => String(i.id) === itemId)
    if (!item) return
    const price = item.sellingPrice ? `₹${Number(item.sellingPrice).toLocaleString('en-IN')}` : ''
    const details = item.description || item.category || ''
    setProduct((p) => ({
      ...p,
      name: item.name || p.name,
      model: item.sku || p.model,
      headline: p.headline,
      imageUrl: '',
      imageBase64: '',
      specs: details
        ? [
            ...details.split(',').slice(0, 4).map((d: string) => ({ icon: 'check', label: d.trim(), desc: '' })),
            ...p.specs,
          ].slice(0, 8)
        : p.specs,
      priceText: price || p.priceText,
    }))
    toast({ title: 'Loaded from stock', description: `${item.name} — ₹${Number(item.sellingPrice || 0).toLocaleString('en-IN')}` })
  }, [stockItems, toast])

  const previewScale = Math.min(340 / resolution.w, 500 / resolution.h)
  const previewMarginBottom = -(resolution.h * previewScale) + 16

  // Handle local file upload - converts to base64 to avoid CORS
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB allowed', variant: 'destructive' })
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string
      setProduct({ ...product, imageBase64: base64, imageUrl: '' })
      setImageError(false)
      toast({ title: 'Image uploaded', description: 'Local image will not have CORS issues' })
    }
    reader.onerror = () => {
      toast({ title: 'Upload failed', variant: 'destructive' })
    }
    reader.readAsDataURL(file)
  }

  // Fixed download - uses offscreen clone without transform for perfect export
  const handleDownload = useCallback(async () => {
    if (!posterRef.current) {
      toast({ title: 'Poster not ready', variant: 'destructive' })
      return
    }

    setExporting(true)
    toast({ title: 'Generating FHD poster...', description: `${resolution.w}×${resolution.h} - please wait` })

    try {
      // Create offscreen container for export (no scale transform)
      const offscreen = document.createElement('div')
      offscreen.style.position = 'fixed'
      offscreen.style.left = '-9999px'
      offscreen.style.top = '0'
      offscreen.style.width = `${resolution.w}px`
      offscreen.style.height = `${resolution.h}px`
      offscreen.style.overflow = 'hidden'
      offscreen.style.pointerEvents = 'none'
      
      // Clone the poster content
      const clone = posterRef.current.cloneNode(true) as HTMLElement
      // Remove transform styles from clone and its children for export
      clone.style.transform = 'none'
      clone.style.margin = '0'
      clone.style.marginBottom = '0'
      clone.style.width = `${resolution.w}px`
      clone.style.height = `${resolution.h}px`
      clone.style.position = 'relative'
      
      offscreen.appendChild(clone)
      document.body.appendChild(offscreen)

      // Wait for images to load in clone
      const images = offscreen.querySelectorAll('img')
      await Promise.all(Array.from(images).map(img => {
        if (img.complete) return Promise.resolve()
        return new Promise<void>((resolve) => {
          img.onload = () => resolve()
          img.onerror = () => resolve() // Don't fail on error, just continue
          setTimeout(() => resolve(), 2000) // Timeout after 2s
        })
      }))

      // Small delay to ensure rendering
      await new Promise(r => setTimeout(r, 300))

      // html-to-image is ~40KB and only needed on export, so it is pulled in
      // here rather than at module scope — opening the panel no longer loads it.
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(clone, {
        quality: 1,
        pixelRatio: 2, // HD export
        cacheBust: true,
        width: resolution.w,
        height: resolution.h,
        backgroundColor: t.bg.includes('gradient') ? '#0f172a' : t.bg,
        style: {
          transform: 'none',
          margin: '0',
        },
        // Handle CORS issues gracefully
        fetchRequestInit: {
          mode: 'cors' as RequestMode,
        },
      })

      // Clean up offscreen
      document.body.removeChild(offscreen)

      // Download
      const link = document.createElement('a')
      link.download = `${product.name.replace(/[^a-zA-Z0-9]/g, '_')}_${resolution.w}x${resolution.h}_FHD.png`
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast({ title: `✅ Poster downloaded!`, description: `${resolution.w}×${resolution.h} @ 2x HD - ${Math.round(dataUrl.length / 1024)}KB` })
    } catch (e: any) {
      console.error('Poster export failed:', e)
      let msg = e.message || 'Export failed'
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        msg = 'Image CORS error - use local upload instead of URL, or try different image host'
      }
      toast({ title: 'Export failed', description: msg, variant: 'destructive', duration: 6000 })
    } finally {
      setExporting(false)
    }
  }, [product.name, resolution, t.bg, toast])

  const addSpec = () => setProduct({ ...product, specs: [...product.specs, { icon: 'cpu', label: 'New Feature', desc: 'Description' }] })
  const removeSpec = (i: number) => setProduct({ ...product, specs: product.specs.filter((_, idx) => idx !== i) })
  const updateSpec = (i: number, field: string, value: string) => {
    const specs = [...product.specs]; specs[i] = { ...specs[i], [field]: value }; setProduct({ ...product, specs })
  }
  const getIcon = (n: string) => ({ cpu: Cpu, harddrive: HardDrive, monitor: Monitor, keyboard: Keyboard, mouse: Mouse, printer: Printer, shield: Shield, zap: Zap, star: Star, check: CheckCircle }[n] || Cpu)

  const fs = (px: number) => `${(px / 800) * resolution.w}px`
  const displayImage = product.imageBase64 || product.imageUrl

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Palette className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 flex-shrink-0" />
            <span className="truncate">Poster Maker</span>
            <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">v4.0 AI</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">✨ AI product image (FREE) · 11 premium designs · 3 FHD resolutions · ChatGPT-style promo posters</p>
        </div>
        <Button onClick={handleDownload} disabled={exporting} className="bg-purple-600 hover:bg-purple-700 h-11 min-w-[140px]">
          {exporting ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Generating...</> : <><Download className="w-4 h-4 mr-1.5" /> Download FHD</>}
        </Button>
      </div>

      {imageError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="text-xs flex-1">
            <p className="font-medium">Image load failed - CORS issue likely</p>
            <p>Use <strong>Upload Local Image</strong> button instead of URL to avoid CORS errors. External URLs from many hosts block canvas export.</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* LEFT: Form */}
        <div className="space-y-3 max-h-[85vh] overflow-y-auto pr-1">
          <Card><CardContent className="p-3">
            <Label className="text-xs font-medium mb-2 block">Resolution (FHD Export @ 2x)</Label>
            <div className="grid grid-cols-3 gap-2">
              {RESOLUTIONS.map((r) => (
                <button key={r.id} onClick={() => setResolution(r)}
                  className={`p-2.5 rounded-xl border-2 text-center transition-all ${resolution.id === r.id ? 'border-purple-500 bg-purple-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                  <p className="text-xs font-bold text-slate-800">{r.name}</p>
                  <p className="text-[10px] text-slate-500">{r.label}</p>
                  <p className="text-[9px] text-purple-600 mt-1 font-medium">{r.w * 2}×{r.h * 2} HD</p>
                </button>
              ))}
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-3">
            <Label className="text-xs font-medium mb-2 block">Premium Design (10 Templates)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {TEMPLATES.map((tpl) => (
                <button key={tpl.id} onClick={() => setTemplate(tpl)}
                  className={`p-2.5 rounded-xl border-2 text-[11px] font-medium transition-all min-h-[50px] flex flex-col items-center justify-center gap-1 ${template.id === tpl.id ? 'border-purple-500 ring-2 ring-purple-200 bg-purple-50' : 'border-slate-200 hover:border-slate-300'}`}
                  style={{ background: template.id === tpl.id ? undefined : tpl.bg, color: template.id === tpl.id ? '#000' : (tpl.style === 'minimal' || tpl.style === 'clean' || tpl.style === 'split' ? '#1e293b' : '#fff') }}
                  title={tpl.name}>
                  <span className="font-bold">{tpl.name}</span>
                  <span className="text-[8px] opacity-70">{tpl.style}</span>
                </button>
              ))}
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-3 space-y-3">
            <Label className="text-xs font-medium">Product Details</Label>
            
            <div>
              <Label className="text-[11px] text-slate-600">Product Image — ✨ AI Generate (FREE) or Upload</Label>
              <div className="flex flex-col gap-2 mt-1">
                <Button
                  onClick={handleAIGenerate}
                  disabled={aiGenerating || !product.name.trim()}
                  className="w-full h-10 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-xs font-bold"
                >
                  {aiGenerating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> AI drawing product photo… (10–20s)</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" /> AI Generate Product Image — Free, no key</>
                  )}
                </Button>
                <div className="flex gap-2">
                  <Input value={product.imageUrl} onChange={(e) => { setProduct({ ...product, imageUrl: e.target.value, imageBase64: '' }); setImageError(false) }} placeholder="https://example.com/image.jpg (may have CORS)" className="h-9 text-xs flex-1" />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-9 text-xs whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5 mr-1" /> Upload Local
                  </Button>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              <p className="text-[10px] text-slate-500 mt-1">💡 Type product name → tap <strong>AI Generate</strong> → AI photo appears (Pollinations FLUX, free). Or upload local (no CORS issues).</p>
              {displayImage && (
                <div className="mt-2 p-2 bg-slate-50 rounded-lg border flex items-center gap-2">
                  <img src={displayImage} alt="preview" className="w-12 h-12 object-contain rounded bg-white border" onError={() => setImageError(true)} onLoad={() => setImageError(false)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{product.imageBase64 ? 'Local file (base64)' : product.imageUrl}</p>
                    <p className="text-[10px] text-slate-500">{product.imageBase64 ? 'No CORS issues ✓' : 'May have CORS - if export fails, upload local'}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setProduct({ ...product, imageUrl: '', imageBase64: '' })}><Trash2 className="w-3 h-3" /></Button>
                </div>
              )}
            </div>

            {(stockItems && stockItems.length > 0) && (
              <div>
                <Label className="text-[11px] text-slate-600">Load from Stock (auto-fill)</Label>
                <Select onValueChange={handleLoadFromStock}>
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue placeholder="Pick an item from your stock…" />
                  </SelectTrigger>
                  <SelectContent>
                    {stockItems.slice(0, 50).map((it) => (
                      <SelectItem key={it.id} value={String(it.id)}>
                        {it.name} {it.sellingPrice ? `— ₹${Number(it.sellingPrice).toLocaleString('en-IN')}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Input value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="Product name e.g. ASUS Vivobook 15" className="h-9 text-sm" />
            <Input value={product.model} onChange={(e) => setProduct({ ...product, model: e.target.value })} placeholder="Model e.g. X1504VAP-BQ224WS" className="h-9 text-sm" />
            <Input value={product.headline} onChange={(e) => setProduct({ ...product, headline: e.target.value })} placeholder="Headline e.g. PERFORMANCE THAT KEEPS UP" className="h-9 text-sm font-bold" />
            <Input value={product.subheadline} onChange={(e) => setProduct({ ...product, subheadline: e.target.value })} placeholder="Subheadline e.g. STYLE THAT STANDS OUT" className="h-9 text-sm" />
            <div className="grid grid-cols-3 gap-2">
              <Input value={product.offerText} onChange={(e) => setProduct({ ...product, offerText: e.target.value })} placeholder="Offer" className="h-9 text-xs" />
              <Input value={product.mrpText} onChange={(e) => setProduct({ ...product, mrpText: e.target.value })} placeholder="MRP ₹65,500 (strike)" className="h-9 text-xs" />
              <Input value={product.priceText} onChange={(e) => setProduct({ ...product, priceText: e.target.value })} placeholder="NETT ₹49,990" className="h-9 text-xs font-bold" />
            </div>
            <div>
              <Label className="text-[11px] text-slate-600">Badges (comma separated) — shown under headline</Label>
              <Input
                value={product.badges.join(', ')}
                onChange={(e) => setProduct({ ...product, badges: e.target.value.split(',').map((b) => b.trim()).filter(Boolean) })}
                placeholder="1 YEAR WARRANTY, MICROSOFT OFFICE, FREE BACKPACK"
                className="h-9 text-xs mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input value={product.phone} onChange={(e) => setProduct({ ...product, phone: e.target.value })} placeholder="Phone 9876543210" className="h-9 text-xs" />
              <Input value={product.address} onChange={(e) => setProduct({ ...product, address: e.target.value })} placeholder="Address SP Road..." className="h-9 text-xs" />
            </div>
            <Input value={product.ctaText} onChange={(e) => setProduct({ ...product, ctaText: e.target.value })} placeholder="CTA BUY NOW!" className="h-9 text-sm font-bold" />
          </CardContent></Card>

          <Card><CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Features / Specs (max 8 visible)</Label>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addSpec} disabled={product.specs.length >= 10}><Plus className="w-3 h-3 mr-1" /> Add</Button>
            </div>
            {product.specs.map((spec, i) => (
              <div key={i} className="flex gap-1 items-center bg-slate-50 p-1.5 rounded-lg">
                <Select value={spec.icon} onValueChange={(v) => updateSpec(i, 'icon', v)}>
                  <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['cpu','harddrive','monitor','keyboard','mouse','printer','shield','zap','star','check'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={spec.label} onChange={(e) => updateSpec(i, 'label', e.target.value)} placeholder="Label" className="h-8 text-xs flex-1" />
                <Input value={spec.desc} onChange={(e) => updateSpec(i, 'desc', e.target.value)} placeholder="Desc" className="h-8 text-xs flex-1 hidden sm:block" />
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeSpec(i)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
              </div>
            ))}
          </CardContent></Card>
        </div>

        {/* RIGHT: Preview - Fixed scaling for proper visibility */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-slate-500">Live Preview · {resolution.w}×{resolution.h} · {t.name} · Scale {Math.round(previewScale * 100)}%</div>
            <div className="flex gap-1">
              <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full flex items-center gap-1"><Eye className="w-3 h-3" />Preview</span>
              <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">HD Export @ 2x</span>
            </div>
          </div>
          <div className="flex justify-center overflow-hidden bg-slate-100 rounded-2xl p-4 border-2 border-dashed border-slate-200" style={{ minHeight: '500px' }}>
            <div 
              ref={posterRef} 
              style={{
                width: `${resolution.w}px`, 
                height: `${resolution.h}px`,
                background: bodyBg, 
                position: 'relative', 
                overflow: 'hidden',
                fontFamily: 'Inter, system-ui, sans-serif',
                transform: `scale(${previewScale})`, 
                transformOrigin: 'top center',
                marginBottom: `${previewMarginBottom}px`,
                borderRadius: '12px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                flexShrink: 0,
              }}
            >
              {t.style !== 'teal' && t.style !== 'minimal' && (
                <div style={{
                  background: t.headerBg !== 'transparent' ? t.headerBg : t.bg,
                  padding: `${fs(18)} ${fs(28)}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: t.style === 'apex' ? `${fs(3)} solid ${t.accent}` : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: fs(18), fontWeight: 800, color: t.style === 'chatgpt' ? '#ffffff' : textColor, letterSpacing: '0.5px' }}>{shopName.toUpperCase()}</div>
                    <div style={{ fontSize: fs(10), color: t.style === 'chatgpt' ? '#fbbf24' : t.accent2, marginTop: '2px', fontWeight: 600 }}>{shopTagline}</div>
                    {t.style === 'chatgpt' && (
                      <div style={{ display: 'flex', gap: fs(10), marginTop: fs(6), flexWrap: 'wrap' }}>
                        <span style={{ fontSize: fs(9), color: '#ffffffcc', fontWeight: 700 }}>📍 {product.address || 'Your City'}</span>
                        <span style={{ fontSize: fs(9), color: '#fbbf24', fontWeight: 800 }}>📞 {product.phone || 'Phone'}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: fs(10) }}>
                    {[Shield, Star, Zap].map((Ico, i) => (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <Ico style={{ width: fs(18), height: fs(18), color: t.accent }} />
                        <div style={{ fontSize: fs(6), color: subTextColor, marginTop: '2px', fontWeight: 600 }}>{['TRUSTED','QUALITY','EXPERT'][i]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ padding: `${fs(18)} ${fs(28)} ${fs(8)}` }}>
                <div style={{ fontSize: fs(30), fontWeight: 900, color: t.accent, lineHeight: '1.1', letterSpacing: '-0.5px' }}>{product.name.toUpperCase()}</div>
                {product.model && <div style={{ fontSize: fs(11), color: subTextColor, marginTop: '4px', fontWeight: 500 }}>{product.model}</div>}
                <div style={{ fontSize: fs(18), fontWeight: 800, color: textColor, marginTop: '8px', letterSpacing: '0.3px' }}>{product.headline}</div>
                <div style={{ fontSize: fs(13), color: t.accent2, fontWeight: 700, marginTop: '2px' }}>{product.subheadline}</div>
                {/* Badges row — like ChatGPT promo posters (WARRANTY / OFFICE / OFFER) */}
                {product.badges.length > 0 && (
                  <div style={{ display: 'flex', gap: fs(6), marginTop: fs(10), flexWrap: 'wrap' }}>
                    {product.badges.slice(0, 6).map((badge, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: fs(8.5), fontWeight: 800, letterSpacing: '0.3px',
                          padding: `${fs(3.5)} ${fs(10)}`, borderRadius: fs(20),
                          background: i === 0 ? t.accent : `${t.accent}18`,
                          color: i === 0 ? '#ffffff' : t.accent,
                          border: `1px solid ${i === 0 ? t.accent : `${t.accent}45`}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {badge.toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: `${fs(8)} ${fs(28)}`, height: fs(260) }}>
                {displayImage ? (
                  <img 
                    src={displayImage} 
                    alt={product.name} 
                    style={{ maxHeight: fs(240), maxWidth: '85%', objectFit: 'contain', borderRadius: fs(8) }} 
                    crossOrigin="anonymous"
                    onError={() => setImageError(true)}
                    onLoad={() => setImageError(false)}
                  />
                ) : (
                  <div style={{ width: fs(300), height: fs(200), borderRadius: fs(12), background: `${t.accent}12`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `${fs(2)} dashed ${t.accent}40`, gap: fs(8) }}>
                    <ImageIcon style={{ width: fs(48), height: fs(48), color: `${t.accent}60` }} />
                    <span style={{ fontSize: fs(11), color: `${t.accent}80`, fontWeight: 600 }}>No Image - Upload to avoid CORS</span>
                  </div>
                )}
              </div>

              <div style={{ padding: `0 ${fs(28)}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${fs(8)} ${fs(16)}` }}>
                {product.specs.slice(0, 8).map((spec, i) => {
                  const Icon = getIcon(spec.icon)
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: fs(8),
                      background: t.style === 'apex' || t.style === 'clean' ? `${t.accent}10` : 'rgba(255,255,255,0.05)',
                      padding: `${fs(7)} ${fs(10)}`,
                      borderRadius: fs(8),
                      border: `1px solid ${t.accent}15`
                    }}>
                      <div style={{ width: fs(32), height: fs(32), borderRadius: fs(8), background: `${t.accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon style={{ width: fs(16), height: fs(16), color: t.accent }} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: fs(11), fontWeight: 700, color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spec.label}</div>
                        <div style={{ fontSize: fs(9), color: subTextColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spec.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {(product.offerText || product.priceText) && (
                <div style={{
                  margin: `${fs(14)} ${fs(28)}`, padding: `${fs(12)} ${fs(18)}`, borderRadius: fs(10),
                  background: `linear-gradient(135deg, ${t.accent2}25, ${t.accent}20)`, 
                  border: `1.5px solid ${t.accent}40`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  boxShadow: `0 4px 12px ${t.accent}15`
                }}>
                  {product.offerText && <div style={{ fontSize: fs(12), fontWeight: 700, color: textColor }}>{product.offerText}</div>}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: fs(8) }}>
                    {product.mrpText && (
                      <span style={{ fontSize: fs(13), fontWeight: 700, color: subTextColor, textDecoration: 'line-through' }}>{product.mrpText}</span>
                    )}
                    {product.priceText && (
                      <span style={{ fontSize: fs(26), fontWeight: 900, color: t.accent2, textShadow: `0 2px 4px ${t.accent}30` }}>{product.priceText}</span>
                    )}
                    {product.mrpText && product.priceText && (
                      <span style={{ fontSize: fs(9), fontWeight: 900, background: '#dc2626', color: '#fff', padding: `${fs(2)} ${fs(6)}`, borderRadius: fs(4) }}>NETT</span>
                    )}
                  </div>
                </div>
              )}

              <div style={{
                position: 'absolute', bottom: '0', left: '0', right: '0',
                background: t.style === 'split' ? t.headerBg : t.style === 'minimal' || t.style === 'clean' ? t.accent : 'linear-gradient(180deg, #0f172a 0%, #000000 100%)',
                padding: `${fs(18)} ${fs(28)}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ display: 'inline-block', padding: `${fs(10)} ${fs(24)}`, borderRadius: fs(8), background: t.accent2, color: '#000', fontSize: fs(15), fontWeight: 900, boxShadow: `0 4px 12px ${t.accent2}40`, letterSpacing: '0.5px' }}>
                    {product.ctaText}
                  </div>
                  <div style={{ marginTop: fs(10), display: 'flex', gap: fs(16), flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Phone style={{ width: fs(14), height: fs(14), color: '#fff' }} />
                      <span style={{ fontSize: fs(12), color: '#fff', fontWeight: 700 }}>{product.phone}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin style={{ width: fs(14), height: fs(14), color: '#fff' }} />
                      <span style={{ fontSize: fs(11), color: '#e2e8f0' }}>{product.address}</span>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: fs(6), justifyContent: 'flex-end', flexWrap: 'wrap', maxWidth: fs(180) }}>
                    {(t.style === 'chatgpt' ? ['ORIGINAL PRODUCTS', 'TRUSTED SERVICE', 'BEST PRICES', 'AFTER SALES SUPPORT'] : ['100% ORIGINAL', 'FAST DELIVERY', 'WARRANTY']).map((txt, i) => (
                      <div key={i} style={{ fontSize: fs(7), color: '#ffffffcc', padding: `${fs(4)} ${fs(8)}`, border: `1px solid #ffffff30`, borderRadius: fs(4), fontWeight: 600 }}>{txt}</div>
                    ))}
                  </div>
                  {t.style === 'chatgpt' && (
                    <div style={{ fontSize: fs(8), color: '#fbbf24', fontWeight: 800, marginTop: fs(6), letterSpacing: '0.5px' }}>
                      FAST • RELIABLE • AFFORDABLE
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-[11px] font-medium text-blue-800">💡 Fixed in v3.0.3:</p>
            <ul className="text-[10px] text-blue-700 mt-1 space-y-0.5 list-disc list-inside">
              <li>HD Export @ 2x resolution via offscreen clone (no scale issues)</li>
              <li>Local upload = Base64, no CORS errors</li>
              <li>External URL images may fail - use local upload for 100% success</li>
              <li>Preview scaled for visibility, export is full FHD</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
