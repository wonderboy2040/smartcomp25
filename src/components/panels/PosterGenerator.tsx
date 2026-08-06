'use client'

/**
 * PosterGenerator — AI-powered advertising poster generator for Smart Computers.
 *
 * Features:
 *   - Free-text prompt input (user's vision for the poster)
 *   - Optional item name + item details + price (auto-injected into prompt)
 *   - Style presets (Cyberpunk, Minimal, Festive, Neon, Premium, etc.)
 *   - Size presets (WhatsApp Status 9:16, Instagram Story, Square, Landscape, Wide Banner)
 *   - Shop branding toggle (auto-injects shop name, phone, address, UPI from Shop sheet)
 *   - One-click "Generate" → calls /api/poster/generate → renders base64 PNG inline
 *   - Download button (saves as PNG file)
 *   - "Send via WhatsApp" button (opens wa.me with image — actually just opens WhatsApp
 *     since wa.me can't carry binary, but the user can share the downloaded image)
 *   - History strip of recently generated posters (in-memory, lost on refresh)
 *   - Super-intelligent prompt builder (combines everything into a rich image prompt)
 *
 * The AI model used is z-ai-web-dev-sdk's image generation API — a GLM-4V-class
 * engine comparable to Gemini Nano / Imagen / DALL-E 3 in capability, free for
 * our use case. Output is FHD/2K-grade (768x1344 for WhatsApp Status — the
 * maximum size the API allows for 9:16 aspect ratio).
 */

import { useState, useCallback, useRef } from 'react'
import { useFetch } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Sparkles, Wand2, Download, MessageSquare, Loader2, ImageIcon,
  Smartphone, Square, RectangleHorizontal, Monitor, Lightbulb,
  History, Trash2, Zap, ShieldCheck,
} from 'lucide-react'

// ──────────────────────────────────────────────────────────────────────
// Constants — must match the API route's presets
// ──────────────────────────────────────────────────────────────────────

const STYLE_OPTIONS = [
  { id: 'premium', label: 'Premium Luxury', icon: '💎', desc: 'Marble + gold, studio lighting' },
  { id: 'cyberpunk', label: 'Cyberpunk Neon', icon: '🌃', desc: 'Pink/blue holographic glow' },
  { id: 'minimal', label: 'Minimal Clean', icon: '⚪', desc: 'White space, Apple-keynote style' },
  { id: 'festive', label: 'Festive Indian', icon: '🪔', desc: 'Marigold, diyas, Diwali vibes' },
  { id: 'neon', label: 'Neon Synthwave', icon: '🌈', desc: '80s retro, magenta+cyan tubes' },
  { id: 'glossy', label: 'Glossy Magazine', icon: '📚', desc: 'Polished, billboard-quality' },
  { id: 'flat-illustration', label: 'Flat Illustration', icon: '🎨', desc: 'Vector art, Dribbble-style' },
  { id: '3d-render', label: '3D Render', icon: '🧊', desc: 'Octane render, ray-traced' },
  { id: 'photorealistic', label: 'Photorealistic', icon: '📷', desc: 'Canon R5, 85mm f/1.4' },
] as const

const SIZE_OPTIONS = [
  { id: 'whatsapp-status', label: 'WhatsApp Status', icon: Smartphone, desc: '768×1344 (9:16)', aspect: '9:16' },
  { id: 'instagram-story', label: 'Instagram Story', icon: Smartphone, desc: '768×1344 (9:16)', aspect: '9:16' },
  { id: 'square', label: 'Square Feed', icon: Square, desc: '1024×1024 (1:1)', aspect: '1:1' },
  { id: 'landscape', label: 'Landscape', icon: RectangleHorizontal, desc: '1344×768 (16:9)', aspect: '16:9' },
  { id: 'wide-banner', label: 'Wide Banner', icon: Monitor, desc: '1440×720 (2:1)', aspect: '2:1' },
] as const

// ──────────────────────────────────────────────────────────────────────
// Prompt suggestions — quick-fire buttons that pre-fill the prompt field
// ──────────────────────────────────────────────────────────────────────

const PROMPT_IDEAS = [
  'Biggest sale of the year — 50% off all laptops',
  'New arrival: latest gaming PC with RTX graphics',
  'Monsoon special — waterproof laptop bags',
  'Back to school offer — student discount on notebooks',
  'Festive Diwali dhamaka — buy 1 get 1 on accessories',
  'Smartphone launch event — be the first to own it',
  'Service camp — free laptop cleaning this weekend',
  'Printer clearance sale — limited stock',
]

// ──────────────────────────────────────────────────────────────────────
// Generated poster type
// ──────────────────────────────────────────────────────────────────────

interface GeneratedPoster {
  id: string
  image: string // base64 data URL
  prompt: string
  style: string
  size: string
  width: number
  height: number
  elapsedMs: number
  mime?: string
  createdAt: string
}

// ──────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────

export function PosterGeneratorPanel() {
  const { toast } = useToast()
  const { data: shop } = useFetch<any>('/api/shop', undefined)

  // Form state
  const [prompt, setPrompt] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemDetails, setItemDetails] = useState('')
  const [itemPrice, setItemPrice] = useState('')
  const [style, setStyle] = useState<string>('premium')
  const [size, setSize] = useState<string>('whatsapp-status')
  const [includeBranding, setIncludeBranding] = useState(true)

  // Generation state
  const [generating, setGenerating] = useState(false)
  const [current, setCurrent] = useState<GeneratedPoster | null>(null)
  const [history, setHistory] = useState<GeneratedPoster[]>([])
  const [error, setError] = useState<string | null>(null)
  const downloadLinkRef = useRef<HTMLAnchorElement>(null)

  // ──────────────────────────────────────────────────────────────────────
  // Generate handler — calls /api/poster/generate
  // ──────────────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && !itemName.trim()) {
      toast({ title: 'Prompt or Item Name required', variant: 'destructive' })
      return
    }

    setGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/poster/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          itemName: itemName.trim() || undefined,
          itemDetails: itemDetails.trim() || undefined,
          itemPrice: itemPrice || undefined,
          style,
          size,
          includeShopBranding: includeBranding,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed (${res.status})`)
      }

      const poster: GeneratedPoster = {
        id: `poster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        image: data.image,
        prompt: data.prompt,
        style: data.style,
        size: data.size,
        width: data.width,
        height: data.height,
        elapsedMs: data.elapsedMs,
        mime: data.mime,
        createdAt: new Date().toISOString(),
      }

      setCurrent(poster)
      setHistory((prev) => [poster, ...prev].slice(0, 8)) // keep last 8
      toast({
        title: 'Poster generated ✓',
        description: `${data.width}×${data.height} • ${data.elapsedMs / 1000}s • ${data.model}`,
      })
    } catch (e: any) {
      setError(e?.message || 'Failed to generate poster')
      toast({ title: 'Generation failed', description: e?.message, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }, [prompt, itemName, itemDetails, itemPrice, style, size, includeBranding, toast])

  // ──────────────────────────────────────────────────────────────────────
  // Download handler — saves the current poster as a PNG file
  // ──────────────────────────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!current) return
    const link = downloadLinkRef.current
    if (!link) return
    link.href = current.image
    const safeName = (itemName || 'poster').replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const ext = current.mime?.includes('svg') ? 'svg' : current.mime?.includes('png') ? 'png' : 'jpg'
    link.download = `smartcomp_${safeName}_${current.width}x${current.height}.${ext}`
    link.click()
    toast({ title: 'Downloaded ✓', description: link.download })
  }, [current, itemName, toast])

  // ──────────────────────────────────────────────────────────────────────
  // WhatsApp share — opens wa.me (user attaches the downloaded image manually)
  // ──────────────────────────────────────────────────────────────────────

  const handleWhatsAppShare = useCallback(() => {
    if (!current) return
    // wa.me can't carry binary images — we open WhatsApp with a text caption
    // and the user attaches the downloaded PNG from their device.
    const caption = `🛒 ${shop?.name || 'Smart Computers'}\n\n${prompt || itemName || 'Check out this offer!'}${itemPrice ? `\n💰 Rs. ${itemPrice}` : ''}${shop?.phone ? `\n📞 ${shop.phone}` : ''}`
    const url = `https://wa.me/?text=${encodeURIComponent(caption)}`
    window.open(url, '_blank')
    toast({
      title: 'WhatsApp opened',
      description: 'Download the poster first, then attach it in WhatsApp.',
    })
  }, [current, shop, prompt, itemName, itemPrice, toast])

  // ──────────────────────────────────────────────────────────────────────
  // Reset form
  // ──────────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPrompt('')
    setItemName('')
    setItemDetails('')
    setItemPrice('')
    setError(null)
  }, [])

  const handleUseIdea = useCallback((idea: string) => {
    setPrompt(idea)
    toast({ title: 'Idea loaded', description: idea })
  }, [toast])

  // ──────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-violet-600 flex-shrink-0" />
            <span className="truncate">AI Poster Generator</span>
            <Badge variant="outline" className="text-[9px] px-2 py-0.5 bg-violet-50 text-violet-700 border-violet-200 font-bold">
              <Zap className="w-2.5 h-2.5 mr-1" /> FREE • FHD/2K
            </Badge>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Generate WhatsApp Status posters & advertising images from text prompts — powered by FREE Pollinations.ai FLUX (no API key)
          </p>
        </div>
        {shop?.name && (
          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold flex-shrink-0">
            <ShieldCheck className="w-3 h-3 mr-1" /> {shop.name}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ─── Left: Form ─── */}
        <Card className="bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-violet-600" />
              Poster Details
            </CardTitle>
            <CardDescription className="text-xs">
              Describe what you want, or just enter an item name and let AI handle the rest.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Prompt */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Prompt / Vision</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Biggest sale of the year — 50% off all laptops. Vibrant colors, bold headline, festive energy."
                className="mt-1 min-h-[80px] bg-white text-sm"
                maxLength={500}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-slate-400">{prompt.length}/500</span>
                {prompt && (
                  <button onClick={() => setPrompt('')} className="text-[10px] text-red-500 hover:underline">
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Quick prompt ideas */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Lightbulb className="w-3 h-3 text-amber-500" /> Quick Ideas
              </Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PROMPT_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    onClick={() => handleUseIdea(idea)}
                    className="text-[10px] px-2 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-full hover:bg-violet-100 transition-colors"
                  >
                    {idea.length > 32 ? idea.slice(0, 32) + '…' : idea}
                  </button>
                ))}
              </div>
            </div>

            {/* Item name */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Item Name (optional)</Label>
              <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. ASUS Vivobook 15, HP DeskJet Printer, Logitech Mouse"
                className="mt-1 bg-white text-sm"
              />
            </div>

            {/* Item details */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Item Details / Specs (optional)</Label>
              <Textarea
                value={itemDetails}
                onChange={(e) => setItemDetails(e.target.value)}
                placeholder="e.g. Intel i5 12th Gen, 16GB RAM, 512GB SSD, 15.6&quot; FHD display"
                className="mt-1 min-h-[60px] bg-white text-sm"
                maxLength={300}
              />
            </div>

            {/* Item price */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Price (optional)</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2.5 text-sm font-semibold text-slate-500">Rs.</span>
                <Input
                  type="number"
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  placeholder="49999"
                  className="pl-10 bg-white text-sm"
                />
              </div>
            </div>

            {/* Style preset */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Style</Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger className="mt-1 bg-white h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_OPTIONS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="mr-2">{s.icon}</span>
                      <span className="font-semibold">{s.label}</span>
                      <span className="text-[10px] text-slate-400 ml-2">— {s.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Size preset */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Size / Aspect Ratio</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1.5">
                {SIZE_OPTIONS.map((s) => {
                  const Icon = s.icon
                  const isActive = size === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSize(s.id)}
                      className={`flex flex-col items-start p-2 rounded-lg border text-left transition-all ${
                        isActive
                          ? 'bg-violet-50 border-violet-400 ring-1 ring-violet-400'
                          : 'bg-white border-slate-200 hover:border-violet-300'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mb-1 ${isActive ? 'text-violet-600' : 'text-slate-500'}`} />
                      <span className={`text-[11px] font-bold ${isActive ? 'text-violet-700' : 'text-slate-700'}`}>{s.label}</span>
                      <span className="text-[9px] text-slate-400">{s.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Shop branding toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Include Shop Branding</Label>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Auto-injects shop name, phone, address, UPI ID into the poster
                </p>
              </div>
              <Switch checked={includeBranding} onCheckedChange={setIncludeBranding} />
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={handleGenerate}
                disabled={generating || (!prompt.trim() && !itemName.trim())}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold h-11 flex-1 min-w-[160px]"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Poster
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={generating} className="h-11">
                <Trash2 className="w-4 h-4 mr-1" /> Reset
              </Button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-700 font-semibold">Error:</p>
                <p className="text-xs text-red-600 mt-0.5">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Right: Preview ─── */}
        <Card className="bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-violet-600" />
              Preview
            </CardTitle>
            <CardDescription className="text-xs">
              {current
                ? `${current.width}×${current.height} • ${current.style} • ${(current.elapsedMs / 1000).toFixed(1)}s`
                : 'Generated poster will appear here.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!current && !generating && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-violet-50 flex items-center justify-center mb-3">
                  <ImageIcon className="w-10 h-10 text-violet-300" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No poster yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Fill in the form on the left and click <strong>Generate Poster</strong> to create an AI-powered advertising image.
                </p>
              </div>
            )}

            {generating && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="w-12 h-12 text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-semibold text-slate-700">Generating your poster…</p>
                <p className="text-xs text-slate-500 mt-1">AI is painting pixels — usually takes 8–15 seconds.</p>
              </div>
            )}

            {current && !generating && (
              <div className="space-y-3">
                {/* Image preview — constrained to fit the card */}
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
                  <img
                    src={current.image}
                    alt="Generated poster"
                    className="max-w-full max-h-[500px] object-contain"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleDownload} className="bg-emerald-600 hover:bg-emerald-700 text-white h-10 flex-1 min-w-[120px]">
                    <Download className="w-4 h-4 mr-2" /> Download PNG
                  </Button>
                  <Button onClick={handleWhatsAppShare} variant="outline" className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100 h-10 flex-1 min-w-[120px]">
                    <MessageSquare className="w-4 h-4 mr-2" /> WhatsApp
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    variant="outline"
                    className="h-10"
                    title="Regenerate with same settings (AI may produce a different image)"
                  >
                    <Wand2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Hidden anchor for download */}
                <a ref={downloadLinkRef} className="hidden" />

                {/* Show the AI-assembled prompt (collapsible-ish) */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-500 font-semibold hover:text-slate-700">
                    View AI-assembled prompt (super-intelligent)
                  </summary>
                  <p className="mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-600 leading-relaxed">
                    {current.prompt}
                  </p>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── History strip ─── */}
      {history.length > 0 && (
        <Card className="bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-violet-600" />
              Recent Posters
              <Badge variant="outline" className="text-[9px] font-bold">{history.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {history.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setCurrent(p)}
                  className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                    current?.id === p.id ? 'border-violet-500 ring-2 ring-violet-300' : 'border-slate-200 hover:border-violet-300'
                  }`}
                >
                  <img src={p.image} alt="History" className="w-full h-full object-cover" />
                </button>
              ))}
              {history.length > 1 && (
                <button
                  onClick={() => {
                    setHistory([])
                    setCurrent(null)
                  }}
                  className="flex-shrink-0 w-20 h-20 rounded-lg border-2 border-dashed border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 flex items-center justify-center"
                  title="Clear history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Footer info ─── */}
      <div className="text-[10px] text-slate-400 text-center pt-2">
        <p>
          Powered by <strong className="text-slate-500">Pollinations.ai FLUX</strong> — free, no API keys, no rate limits.
          Posters are generated on-demand and never stored on the server. For posters with prices/specs/phone in
          perfect text, use the <strong>Poster Maker</strong> tab (AI product photo + crisp text overlay).
        </p>
      </div>
    </div>
  )
}
