/**
 * Free Text-to-Image generation library with multi-provider fallback chain.
 *
 * WHY THIS EXISTS:
 *   The old /api/poster/generate used z-ai-web-dev-sdk which on Render free-tier
 *   reliably failed with "fetch failed" after 10s of cold-start latency. There
 *   was no fallback, so the AI Poster feature was effectively unusable in prod.
 *
 *   This module tries multiple FREE, no-API-key providers in order. If one is
 *   down or slow, the next one is tried automatically. We log which provider
 *   succeeded so the user (and the API response) can see it.
 *
 * PROVIDERS (in order of preference):
 *   1. Pollinations.ai (sana model) — no API key, no rate limit, returns JPEG bytes directly.
 *      Free for commercial use. Supports referrer-based auth (no key).
 *      Limitation: images auto-downscale to max ~580x1015. Still great for previews.
 *
 *   2. Pollinations.ai (turbo model, if available) — fallback to the same endpoint with
 *      a different model param in case `sana` is overloaded.
 *
 *   3. Pollinations.ai GET endpoint — pure URL-based fetch, no POST needed. Works even
 *      if the POST endpoint is down. Useful as the simplest possible last resort.
 *
 *   4. (Future) Local placeholder generator — generates a colored gradient with the
 *      prompt text rendered via canvas. Not implemented yet but if all providers fail
 *      the API returns a clear error.
 *
 * Each provider has:
 *   - A short name (returned in the API response as `provider`)
 *   - An async generate() function that returns { base64, mime, width, height, provider }
 *   - Its own timeout (none may exceed the master timeout)
 */

export interface ImageGenInput {
  prompt: string
  width: number
  height: number
  seed?: number
  /** Used by Pollinations — disables the small "Pollinations" watermark in the corner. */
  noLogo?: boolean
  /** Optional referrer string (some providers route via referrer auth). */
  referrer?: string
}

export interface ImageGenResult {
  /** base64-encoded image bytes (no data URL prefix). */
  base64: string
  /** MIME type — usually 'image/jpeg' since Pollinations outputs JPEG. */
  mime: string
  /** Actual pixel dimensions of the returned image (may be smaller than requested). */
  width: number
  height: number
  /** Which provider produced this image. */
  provider: string
  /** Elapsed milliseconds for this attempt. */
  elapsedMs: number
}

export interface ImageGenError extends Error {
  provider: string
  attempted: boolean
}

// ──────────────────────────────────────────────────────────────────────
// Pollinations.ai — primary provider (no API key, free, reliable)
// ──────────────────────────────────────────────────────────────────────

const POLLINATIONS_BASE = 'https://image.pollinations.ai'

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(`Request timed out after ${timeoutMs}ms`), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Decode a fetch Response into JPEG/PNG bytes + dimensions.
 * Reads the first few bytes to detect format. Returns base64-encoded bytes.
 */
async function decodeImageResponse(res: Response): Promise<{ base64: string; mime: string; width: number; height: number }> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes.length === 0) throw new Error('Empty response body (0 bytes)')

  // Detect format from magic bytes
  let mime: string
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = 'image/jpeg'
  } else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    mime = 'image/png'
  } else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    mime = 'image/webp'
  } else if (contentType.startsWith('image/')) {
    mime = contentType.split(';')[0].trim()
  } else {
    // Could be JSON error message — surface it
    const text = new TextDecoder().decode(bytes).slice(0, 300)
    throw new Error(`Unexpected response (not an image): ${text}`)
  }

  // Parse dimensions for common formats
  let width = 0
  let height = 0
  if (mime === 'image/jpeg') {
    const dims = parseJpegDimensions(bytes)
    width = dims.width
    height = dims.height
  } else if (mime === 'image/png') {
    if (bytes.length >= 24) {
      width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
      height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
    }
  }

  const base64 = Buffer.from(buf).toString('base64')
  return { base64, mime, width, height }
}

/**
 * Parse JPEG SOF (Start-of-Frame) markers to extract width/height.
 * JPEGs are a sequence of markers; we look for SOF0 (0xC0) through SOF15 (0xCF, excluding 0xC4/0xC8/0xCC).
 */
function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  try {
    let i = 2 // Skip SOI marker (FFD8)
    while (i + 1 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++
        continue
      }
      const marker = bytes[i + 1]
      // SOF0..SOF15 (excluding restart markers C4, C8, CC)
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        // SOF segment: precision(1) + height(2) + width(2)
        const height = (bytes[i + 5] << 8) | bytes[i + 6]
        const width = (bytes[i + 7] << 8) | bytes[i + 8]
        return { width, height }
      }
      // Skip this marker segment
      const segmentLength = (bytes[i + 2] << 8) | bytes[i + 3]
      i += 2 + segmentLength
    }
  } catch {
    // Ignore parse errors — dimensions unknown
  }
  return { width: 0, height: 0 }
}

// ──────────────────────────────────────────────────────────────────────
// Provider 1: Pollinations.ai via GET (simplest, most reliable)
// ──────────────────────────────────────────────────────────────────────

async function generatePollinationsGet(opts: ImageGenInput, timeoutMs: number): Promise<ImageGenResult> {
  const startMs = Date.now()
  const params = new URLSearchParams({
    width: String(opts.width),
    height: String(opts.height),
    nologo: String(opts.noLogo ?? true),
    seed: String(opts.seed ?? Math.floor(Math.random() * 1_000_000)),
    model: 'sana',
    enhance: 'true',
  })
  if (opts.referrer) params.set('referrer', opts.referrer)

  const url = `${POLLINATIONS_BASE}/prompt/${encodeURIComponent(opts.prompt.slice(0, 500))}?${params.toString()}`
  console.log(`[image-gen] Pollinations GET → ${url.slice(0, 120)}…`)

  const res = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs)
  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>')
    throw new Error(`Pollinations GET ${res.status}: ${text.slice(0, 200)}`)
  }

  const decoded = await decodeImageResponse(res)
  return {
    ...decoded,
    provider: 'pollinations-get',
    elapsedMs: Date.now() - startMs,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Provider 2: Pollinations.ai via POST (lets us pass longer prompts cleanly)
// ──────────────────────────────────────────────────────────────────────

async function generatePollinationsPost(opts: ImageGenInput, timeoutMs: number): Promise<ImageGenResult> {
  const startMs = Date.now()
  const params = new URLSearchParams({
    width: String(opts.width),
    height: String(opts.height),
    nologo: String(opts.noLogo ?? true),
    seed: String(opts.seed ?? Math.floor(Math.random() * 1_000_000)),
    model: 'sana',
  })
  if (opts.referrer) params.set('referrer', opts.referrer)

  const url = `${POLLINATIONS_BASE}/prompt/${encodeURIComponent(opts.prompt.slice(0, 500))}?${params.toString()}`

  console.log(`[image-gen] Pollinations POST → ${url.slice(0, 120)}…`)

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        width: opts.width,
        height: opts.height,
        seed: opts.seed ?? Math.floor(Math.random() * 1_000_000),
        model: 'sana',
        nologo: opts.noLogo ?? true,
        enhance: true,
      }),
    },
    timeoutMs,
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>')
    throw new Error(`Pollinations POST ${res.status}: ${text.slice(0, 200)}`)
  }

  const decoded = await decodeImageResponse(res)
  return {
    ...decoded,
    provider: 'pollinations-post',
    elapsedMs: Date.now() - startMs,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Provider 1.5: Hugging Face Inference API (FLUX.1-schnell) — free with a
// free HF token. When HF_TOKEN env var is set this is tried FIRST because it
// returns true 1024px FLUX quality (no downscale). See README/settings for
// how to get the token (free: huggingface.co → Settings → Access Tokens).
// ──────────────────────────────────────────────────────────────────────

const HF_FLUX_URL = 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell'

async function generateHuggingFaceFlux(opts: ImageGenInput, timeoutMs: number): Promise<ImageGenResult> {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN not set — skipping HuggingFace provider')

  const startMs = Date.now()
  // FLUX.1-schnell supports arbitrary sizes; cap at 1024 on the long edge.
  const maxDim = 1024
  const scale = Math.min(1, maxDim / Math.max(opts.width, opts.height))
  const w = Math.max(64, Math.round(opts.width * scale))
  const h = Math.max(64, Math.round(opts.height * scale))

  const res = await fetchWithTimeout(
    HF_FLUX_URL,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: opts.prompt.slice(0, 1000),
        parameters: { width: w, height: h },
      }),
    },
    timeoutMs,
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>')
    throw new Error(`HuggingFace ${res.status}: ${text.slice(0, 200)}`)
  }
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (!contentType.startsWith('image/')) {
    const text = await res.text().catch(() => '')
    throw new Error(`HuggingFace returned non-image: ${text.slice(0, 200)}`)
  }

  const buf = await res.arrayBuffer()
  if (buf.byteLength < 1000) throw new Error('HuggingFace returned a too-small image')
  const bytes = new Uint8Array(buf)
  const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg'
  return {
    base64: Buffer.from(buf).toString('base64'),
    mime,
    width: w,
    height: h,
    provider: 'huggingface-flux',
    elapsedMs: Date.now() - startMs,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Provider 3: SVG product artwork — ALWAYS works, zero cost. Draws a
// professional vector product illustration (laptop / desktop / printer /
// phone / gaming / generic gadget) with gradient studio lighting. Used as
// the hero visual when no free AI provider is available. Textless by design
// (the poster template renders all text, so it's always crisp).
// ──────────────────────────────────────────────────────────────────────

function detectProductKind(prompt: string): string {
  const p = prompt.toLowerCase()
  if (p.includes('laptop') || p.includes('notebook') || p.includes('vivobook') || p.includes('macbook')) return 'laptop'
  if (p.includes('desktop') || p.includes('pc') || p.includes('tower') || p.includes('cpu')) return 'desktop'
  if (p.includes('printer') || p.includes('toner') || p.includes('inkjet') || p.includes('laserjet')) return 'printer'
  if (p.includes('phone') || p.includes('smartphone') || p.includes('mobile') || p.includes('iphone')) return 'phone'
  if (p.includes('gaming') || p.includes('rtx') || p.includes('graphics')) return 'gaming'
  if (p.includes('mouse') || p.includes('keyboard') || p.includes('headset') || p.includes('accessor')) return 'accessory'
  return 'generic'
}

function generateSvgProductArt(opts: ImageGenInput): ImageGenResult {
  const startMs = Date.now()
  const w = opts.width
  const h = opts.height
  const kind = detectProductKind(opts.prompt)

  // Textless studio scene: gradient backdrop + glow + product silhouette.
  // The shapes below are built from simple paths so they render perfectly at
  // ANY resolution (vector) and need no network.
  let product: string
  if (kind === 'laptop') {
    product = `
      <g transform="translate(${w / 2}, ${h * 0.56})">
        <!-- screen glow -->
        <ellipse cx="0" cy="-10" rx="${w * 0.32}" ry="${h * 0.16}" fill="rgba(99,102,241,0.35)" filter="url(#blur)"/>
        <!-- screen -->
        <rect x="${-w * 0.30}" y="${-h * 0.24}" width="${w * 0.60}" height="${h * 0.36}" rx="${w * 0.018}" fill="#0b1220" stroke="#334155" stroke-width="3"/>
        <rect x="${-w * 0.27}" y="${-h * 0.21}" width="${w * 0.54}" height="${h * 0.30}" rx="${w * 0.012}" fill="url(#screenGrad)"/>
        <!-- keyboard base -->
        <path d="M ${-w * 0.36} ${h * 0.06} L ${w * 0.36} ${h * 0.06} L ${w * 0.30} ${h * 0.16} L ${-w * 0.30} ${h * 0.16} Z" fill="#1e293b" stroke="#334155" stroke-width="3"/>
        <rect x="${-w * 0.20}" y="${h * 0.085}" width="${w * 0.40}" height="${h * 0.008}" rx="2" fill="#475569"/>
        <rect x="${-w * 0.26}" y="${h * 0.11}" width="${w * 0.06}" height="${h * 0.018}" rx="1.5" fill="#f59e0b"/>
        <rect x="${-w * 0.14}" y="${h * 0.11}" width="${w * 0.28}" height="${h * 0.018}" rx="1.5" fill="#475569"/>
      </g>`
  } else if (kind === 'desktop') {
    product = `
      <g transform="translate(${w * 0.5}, ${h * 0.58})">
        <ellipse cx="0" cy="-20" rx="${w * 0.3}" ry="${h * 0.13}" fill="rgba(99,102,241,0.35)" filter="url(#blur)"/>
        <!-- monitor -->
        <rect x="${-w * 0.22}" y="${-h * 0.26}" width="${w * 0.44}" height="${h * 0.30}" rx="${w * 0.014}" fill="#0b1220" stroke="#334155" stroke-width="3"/>
        <rect x="${-w * 0.20}" y="${-h * 0.24}" width="${w * 0.40}" height="${h * 0.26}" rx="${w * 0.008}" fill="url(#screenGrad)"/>
        <rect x="${-w * 0.014}" y="${h * 0.045}" width="${w * 0.028}" height="${h * 0.045}" fill="#334155"/>
        <rect x="${-w * 0.08}" y="${h * 0.09}" width="${w * 0.16}" height="${h * 0.012}" rx="3" fill="#334155"/>
        <!-- tower -->
        <rect x="${w * 0.19}" y="${-h * 0.20}" width="${w * 0.13}" height="${h * 0.34}" rx="${w * 0.01}" fill="#111827" stroke="#334155" stroke-width="3"/>
        <rect x="${w * 0.215}" y="${-h * 0.16}" width="${w * 0.01}" height="${h * 0.05}" fill="#22c55e" opacity="0.9"/>
        <rect x="${w * 0.215}" y="${-h * 0.08}" width="${w * 0.01}" height="${h * 0.05}" fill="#3b82f6" opacity="0.9"/>
        <circle cx="${w * 0.245}" cy="${-h * 0.045}" r="${w * 0.008}" fill="#ef4444"/>
        <rect x="${w * 0.215}" y="${h * 0.02}" width="${w * 0.07}" height="${h * 0.02}" rx="1" fill="#334155"/>
      </g>`
  } else if (kind === 'printer') {
    product = `
      <g transform="translate(${w * 0.5}, ${h * 0.58})">
        <ellipse cx="0" cy="-10" rx="${w * 0.3}" ry="${h * 0.12}" fill="rgba(99,102,241,0.35)" filter="url(#blur)"/>
        <!-- paper -->
        <rect x="${-w * 0.13}" y="${-h * 0.22}" width="${w * 0.26}" height="${h * 0.10}" rx="2" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/>
        <rect x="${-w * 0.11}" y="${-h * 0.19}" width="${w * 0.22}" height="${h * 0.004}" fill="#cbd5e1"/>
        <rect x="${-w * 0.11}" y="${-h * 0.15}" width="${w * 0.22}" height="${h * 0.004}" fill="#cbd5e1"/>
        <!-- body -->
        <rect x="${-w * 0.24}" y="${-h * 0.10}" width="${w * 0.48}" height="${h * 0.20}" rx="${w * 0.015}" fill="#1e293b" stroke="#334155" stroke-width="3"/>
        <rect x="${-w * 0.20}" y="${-h * 0.055}" width="${w * 0.40}" height="${h * 0.03}" rx="${w * 0.005}" fill="#0f172a"/>
        <rect x="${-w * 0.16}" y="${h * 0.02}" width="${w * 0.08}" height="${h * 0.014}" rx="2" fill="#38bdf8"/>
        <rect x="${-w * 0.05}" y="${h * 0.02}" width="${w * 0.08}" height="${h * 0.014}" rx="2" fill="#38bdf8"/>
        <rect x="${w * 0.06}" y="${h * 0.02}" width="${w * 0.08}" height="${h * 0.014}" rx="2" fill="#38bdf8"/>
        <rect x="${w * 0.17}" y="${-h * 0.05}" width="${w * 0.02}" height="${h * 0.03}" rx="2" fill="#22c55e"/>
      </g>`
  } else if (kind === 'phone') {
    product = `
      <g transform="translate(${w * 0.5}, ${h * 0.56})">
        <ellipse cx="0" cy="0" rx="${w * 0.14}" ry="${h * 0.26}" fill="rgba(99,102,241,0.3)" filter="url(#blur)"/>
        <rect x="${-w * 0.11}" y="${-h * 0.30}" width="${w * 0.22}" height="${h * 0.48}" rx="${w * 0.05}" fill="#0b1220" stroke="#334155" stroke-width="3"/>
        <rect x="${-w * 0.095}" y="${-h * 0.27}" width="${w * 0.19}" height="${h * 0.42}" rx="${w * 0.035}" fill="url(#screenGrad)"/>
        <rect x="${-w * 0.035}" y="${-h * 0.255}" width="${w * 0.07}" height="${h * 0.008}" rx="3" fill="#1e293b"/>
      </g>`
  } else if (kind === 'gaming') {
    product = `
      <g transform="translate(${w * 0.5}, ${h * 0.56})">
        <ellipse cx="0" cy="0" rx="${w * 0.26}" ry="${h * 0.14}" fill="rgba(168,85,247,0.35)" filter="url(#blur)"/>
        <rect x="${-w * 0.10}" y="${-h * 0.26}" width="${w * 0.20}" height="${h * 0.40}" rx="${w * 0.015}" fill="#0f172a" stroke="#334155" stroke-width="3"/>
        <path d="M ${-w * 0.10} ${-h * 0.18} L ${w * 0.10} ${-h * 0.18} L ${w * 0.10} ${-h * 0.14} L ${-w * 0.10} ${-h * 0.14} Z" fill="url(#screenGrad)"/>
        <rect x="${-w * 0.06}" y="${-h * 0.08}" width="${w * 0.004}" height="${h * 0.10}" fill="#22c55e"/>
        <rect x="${-w * 0.03}" y="${-h * 0.08}" width="${w * 0.004}" height="${h * 0.07}" fill="#a855f7"/>
        <rect x="${w * 0.00}" y="${-h * 0.08}" width="${w * 0.004}" height="${h * 0.09}" fill="#3b82f6"/>
        <circle cx="${w * 0.055}" cy="${-h * 0.12}" r="${w * 0.012}" fill="#ef4444"/>
        <circle cx="${w * 0.075}" cy="${-h * 0.085}" r="${w * 0.008}" fill="#22c55e"/>
      </g>`
  } else if (kind === 'accessory') {
    product = `
      <g transform="translate(${w * 0.5}, ${h * 0.58})">
        <ellipse cx="0" cy="0" rx="${w * 0.2}" ry="${h * 0.1}" fill="rgba(99,102,241,0.3)" filter="url(#blur)"/>
        <!-- mouse -->
        <ellipse cx="0" cy="0" rx="${w * 0.09}" ry="${h * 0.13}" fill="#1e293b" stroke="#334155" stroke-width="3"/>
        <line x1="0" y1="${-h * 0.10}" x2="0" y2="${-h * 0.02}" stroke="#475569" stroke-width="2"/>
        <circle cx="0" cy="${-h * 0.06}" r="${w * 0.012}" fill="#f59e0b"/>
        <!-- keyboard hint -->
        <rect x="${-w * 0.28}" y="${h * 0.12}" width="${w * 0.56}" height="${h * 0.05}" rx="${w * 0.008}" fill="#0f172a" stroke="#334155" stroke-width="2"/>
        <rect x="${-w * 0.25}" y="${h * 0.135}" width="${w * 0.50}" height="${h * 0.018}" rx="1" fill="#334155"/>
      </g>`
  } else {
    // generic gadget: stylized all-in-one with circuit accents
    product = `
      <g transform="translate(${w * 0.5}, ${h * 0.56})">
        <ellipse cx="0" cy="-10" rx="${w * 0.3}" ry="${h * 0.14}" fill="rgba(99,102,241,0.35)" filter="url(#blur)"/>
        <rect x="${-w * 0.20}" y="${-h * 0.20}" width="${w * 0.40}" height="${h * 0.28}" rx="${w * 0.02}" fill="#0b1220" stroke="#334155" stroke-width="3"/>
        <rect x="${-w * 0.17}" y="${-h * 0.17}" width="${w * 0.34}" height="${h * 0.22}" rx="${w * 0.012}" fill="url(#screenGrad)"/>
        <rect x="${-w * 0.012}" y="${h * 0.085}" width="${w * 0.024}" height="${h * 0.04}" fill="#334155"/>
        <rect x="${-w * 0.09}" y="${h * 0.125}" width="${w * 0.18}" height="${h * 0.012}" rx="3" fill="#334155"/>
        <circle cx="${w * 0.15}" cy="${-h * 0.24}" r="${w * 0.012}" fill="#38bdf8" opacity="0.8"/>
        <circle cx="${w * 0.20}" cy="${-h * 0.18}" r="${w * 0.007}" fill="#a855f7" opacity="0.8"/>
      </g>`
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="45%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="screenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="50%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="rgba(129,140,248,0.28)"/>
      <stop offset="100%" stop-color="rgba(129,140,248,0)"/>
    </radialGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${Math.max(4, Math.round(w * 0.02))}"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <!-- circuit traces -->
  <g stroke="rgba(148,163,184,0.16)" stroke-width="2" fill="none">
    <path d="M ${w * 0.06} ${h * 0.12} H ${w * 0.18} V ${h * 0.22}"/>
    <path d="M ${w * 0.94} ${h * 0.14} H ${w * 0.82} V ${h * 0.26}"/>
    <path d="M ${w * 0.08} ${h * 0.86} H ${w * 0.2} V ${h * 0.76}"/>
    <path d="M ${w * 0.92} ${h * 0.88} H ${w * 0.8} V ${h * 0.78}"/>
  </g>
  <g fill="#38bdf8" opacity="0.5">
    <circle cx="${w * 0.18}" cy="${h * 0.22}" r="3"/>
    <circle cx="${w * 0.82}" cy="${h * 0.26}" r="3"/>
    <circle cx="${w * 0.2}" cy="${h * 0.76}" r="3"/>
    <circle cx="${w * 0.8}" cy="${h * 0.78}" r="3"/>
  </g>
  ${product}
</svg>`

  return {
    base64: Buffer.from(svg, 'utf8').toString('base64'),
    mime: 'image/svg+xml',
    width: w,
    height: h,
    provider: 'svg-product-art',
    elapsedMs: Date.now() - startMs,
  }
}

async function generateSvgPlaceholder(opts: ImageGenInput): Promise<ImageGenResult> {
  const startMs = Date.now()
  const w = opts.width
  const h = opts.height

  // Build a clean SVG poster with gradient background + the prompt as headline.
  // This is GUARANTEED to work — no network, no external dep.
  const safePrompt = (opts.prompt || 'Smart Computers')
    .slice(0, 200)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Wrap text into multiple lines based on rough char-per-line estimate
  const charsPerLine = Math.max(20, Math.floor(w / 22))
  const lines: string[] = []
  const words = safePrompt.split(/\s+/)
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length <= charsPerLine) {
      current = (current + ' ' + word).trim()
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)

  const fontSize = Math.max(28, Math.floor(w / 18))
  const lineHeight = Math.floor(fontSize * 1.3)
  const startY = Math.floor(h / 2 - (lines.length * lineHeight) / 2)

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="50%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${w}" height="${Math.floor(h * 0.08)}" fill="url(#accent)"/>
  <rect x="0" y="${h - Math.floor(h * 0.08)}" width="${w}" height="${Math.floor(h * 0.08)}" fill="url(#accent)"/>
  ${lines.map((line, i) => {
    const y = startY + i * lineHeight + fontSize
    return `<text x="${w / 2}" y="${y}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle" stroke="rgba(0,0,0,0.4)" stroke-width="2" paint-order="stroke fill">${line}</text>`
  }).join('\n  ')}
  <text x="${w / 2}" y="${h - Math.floor(h * 0.04)}" font-family="sans-serif" font-size="${Math.floor(fontSize * 0.5)}" fill="rgba(255,255,255,0.8)" text-anchor="middle">Smart Computers</text>
</svg>`

  const base64 = Buffer.from(svg, 'utf8').toString('base64')
  return {
    base64,
    mime: 'image/svg+xml',
    width: w,
    height: h,
    provider: 'svg-placeholder',
    elapsedMs: Date.now() - startMs,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Main entry point — try providers in order, return first success
// ──────────────────────────────────────────────────────────────────────

export interface GenerateImageOptions {
  /** Master timeout per attempt (ms). Default 60s. */
  perAttemptTimeoutMs?: number
  /** Optional seed for reproducibility. */
  seed?: number
  /** Referrer for Pollinations auth (optional). */
  referrer?: string
  /** Disable the placeholder fallback (forces an error if all providers fail). */
  noPlaceholder?: boolean
  /**
   * Which always-works fallback to use when every free AI provider fails:
   *  - 'product-art'  → textless vector product illustration (for template
   *    posters where the browser renders the text)
   *  - 'placeholder'  → gradient poster with the prompt text (for the
   *    full-AI poster flow)
   * Default: 'placeholder'.
   */
  fallbackKind?: 'product-art' | 'placeholder'
  /**
   * Skip the 256×256 Pollinations attempts. Use for full-poster mode where a
   * tiny square image would look worse than the full-size SVG placeholder.
   */
  noSmallFallback?: boolean
}

export async function generateImage(
  input: ImageGenInput,
  options: GenerateImageOptions = {},
): Promise<ImageGenResult> {
  const perAttempt = options.perAttemptTimeoutMs ?? 60_000
  const errors: Array<{ provider: string; error: string }> = []

  // Provider 0: Hugging Face FLUX.1-schnell — true 1024px quality, free with
  // a free HF token. Tried first when HF_TOKEN is configured.
  if (process.env.HF_TOKEN) {
    try {
      return await generateHuggingFaceFlux(
        { ...input, seed: options.seed },
        perAttempt,
      )
    } catch (e: any) {
      errors.push({ provider: 'huggingface-flux', error: e?.message || String(e) })
      console.warn(`[image-gen] huggingface-flux failed: ${e?.message}`)
    }
  }

  // Provider 1: Pollinations GET at the REQUESTED size (best quality when the
  // anonymous tier allows it). Capped short — when the free tier is busy it
  // either 402s quickly or queues for ~45s; we'd rather fall through fast.
  let pollinationsUnavailable = false
  try {
    return await generatePollinationsGet(
      { ...input, seed: options.seed, referrer: options.referrer },
      Math.min(perAttempt, 10_000),
    )
  } catch (e: any) {
    const msg = e?.message || String(e)
    errors.push({ provider: 'pollinations-get', error: msg })
    console.warn(`[image-gen] pollinations-get failed: ${msg}`)
    // 402 (insufficient balance) / 429 (queue full) = the anonymous tier is
    // unavailable right now. The other Pollinations endpoints will fail the
    // same way, so skip them and go straight to the fallback.
    if (msg.includes('402') || msg.includes('429') || msg.includes('Insufficient balance') || msg.includes('Too Many Requests')) {
      pollinationsUnavailable = true
    }
  }

  // Provider 2: Pollinations GET at 256×256 — the max size the free
  // anonymous tier currently allows (larger requests return 402). Still a
  // REAL AI image; the poster template upscales it into the hero slot.
  if (!options.noSmallFallback && !pollinationsUnavailable) {
    try {
      const small = await generatePollinationsGet(
        { ...input, seed: options.seed, referrer: options.referrer, width: 256, height: 256 },
        Math.min(perAttempt, 25_000),
      )
      small.provider = 'pollinations-256'
      return small
    } catch (e: any) {
      errors.push({ provider: 'pollinations-256', error: e?.message || String(e) })
      console.warn(`[image-gen] pollinations-256 failed: ${e?.message}`)
    }

    // Provider 3: Pollinations POST (same host, alternate endpoint)
    try {
      return await generatePollinationsPost(
        { ...input, seed: options.seed, referrer: options.referrer, width: 256, height: 256 },
        Math.min(perAttempt, 15_000),
      )
    } catch (e: any) {
      errors.push({ provider: 'pollinations-post', error: e?.message || String(e) })
      console.warn(`[image-gen] pollinations-post failed: ${e?.message}`)
    }
  }

  // Provider 4: always-works SVG fallback (never a 500 for the user)
  if (!options.noPlaceholder) {
    const kind = options.fallbackKind ?? 'placeholder'
    console.warn(`[image-gen] All real providers failed — falling back to SVG ${kind}.`)
    const fallback = kind === 'product-art' ? generateSvgProductArt(input) : await generateSvgPlaceholder(input)
    fallback.provider = kind === 'product-art' ? 'svg-product-art' : 'svg-placeholder (all providers failed)'
    return fallback
  }

  // All failed and placeholder disabled — throw comprehensive error
  const errorSummary = errors.map((e) => `${e.provider}: ${e.error}`).join(' | ')
  throw new Error(`All image providers failed. Tried: ${errorSummary}`)
}

/**
 * List available image-gen providers for the API GET endpoint.
 */
export function listProviders() {
  return [
    {
      id: 'pollinations-get',
      name: 'Pollinations.ai (GET)',
      description: 'Free, no API key, returns JPEG. Auto-scales to max ~580x1015.',
      url: 'https://image.pollinations.ai',
    },
    {
      id: 'pollinations-post',
      name: 'Pollinations.ai (POST)',
      description: 'Same provider, POST endpoint. Used as fallback if GET fails.',
      url: 'https://image.pollinations.ai',
    },
    {
      id: 'svg-placeholder',
      name: 'SVG Placeholder',
      description: 'Last-resort local generator. Renders a branded gradient with the prompt text. Always works.',
      url: 'internal',
    },
  ]
}
