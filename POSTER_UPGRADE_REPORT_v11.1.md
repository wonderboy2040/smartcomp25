# AI Poster Generator — ChatGPT-Style Posters, 100% FREE (v11.1)

**Date:** 2026-08-05
**Kya kiya:** Poster section ko upgrade kiya taaki aapke screenshots (ASUS Vivobook 16 promo poster) jaisa **text-to-image poster free me** bane — aur hamesha bane (kabhi fail na ho).

---

## Screenshots me kya tha (OCR se verify kiya)

- **Header:** SMART COMPUTERS + location + 📞 7019771869
- **Product:** ASUS Vivobook 16 — "POWERFUL STYLISH PRODUCTIVE"
- **Badges:** 1 YEAR WARRANTY · Microsoft 365 Basic
- **Specs grid:** Intel Core i5 13th Gen, 16GB DDR4, 512GB SSD, 16" WUXGA, Windows 11 + Office
- **Price:** ~~₹65,500~~ NETT
- **Footer:** ORIGINAL PRODUCTS · TRUSTED SERVICE · BEST PRICES · AFTER SALES SUPPORT + BUY NOW!

## Problem (kya toota tha)

1. **Poster Maker** panel page par **connected hi nahi tha** — sirf AI Poster Generator dikh raha tha.
2. **Pollinations.ai (free AI provider) ab 402 "Insufficient balance" deta hai** — bade images (512px+) ab anonymous free tier par nahi banti. Isliye AI poster generation abhi fail ho rahi thi.
3. Pure text-to-image AI **text garbled likhta hai** (prices, phone, specs galat) — ChatGPT posters aise hi banaye gaye the (paid DALL-E), free AI me ye possible nahi.

## Solution — Hybrid Engine (3 layers, hamesha kaam karega)

```
Layer 1: Hugging Face FLUX.1-schnell (agar HF_TOKEN set ho — FREE token, best 1024px quality)
Layer 2: Pollinations.ai — requested size → phir 256px (current free tier)
Layer 3: SVG product artwork / text placeholder — VECTOR, zero cost, ALWAYS WORKS (1-2s)
```

- **AI product image** → browser/canvas me **perfect text overlay** (price, specs, phone kabhi garbled nahi)
- Agar saare free AI providers busy hon → **smart vector product art** (laptop/desktop/printer/phone/gaming/accessory detection) — poster phir bhi professional banta hai
- 402/429 error milte hi baaki Pollinations attempts **skip** ho jate hain (18-36s → 10s)

## Naye Features

| Feature | Detail |
|---|---|
| **2 tabs:** AI Text→Image + Poster Maker | Naya `PosterHub` panel (page.tsx) |
| **✨ AI Generate Product Image button** | Poster Maker me — Pollinations/HF se product photo, FREE |
| **ChatGPT Pro template** (default) | Screenshot-style: dark header + phone/location, orange/red accents |
| **MRP strikethrough + NETT badge** | `~~₹65,500~~ ₹49,990 [NETT]` — screenshot jaisa |
| **Badges row** | Editable chips: 1 YEAR WARRANTY, MICROSOFT OFFICE... |
| **Load from Stock** | Items sheet se naam/price/specs auto-fill |
| **Footer chips** | ORIGINAL PRODUCTS · TRUSTED SERVICE · BEST PRICES · AFTER SALES SUPPORT + FAST•RELIABLE•AFFORDABLE |
| **Smart fallback timing** | 402/429 detection, per-provider timeouts (10s/25s), kabhi 500 nahi |
| **Correct file extension** | SVG vs PNG vs JPG download me |

## Files changed (this round)

| File | Change |
|---|---|
| `src/components/panels/PosterHub.tsx` | **NEW** — 2-tab wrapper (AI + Maker) |
| `src/components/panels/PosterMaker.tsx` | ChatGPT Pro template, AI generate button, MRP+NETT, badges, load-from-stock, footer chips |
| `src/components/panels/PosterGenerator.tsx` | Correct provider text, mime-aware download |
| `src/app/api/poster/generate/route.ts` | `mode: 'product-image'` (textless hero), shared provider chain, correct mime prefix |
| `src/lib/image-gen.ts` | HF FLUX provider (token), Pollinations 256 fallback, SVG product art (laptop/desktop/printer/phone/gaming/accessory/generic), 402/429 fast-skip, smart timeouts |
| `src/app/page.tsx` | Poster panel → PosterHub |

## Best quality ke liye (optional, FREE)

1. `huggingface.co` par FREE account banao → Settings → Access Tokens → **Read token**
2. Render/vercel env me `HF_TOKEN=...` set karo
3. Ab FLUX.1-schnell **1024px true AI images** milegi (layer 1) — Pollinations ke 256px se kaafi better

Bina token ke bhi sab kaam karta hai — bas layer 2/3 se.
