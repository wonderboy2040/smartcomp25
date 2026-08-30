import { NextRequest, NextResponse } from 'next/server'
import { listRows, getRow } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'
import QRCode from 'qrcode'
import bwipjs from 'bwip-js'

/**
 * GET /api/barcode-labels
 *
 * v13 UPGRADED: Barcode + QR label generator with multiple sizes.
 *
 * Query params:
 *   - itemId: single item (optional)
 *   - format: 'html' (default) | 'json'
 *   - qty: number of labels (default 10, max 100) — used only with itemId
 *   - NEW size: '65' (Avery L7651, 5 cols × 13 rows, 38×21mm)
 *             | '30' (Avery L7160, 3 cols × 10 rows, 38×21mm taller)
 *             | '24' (Herma 4278, 4 cols × 6 rows, 48×25mm)
 *             | '8'  (A4 multi-purpose, 2 cols × 4 rows, 100×50mm)
 *             default: '65'
 *   - NEW codeType: 'barcode' (default) | 'qr' — render QR code instead of barcode
 *   - NEW showMrp: '1' to display MRP above price (default off)
 *   - NEW customText: free-text printed below price (e.g. "Warranty: 1 yr")
 *   - NEW category: filter by item category
 */

const SIZES: Record<string, { cols: number; rows: number; w: string; h: string; cellW: string; cellH: string; fontSize: string; priceSize: string; barcodeSize: string }> = {
  '65': { cols: 5, rows: 13, w: '38mm', h: '21mm', cellW: '38mm', cellH: '21mm', fontSize: '7px', priceSize: '9px', barcodeSize: '34mm' },
  '30': { cols: 3, rows: 10, w: '63.5mm', h: '38.1mm', cellW: '63.5mm', cellH: '38.1mm', fontSize: '11px', priceSize: '14px', barcodeSize: '50mm' },
  '24': { cols: 4, rows: 6, w: '48mm', h: '25mm', cellW: '48mm', cellH: '25mm', fontSize: '9px', priceSize: '11px', barcodeSize: '40mm' },
  '8':  { cols: 2, rows: 4, w: '100mm', h: '50mm', cellW: '100mm', cellH: '50mm', fontSize: '16px', priceSize: '22px', barcodeSize: '80mm' },
}

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const itemId = url.searchParams.get('itemId')
    const format = (url.searchParams.get('format') || 'html').toLowerCase()
    const qty = Math.min(Math.max(parseInt(url.searchParams.get('qty') || '10'), 1), 100)
    const sizeKey = url.searchParams.get('size') || '65'
    const size = SIZES[sizeKey] || SIZES['65']
    const codeType = (url.searchParams.get('codeType') || 'barcode').toLowerCase()
    const showMrp = url.searchParams.get('showMrp') === '1'
    const customText = url.searchParams.get('customText') || ''
    const categoryFilter = url.searchParams.get('category') || ''

    let items: any[]
    if (itemId) {
      const item = await getRow<any>('Items', String(itemId))
      items = item ? [item] : []
    } else {
      items = await listRows<any>('Items')
      items = items.filter((i) => String(i.barcode || '').trim() || String(i.sku || '').trim())
      if (categoryFilter) {
        items = items.filter((i) => String(i.category || '').toLowerCase() === categoryFilter.toLowerCase())
      }
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'No items with barcode/SKU found' }, { status: 404 })
    }

    const labels: any[] = []
    for (const item of items) {
      const code = String(item.barcode || item.sku || '').trim()
      if (!code) continue
      const count = itemId ? qty : 1
      for (let i = 0; i < count; i++) {
        labels.push({
          name: String(item.name || '').slice(0, sizeKey === '8' ? 60 : 30),
          code,
          price: Number(item.sellingPrice) || 0,
          mrp: Number(item.mrp) || 0,
          sku: String(item.sku || ''),
          customText,
          showMrp,
          qrPayload: `SMRT:${code}:${item.name || ''}:${item.sellingPrice || 0}`,
        })
      }
    }

    if (format === 'json') {
      return NextResponse.json({ labels, count: labels.length, size: sizeKey })
    }

    // Pre-generate QR codes (for qr mode)
    let qrCodeMap: Record<string, string> = {}
    if (codeType === 'qr') {
      const uniquePayloads = Array.from(new Set(labels.map((l) => l.qrPayload)))
      const qrPromises = uniquePayloads.map(async (p) => {
        try {
          const svg = await QRCode.toString(p, { type: 'svg', margin: 0, width: 100, color: { dark: '#000', light: '#fff' } })
          return [p, svg] as [string, string]
        } catch {
          return [p, ''] as [string, string]
        }
      })
      const results = await Promise.all(qrPromises)
      qrCodeMap = Object.fromEntries(results)
    }

    // Pre-generate barcodes (for barcode mode) — real Code 128 via bwip-js
    let barcodeMap: Record<string, string> = {}
    if (codeType !== 'qr') {
      const uniqueCodes = Array.from(new Set(labels.map((l) => l.code)))
      const bcPromises = uniqueCodes.map(async (code) => {
        try {
          // bwip-js toBuffer returns a PNG. We convert to base64 data URL
          // so it embeds directly in <img src="..."> in the printable HTML.
          const png = await bwipjs.toBuffer({
            bcid: 'code128',
            text: code,
            scale: 3,
            height: 10,
            includetext: false,
            paddingwidth: 4,
            paddingheight: 2,
            backgroundcolor: 'FFFFFF',
            foregroundcolor: '000000',
          })
          return [code, `data:image/png;base64,${png.toString('base64')}`] as [string, string]
        } catch (e) {
          // Fallback: empty — cell will render with just the textual code
          console.warn(`[barcode-labels] Failed to generate Code128 for "${code}":`, (e as Error)?.message)
          return [code, ''] as [string, string]
        }
      })
      const results = await Promise.all(bcPromises)
      barcodeMap = Object.fromEntries(results)
    }

    const html = buildLabelHtml(labels, size, sizeKey, codeType, qrCodeMap, barcodeMap, showMrp, customText)
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

function buildLabelHtml(labels: any[], size: typeof SIZES[string], sizeKey: string, codeType: string, qrCodeMap: Record<string, string>, barcodeMap: Record<string, string>, showMrp: boolean, customText: string): string {
  const cells = labels.map((l) => {
    let codeSvg: string
    if (codeType === 'qr') {
      const qr = qrCodeMap[l.qrPayload] || ''
      codeSvg = `<div class="qr-container">${qr}</div>`
    } else {
      // v13 fix: previously the "barcode" was a fake SVG of random-width
      // rectangles derived from charCodeAt % 3 — purely decorative, NOT
      // scannable. Now we render a real Code 128 PNG generated by bwip-js
      // (industry-standard barcode library) which any retail scanner / phone
      // camera can decode.
      const bc = barcodeMap[l.code] || ''
      if (bc) {
        codeSvg = `<img class="barcode-img" src="${bc}" alt="Barcode ${escapeHtml(l.code)}"/>`
      } else {
        // Last-resort fallback: text only (still printable, just not scannable)
        codeSvg = `<div class="barcode-text">${escapeHtml(l.code)}</div>`
      }
    }
    let extraRow = ''
    if (showMrp && l.mrp > 0) {
      extraRow += `<div class="label-mrp">MRP: Rs. ${l.mrp.toFixed(0)}</div>`
    }
    if (customText) {
      extraRow += `<div class="label-custom">${escapeHtml(customText)}</div>`
    }
    return `<div class="label">
      <div class="label-name">${escapeHtml(l.name)}</div>
      ${codeSvg}
      <div class="label-code">${escapeHtml(l.code)}</div>
      <div class="label-price">Rs. ${l.price.toFixed(0)}</div>
      ${extraRow}
    </div>`
  }).join('\n')

  const colsCss = `repeat(${size.cols}, 1fr)`
  const rowsCss = `repeat(${size.rows}, ${size.h})`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Labels — Smart Computers (${sizeKey}/sheet)</title>
<style>
  @page { size: A4; margin: 7mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #ccc; padding: 10px; }
  .toolbar { position: fixed; top: 10px; right: 10px; z-index: 999; background: #1e293b; color: white; padding: 8px 16px; border-radius: 8px; display: flex; gap: 8px; align-items: center; }
  .toolbar button { background: #3b82f6; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; }
  .toolbar button:hover { background: #2563eb; }
  .toolbar .count { font-size: 12px; opacity: 0.8; }
  .sheet { background: white; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 3mm; display: grid; grid-template-columns: ${colsCss}; grid-template-rows: ${rowsCss}; gap: 0; }
  .label { width: ${size.w}; height: ${size.h}; border: 0.5px dashed #ddd; padding: 1mm 2mm; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
  .label-name { font-size: ${size.fontSize}; font-weight: 700; text-align: center; line-height: 1.1; margin-bottom: 1px; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
  .barcode-img { width: ${size.barcodeSize}; max-height: 8mm; image-rendering: pixelated; }
  .barcode-text { font-family: monospace; font-size: ${size.fontSize}; color: #000; }
  .label-code { font-family: monospace; font-size: ${Math.max(parseInt(size.fontSize) - 1, 5)}px; color: #444; margin-top: 1px; }
  .qr-container { width: ${size.barcodeSize}; max-height: 14mm; display: flex; align-items: center; justify-content: center; }
  .qr-container svg { width: 100%; height: auto; }
  .label-price { font-size: ${size.priceSize}; font-weight: 800; color: #dc2626; margin-top: 1px; }
  .label-mrp { font-size: ${Math.max(parseInt(size.fontSize) - 1, 6)}px; color: #666; text-decoration: line-through; margin-top: 1px; }
  .label-custom { font-size: ${Math.max(parseInt(size.fontSize) - 1, 6)}px; color: #444; margin-top: 1px; text-align: center; }
  @media print {
    body { background: white; padding: 0; }
    .toolbar { display: none; }
    .sheet { width: auto; min-height: auto; margin: 0; padding: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <span class="count">${labels.length} labels · ${sizeKey}/sheet · ${codeType === 'qr' ? 'QR' : 'Barcode'}</span>
    <button onclick="window.print()">Print Labels</button>
  </div>
  <div class="sheet">
    ${cells}
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
