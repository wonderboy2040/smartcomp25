import { NextRequest, NextResponse } from 'next/server'
import { listRows, getRow } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/barcode-labels?itemId=xxx&format=html
 *   - itemId: single item (optional)
 *   - format: 'html' (default) — returns an HTML page with printable labels
 *   - qty: number of labels to print (default 10, max 100)
 *
 * If no itemId, returns labels for ALL items that have a barcode or SKU.
 *
 * The HTML page uses a 38x21mm label grid (A4 sheet, 65 labels per sheet —
 * standard Avery L7651 / Herma 4407 layout that Indian stationery shops stock).
 * Browser's native print dialog handles the actual printing.
 */

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const itemId = url.searchParams.get('itemId')
    const format = (url.searchParams.get('format') || 'html').toLowerCase()
    const qty = Math.min(Math.max(parseInt(url.searchParams.get('qty') || '10'), 1), 100)

    let items: any[]
    if (itemId) {
      const item = await getRow<any>('Items', String(itemId))
      items = item ? [item] : []
    } else {
      items = await listRows<any>('Items')
      // Only items that have a barcode or SKU
      items = items.filter((i) => String(i.barcode || '').trim() || String(i.sku || '').trim())
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'No items with barcode/SKU found' }, { status: 404 })
    }

    const labels: any[] = []
    for (const item of items) {
      const code = String(item.barcode || item.sku || '').trim()
      if (!code) continue
      const count = itemId ? qty : 1 // single item = qty labels; all items = 1 each
      for (let i = 0; i < count; i++) {
        labels.push({
          name: String(item.name || '').slice(0, 30),
          code,
          price: Number(item.sellingPrice) || 0,
          sku: String(item.sku || ''),
        })
      }
    }

    if (format === 'json') {
      return NextResponse.json({ labels, count: labels.length })
    }

    // HTML format — printable label sheet
    const html = buildLabelHtml(labels)
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

function buildLabelHtml(labels: any[]): string {
  const cells = labels.map((l) => {
    const barcodeSvg = `<svg class="barcode-svg" viewBox="0 0 120 30" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="120" height="30" fill="white"/>
      ${generateBarcodeLines(l.code)}
      <text x="60" y="28" font-family="monospace" font-size="6" text-anchor="middle" fill="black">${escapeHtml(l.code)}</text>
    </svg>`
    return `<div class="label">
      <div class="label-name">${escapeHtml(l.name)}</div>
      ${barcodeSvg}
      <div class="label-price">Rs. ${l.price.toFixed(0)}</div>
    </div>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Barcode Labels — Smart Computers</title>
<style>
  @page { size: A4; margin: 7mm 7mm 7mm 7mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #ccc; padding: 10px; }
  .toolbar { position: fixed; top: 10px; right: 10px; z-index: 999; background: #1e293b; color: white; padding: 8px 16px; border-radius: 8px; display: flex; gap: 8px; align-items: center; }
  .toolbar button { background: #3b82f6; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; }
  .toolbar button:hover { background: #2563eb; }
  .toolbar .count { font-size: 12px; opacity: 0.8; }
  .sheet { background: white; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 3mm; display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: 21mm; gap: 0; }
  .label { width: 38mm; height: 21mm; border: 0.5px dashed #ddd; padding: 1mm 2mm; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
  .label-name { font-size: 7px; font-weight: 700; text-align: center; line-height: 1.1; margin-bottom: 1px; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
  .barcode-svg { width: 34mm; height: 8mm; }
  .label-price { font-size: 9px; font-weight: 800; color: #dc2626; margin-top: 1px; }
  @media print {
    body { background: white; padding: 0; }
    .toolbar { display: none; }
    .sheet { width: auto; min-height: auto; margin: 0; padding: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <span class="count">${labels.length} labels</span>
    <button onclick="window.print()">Print Labels</button>
  </div>
  <div class="sheet">
    ${cells}
  </div>
</body>
</html>`
}

function generateBarcodeLines(code: string): string {
  // Simple visual barcode — renders vertical lines based on character codes.
  // This is NOT a scannable barcode (that needs a real library like JsBarcode),
  // but it gives a barcode-like visual on the printed label. The code text
  // below the lines is what the user reads; the scanner reads the barcode field.
  let lines = ''
  for (let i = 0; i < code.length; i++) {
    const charCode = code.charCodeAt(i)
    const w = (charCode % 3) + 1 // 1-3 px wide
    const x = i * 9
    lines += `<rect x="${x}" y="0" width="${w}" height="22" fill="black"/>`
  }
  return lines
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
