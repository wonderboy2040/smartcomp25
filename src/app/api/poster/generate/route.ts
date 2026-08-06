import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'
import { generateImage as generateImageShared } from '@/lib/image-gen'

/**
 * POST /api/poster/generate
 *
 * AI-powered poster generator for Smart Computers shop advertising.
 *
 * ──────────────────────────────────────────────────────────────────────
 * MULTI-PROVIDER IMAGE GENERATION (v9.1.4)
 * ──────────────────────────────────────────────────────────────────────
 * Tries each free, no-auth (or token-based) image generation provider in
 * order until one succeeds:
 *
 *   1. Pollinations.ai / FLUX        — free, no-auth, public IPs (PRIMARY)
 *   2. Pollinations.ai / OpenAI      — same host, "openai" alias
 *   3. Pollinations.ai / SANA        — always works, default model
 *   4. Pollinations.ai / Turbo       — faster fallback
 *   5. Hugging Face / FLUX.1-schnell — free with HF_TOKEN env var
 *
 * ─── Why NOT Gemini / ChatGPT / DALL-E 3? ───
 *
 *   • Google Gemini image gen (Imagen): NO free public API. Requires
 *     Google Cloud project + billing + API key. Even the "free tier"
 *     asks for a credit card.
 *
 *   • OpenAI DALL-E 3: ~$0.04 per image. Pre-paid credits required.
 *
 *   • OpenAI GPT-Image-1 (gpt-4o image gen): ~$0.07 per image.
 *     Pre-paid credits required.
 *
 *   • Midjourney: NO public API at all. Discord-only.
 *
 *   • Stability AI (SDXL) via their own API: Has free tier but
 *     requires account + API key + email verification.
 *
 *   • Adobe Firefly: Paid only.
 *
 *   • z-ai-web-dev-sdk (GLM-class image gen): FREE and works locally,
 *     BUT calls `internal-api.z.ai` which resolves to PRIVATE IP
 *     addresses (172.25.x.x). Render/Vercel/AWS cannot reach private
 *     IPs → "Connect Timeout Error". Only works from inside Z.ai corp
 *     network.
 *
 *   • Groq: Groq is a TEXT-ONLY inference platform (Llama, Mixtral).
 *     It does NOT have an image generation model. Their API is great
 *     for chat/embeddings but cannot generate images.
 *
 * Pollinations.ai is the only free, no-auth, public-IP image gen API
 * that works from any server.
 *
 * ──────────────────────────────────────────────────────────────────────
 * OPTIONAL: Hugging Face FLUX.1-schnell (free, requires free token)
 *
 *   1. Create free account at https://huggingface.co/join
 *   2. Generate a "Read" token at https://huggingface.co/settings/tokens
 *   3. Set HF_TOKEN env var on Render
 *
 * Once set, provider #5 becomes active and you get the highest-quality
 * FLUX.1-schnell images (1024x1024 native, no downscaling).
 */

// ──────────────────────────────────────────────────────────────────────
// Type definitions
// ──────────────────────────────────────────────────────────────────────

type PosterStyle =
  | 'cyberpunk'
  | 'minimal'
  | 'festive'
  | 'neon'
  | 'premium'
  | 'glossy'
  | 'flat-illustration'
  | '3d-render'
  | 'photorealistic'

type PosterSize = 'whatsapp-status' | 'instagram-story' | 'square' | 'landscape' | 'wide-banner'

interface GenerateRequest {
  prompt: string
  itemName?: string
  itemDetails?: string
  itemPrice?: string | number
  style?: PosterStyle
  size?: PosterSize
  includeShopBranding?: boolean
  /**
   * 'poster' (default) — full advertising poster with text baked in by the AI.
   * 'product-image' — CLEAN textless product photo on a plain background,
   *   meant to be placed into a poster template (Poster Maker) where the
   *   browser renders all text perfectly (prices, specs, phone — no garbled
   *   AI text). 100% free via the same provider chain.
   */
  mode?: 'poster' | 'product-image'
}

// ──────────────────────────────────────────────────────────────────────
// Style presets — each maps a friendly name to a rich prompt fragment
// ──────────────────────────────────────────────────────────────────────

const STYLE_PRESETS: Record<PosterStyle, string> = {
  cyberpunk:
    'cyberpunk aesthetic, neon pink and electric blue accents, holographic glow, futuristic tech vibes, blade-runner-style lighting, dramatic shadows',
  minimal:
    'minimalist design, clean white background, generous negative space, single accent color, Apple-keynote-style typography area, premium and elegant',
  festive:
    'festive Indian celebration theme, marigold and saffron accents, diwali diyas and sparkles, gold foil textures, joyous and vibrant, holiday sale energy',
  neon:
    'neon glow effect, magenta and cyan tubes, dark background, retro-futuristic signage, vibrant luminescence, 80s synthwave palette',
  premium:
    'luxury premium product photography, marble and gold accents, soft studio lighting, depth of field, high-end advertising campaign style',
  glossy:
    'glossy magazine cover style, polished reflective surfaces, saturated colors, professional retouching, billboard-quality composition',
  'flat-illustration':
    'modern flat illustration, vector art style, bold geometric shapes, vibrant gradient mesh, dribbble-style design, clean and playful',
  '3d-render':
    'cinematic 3D render, octane render quality, subsurface scattering, ray-traced reflections, hyper-realistic materials, Unreal-Engine-5-quality lighting',
  photorealistic:
    'photorealistic photography, shot on Canon EOS R5 with 85mm f/1.4 lens, natural bokeh, golden-hour lighting, ultra-sharp focus, magazine-quality',
}

// ──────────────────────────────────────────────────────────────────────
// Size presets — Pollinations preserves aspect ratio
// ──────────────────────────────────────────────────────────────────────

const SIZE_PRESETS: Record<PosterSize, { w: number; h: number; composition: string }> = {
  'whatsapp-status': {
    w: 768,
    h: 1344,
    composition:
      'vertical 9:16 composition, subject centered, large bold headline at top, product hero shot in middle, shop logo and contact info at bottom, leave space for text overlay',
  },
  'instagram-story': {
    w: 768,
    h: 1344,
    composition:
      'vertical 9:16 composition, full-bleed product hero, gradient overlay at bottom for text, swipe-up arrow indicator, story-friendly layout',
  },
  square: {
    w: 1024,
    h: 1024,
    composition:
      'square 1:1 composition, central product focus, balanced negative space, symmetrical layout, feed-optimized',
  },
  landscape: {
    w: 1344,
    h: 768,
    composition:
      'horizontal 16:9 composition, product on left third, headline text on right third, cinematic wide aspect, YouTube thumbnail energy',
  },
  'wide-banner': {
    w: 1920,
    h: 1080,
    composition:
      'ultra-wide 16:9 banner composition, panoramic product display, hero text centered, billboard-scale visual impact',
  },
}

// ──────────────────────────────────────────────────────────────────────
// Shop branding loader
// ──────────────────────────────────────────────────────────────────────

interface ShopBranding {
  name: string
  phone: string
  address: string
  upiId: string
  gstNumber: string
}

async function loadShopBranding(): Promise<ShopBranding | null> {
  if (!isConfigured()) return null
  try {
    const rows = await listRows<any>('Shop')
    const shop = rows?.[0]
    if (!shop) return null
    return {
      name: String(shop.name || 'Smart Computers'),
      phone: String(shop.phone || ''),
      address: String(shop.address || ''),
      upiId: String(shop.upiId || ''),
      gstNumber: String(shop.gstNumber || ''),
    }
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────
// Super-intelligent prompt builder
// ──────────────────────────────────────────────────────────────────────

function buildSuperPrompt(opts: {
  userPrompt: string
  itemName?: string
  itemDetails?: string
  itemPrice?: string | number
  style: PosterStyle
  size: PosterSize
  shop: ShopBranding | null
  includeBranding: boolean
  mode?: 'poster' | 'product-image'
}): string {
  const { userPrompt, itemName, itemDetails, itemPrice, style, size, shop, includeBranding, mode } = opts

  // ── PRODUCT-IMAGE MODE ──────────────────────────────────────────────
  // Poster Maker flow: we ONLY need the hero artwork (no text — the browser
  // draws crisp text on top). Explicitly forbid text so prices/phone/shop
  // names never come out garbled, which is what pure text-to-image posters
  // suffer from.
  if (mode === 'product-image') {
    const parts: string[] = []
    if (itemName?.trim()) {
      parts.push(`professional product photography of a ${itemName.trim()}`)
    } else if (userPrompt?.trim()) {
      parts.push(`professional product photography of: ${userPrompt.trim()}`)
    } else {
      parts.push('professional product photography of a modern tech gadget')
    }
    if (itemDetails?.trim()) {
      parts.push(`product features: ${itemDetails.trim().slice(0, 250)}`)
    }
    parts.push(STYLE_PRESETS[style])
    parts.push(
      'centered composition, product fills 60-75% of frame, clean seamless studio background with soft gradient, soft shadows, slight angle showing the product, commercial catalog quality, ultra sharp focus, vibrant colors, high dynamic range',
    )
    parts.push(
      'IMPORTANT: absolutely no text, no words, no letters, no numbers, no logos, no watermark, no captions, no price tags — the image must contain the product ONLY on a clean background',
    )
    return parts.join(', ')
  }

  // ── POSTER MODE (original full-AI poster) ───────────────────────────
  const stylePreset = STYLE_PRESETS[style]
  const sizePreset = SIZE_PRESETS[size]

  const parts: string[] = []

  if (userPrompt?.trim()) parts.push(userPrompt.trim())

  if (itemName?.trim()) {
    parts.push(
      `featuring ${itemName.trim()} as the hero product, prominently displayed and well-lit, product shot takes up 40-60% of the frame`,
    )
  }
  if (itemDetails?.trim()) {
    parts.push(`product context: ${itemDetails.trim().slice(0, 300)}`)
  }
  if (itemPrice !== undefined && itemPrice !== '' && Number(itemPrice) > 0) {
    parts.push(`with a visible price tag area showing "Rs. ${itemPrice}" in bold typography`)
  }

  parts.push(stylePreset)
  parts.push(sizePreset.composition)

  if (includeBranding && shop) {
    const brandingBits: string[] = []
    if (shop.name) brandingBits.push(`shop name "${shop.name}"`)
    if (shop.phone) brandingBits.push(`contact ${shop.phone}`)
    if (shop.address) brandingBits.push(`location ${shop.address.slice(0, 80)}`)
    if (shop.upiId) brandingBits.push(`UPI ID ${shop.upiId}`)
    if (brandingBits.length > 0) {
      parts.push(
        `include a clean footer area with shop branding text: ${brandingBits.join(', ')}, rendered as elegant typography overlay`,
      )
    }
  }

  parts.push(
    'ultra high quality, FHD 1080p clarity, 2K resolution detail, sharp focus, professional commercial advertising poster, vibrant colors, high dynamic range, photorealistic textures, no watermark, no blurry artifacts',
  )

  return parts.join(', ')
}

// ──────────────────────────────────────────────────────────────────────
// Provider implementations (shared chain lives in src/lib/image-gen.ts)
// Chain: HuggingFace FLUX (if HF_TOKEN set) → Pollinations @requested size
//        → Pollinations @256 (free tier) → Pollinations POST @256
//        → always-works SVG fallback (product art for template posters,
//          text placeholder for full-AI posters)
// ──────────────────────────────────────────────────────────────────────

interface ImageGenResult {
  base64: string
  contentType: string
  actualWidth: number
  actualHeight: number
  provider: string
  model: string
}

async function generateImage(opts: {
  superPrompt: string
  width: number
  height: number
  mode?: 'poster' | 'product-image'
}): Promise<ImageGenResult> {
  const { superPrompt, width, height, mode } = opts
  const startMs = Date.now()
  const result = await generateImageShared(
    {
      prompt: superPrompt,
      width,
      height,
      seed: Math.floor(Math.random() * 1000000),
      noLogo: true,
    },
    {
      perAttemptTimeoutMs: 90_000,
      fallbackKind: mode === 'product-image' ? 'product-art' : 'placeholder',
      // Full-poster mode: a 256px square AI image would look worse than the
      // full-size SVG placeholder — skip the tiny fallback there.
      noSmallFallback: mode !== 'product-image',
    },
  )
  console.log(`[/api/poster/generate] ✓ provider=${result.provider} ${result.width}x${result.height} in ${Date.now() - startMs}ms`)
  return {
    base64: result.base64,
    contentType: result.mime,
    actualWidth: result.width,
    actualHeight: result.height,
    provider: result.provider,
    model: result.provider,
  }
}

// ──────────────────────────────────────────────────────────────────────
// POST handler
// ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const body = (await req.json().catch(() => ({}))) as GenerateRequest
    const {
      prompt = '',
      itemName,
      itemDetails,
      itemPrice,
      style = 'premium',
      size,
      includeShopBranding = true,
      mode = 'poster',
    } = body

    if (!prompt?.trim() && !itemName?.trim()) {
      return NextResponse.json(
        { error: 'Either a prompt or an item name is required.' },
        { status: 400 },
      )
    }

    // product-image mode defaults to a square hero crop (best for templates)
    const effectiveSize: PosterSize = size ?? (mode === 'product-image' ? 'square' : 'whatsapp-status')

    // Load shop branding (best-effort) — not needed for product-image mode
    const shop = includeShopBranding && mode !== 'product-image' ? await loadShopBranding() : null

    // Build the super-prompt
    const superPrompt = buildSuperPrompt({
      userPrompt: prompt,
      itemName,
      itemDetails,
      itemPrice,
      style,
      size: effectiveSize,
      shop,
      includeBranding: includeShopBranding,
      mode,
    })

    const sizePreset = SIZE_PRESETS[effectiveSize]

    // Generate the image via multi-provider fallback chain
    const result = await generateImage({
      superPrompt,
      width: sizePreset.w,
      height: sizePreset.h,
      mode,
    })

    const elapsedMs = Date.now() - startTime
    const ct = result.contentType || 'image/jpeg'
    const mimePrefix = ct.includes('svg')
      ? 'data:image/svg+xml;base64,'
      : ct.includes('png')
        ? 'data:image/png;base64,'
        : 'data:image/jpeg;base64,'

    return NextResponse.json({
      success: true,
      image: `${mimePrefix}${result.base64}`,
      prompt: superPrompt,
      style,
      size: effectiveSize,
      mode,
      width: result.actualWidth,
      height: result.actualHeight,
      elapsedMs,
      shopBrandingUsed: !!shop && includeShopBranding,
      model: result.model,
      provider: result.provider,
      mime: result.contentType,
    })
  } catch (e: any) {
    console.error('[/api/poster/generate] final error:', e?.message)
    return NextResponse.json(
      {
        error: e?.message || 'Failed to generate poster.',
        hint: e?.message?.includes('timed out')
          ? 'The AI model is busy. Wait 1 minute and try again.'
          : e?.message?.includes('Network error')
            ? 'Transient network issue. Wait 30s and retry.'
            : undefined,
      },
      { status: 500 },
    )
  }
}

// ──────────────────────────────────────────────────────────────────────
// GET — quick metadata endpoint (lists styles + sizes + providers for UI)
// ──────────────────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    styles: Object.keys(STYLE_PRESETS),
    sizes: Object.keys(SIZE_PRESETS).map((k) => ({
      id: k,
      ...SIZE_PRESETS[k as PosterSize],
    })),
    providers: [
      { id: 'huggingface-flux', label: 'Hugging Face / FLUX.1-schnell (free with free HF_TOKEN — best 1024px quality)' },
      { id: 'pollinations-requested', label: 'Pollinations.ai / full size (free, no-auth)' },
      { id: 'pollinations-256', label: 'Pollinations.ai / 256px (free tier — currently the reliable anonymous size)' },
      { id: 'svg-product-art', label: 'Local vector product art (always works, zero cost)' },
    ],
    note: 'Gemini / ChatGPT (DALL-E 3 / GPT-Image-1) are NOT free — they require paid API keys. This endpoint chains Hugging Face FLUX (free token) → Pollinations.ai (free) → local vector art (always works).',
  })
}
