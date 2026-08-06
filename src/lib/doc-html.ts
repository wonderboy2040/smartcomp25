/**
 * ULTRA-FAST HTML-based Invoice / Quotation / Service-Invoice generator.
 *
 * Why HTML instead of PDF?
 * ──────────────────────
 * The previous pipeline built a server-side PDF via jsPDF for every click:
 *   fetch sheet rows → read 8MB of base64 PNGs → jsPDF layout →
 *   jspdf-autotable → QR code → embed images → serialize PDF →
 *   iframe + browser PDF viewer
 * That took 3–10 seconds per preview and made the panel feel laggy.
 *
 * This module returns a tiny, self-contained HTML document (<50KB without
 * images, ~80KB with) that the iframe renders in <50ms. Browser-native
 * print (Ctrl+P / "Save as PDF") produces a pixel-perfect A4 page using
 * `@page { size: A4; margin: 12mm }` + `@media print` rules.
 *
 * Templates share the same color tokens as the PDF generator so the two
 * outputs look identical.
 */

import QRCode from 'qrcode'
import {
  formatCurrency,
  numberToWords,
} from './calc'
import type { PdfDocData, ShopInfo } from './pdf'
import { BUSINESS_GROWTH } from './business-growth'

// ──────────────────────────────────────────────────────────────────────
// Template palette (kept in sync with PDF_TEMPLATES in pdf.ts)
// ──────────────────────────────────────────────────────────────────────

interface HtmlTemplate {
  id: string
  name: string
  headerBg: string
  headerText: string
  accent: string
  tableHead: string
  tableHeadText: string
  lightBg: string
  bandBg: string
}

const TPL: Record<string, HtmlTemplate> = {
  'tally-classic': {
    id: 'tally-classic',
    name: 'Tally Prime Premium',
    headerBg: '#ffffff',
    headerText: '#1e3a8a',
    accent: '#1e3a8a',
    tableHead: '#1e3a8a',
    tableHeadText: '#ffffff',
    lightBg: '#eff6ff',
    bandBg: '#f8fafc',
  },
  'tally-modern': {
    id: 'tally-modern',
    name: 'Modern Minimal GST',
    headerBg: '#f8fafc',
    headerText: '#0f172a',
    accent: '#10b981',
    tableHead: '#0f172a',
    tableHeadText: '#ffffff',
    lightBg: '#ecfdf5',
    bandBg: '#f8fafc',
  },
  'tally-corporate': {
    id: 'tally-corporate',
    name: 'Corporate Elite Pro',
    headerBg: '#0f172a',
    headerText: '#ffffff',
    accent: '#ca8a04',
    tableHead: '#0f172a',
    tableHeadText: '#ffffff',
    lightBg: '#fef3c7',
    bandBg: '#f8fafc',
  },
  'tally-elegant': {
    id: 'tally-elegant',
    name: 'Royal Executive Gold',
    headerBg: '#7f1d1d',
    headerText: '#ffffff',
    accent: '#fbbf24',
    tableHead: '#7f1d1d',
    tableHeadText: '#ffffff',
    lightBg: '#fef9c3',
    bandBg: '#fef9c3',
  },
  'tally-bold': {
    id: 'tally-bold',
    name: 'Tech Store Pro',
    headerBg: '#134e4a',
    headerText: '#ffffff',
    accent: '#f97316',
    tableHead: '#134e4a',
    tableHeadText: '#ffffff',
    lightBg: '#ffedd5',
    bandBg: '#f8fafc',
  },
  'gst-premium-dark': {
    id: 'gst-premium-dark',
    name: 'Premium Dark Elite',
    headerBg: '#000000',
    headerText: '#ffd700',
    accent: '#ffd700',
    tableHead: '#000000',
    tableHeadText: '#ffd700',
    lightBg: '#fefce8',
    bandBg: '#f8fafc',
  },
  'gst-classic-plus': {
    id: 'gst-classic-plus',
    name: 'GST Classic Plus',
    headerBg: '#ffffff',
    headerText: '#111827',
    accent: '#3b82f6',
    tableHead: '#2563eb',
    tableHeadText: '#ffffff',
    lightBg: '#eff6ff',
    bandBg: '#f8fafc',
  },
  'gst-executive-formal': {
    id: 'gst-executive-formal',
    name: 'Executive Formal',
    headerBg: '#f1f5f9',
    headerText: '#1e293b',
    accent: '#334155',
    tableHead: '#334155',
    tableHeadText: '#ffffff',
    lightBg: '#f8fafc',
    bandBg: '#f8fafc',
  },
  'gst-vibrant-bold': {
    id: 'gst-vibrant-bold',
    name: 'Vibrant Bold Offer',
    headerBg: '#7c2d12',
    headerText: '#ffffff',
    accent: '#fb923c',
    tableHead: '#7c2d12',
    tableHeadText: '#ffffff',
    lightBg: '#ffedd5',
    bandBg: '#f8fafc',
  },
  'gst-minimal-white': {
    id: 'gst-minimal-white',
    name: 'Minimal White Pro',
    headerBg: '#ffffff',
    headerText: '#0f172a',
    accent: '#0ea5e9',
    tableHead: '#ffffff',
    tableHeadText: '#0f172a',
    lightBg: '#f0f9ff',
    bandBg: '#f8fafc',
  },
}

function getTemplate(id?: string): HtmlTemplate {
  return TPL[id || 'tally-classic'] || TPL['tally-classic']
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function escapeHtml(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'dadra and nagar haveli and daman and diu': '26',
  maharashtra: '27',
  'andhra pradesh': '28',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh (new)': '37',
  ladakh: '38',
}

function getStateCode(state?: string): string {
  if (!state) return ''
  return STATE_CODES[state.toLowerCase().trim()] || ''
}

interface HsnRow {
  hsn: string
  taxable: number
  cgstRate: number
  cgstAmt: number
  sgstRate: number
  sgstAmt: number
  igstRate: number
  igstAmt: number
  total: number
}

function calculateHSNSummary(items: any[]): HsnRow[] {
  const map = new Map<string, HsnRow>()
  for (const item of items) {
    const hsn = item.hsnCode || 'N/A'
    const key = `${hsn}|${item.gstRate || 0}`
    if (!map.has(key)) {
      map.set(key, {
        hsn,
        taxable: 0,
        cgstRate: (Number(item.gstRate) || 0) / 2,
        cgstAmt: 0,
        sgstRate: (Number(item.gstRate) || 0) / 2,
        sgstAmt: 0,
        igstRate: Number(item.gstRate) || 0,
        igstAmt: 0,
        total: 0,
      })
    }
    const entry = map.get(key)!
    const gstAmt = Number(item.gstAmount) || 0
    entry.taxable += Number(item.amount) || 0
    entry.cgstAmt += gstAmt / 2
    entry.sgstAmt += gstAmt / 2
    entry.igstAmt += gstAmt
    entry.total += (Number(item.amount) || 0) + gstAmt
  }
  return Array.from(map.values())
}

// ──────────────────────────────────────────────────────────────────────
// Main HTML generator
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate a self-contained HTML invoice/quotation.
 *
 * `docId` is the row ID used to build the "Download PDF" / "Open PDF" links
 * in the toolbar. It is safe to pass empty string if you don't need those.
 */
export async function generateInvoiceHtml(
  data: PdfDocData,
  docId: string = '',
): Promise<string> {
  ;(data as any).docId = docId
  const tpl = getTemplate(data.templateId)
  const isInvoice = data.docType === 'invoice'
  const isService = data.docType === 'service'
  const isNonGst = data.gstMode === 'non-gst'

  const docTitle = isNonGst
    ? (isService ? 'RETAIL BILL' : 'RETAIL INVOICE')
    : isInvoice
      ? 'TAX INVOICE'
      : isService
        ? 'SERVICE INVOICE'
        : 'QUOTATION'

  const shopState = (data.shop.state || '').toLowerCase()
  const custState = (data.customer.state || '').toLowerCase()
  const sameState = !shopState || !custState || shopState === custState

  // Build items table rows
  // For non-GST invoices AND service invoices, hide HSN, Taxable, GST columns
  // (service invoices are labour-only and don't show tax breakdown per user request).
  const itemsRows = (isNonGst || isService)
    ? data.calc.items
        .map(
          (item, i) => `
        <tr class="item-row">
          <td class="num">${i + 1}</td>
          <td class="name">
            <div class="iname">${escapeHtml(item.name)}${item.sku ? ` <span style="font-size:8px;color:#94a3b8;">SKU: ${escapeHtml(item.sku)}</span>` : ''}</div>
            ${(item as any).description ? `<div style="font-size:9px;color:#475569;margin-top:2px;">${escapeHtml((item as any).description)}</div>` : ''}
            ${(item as any).specification ? `<div style="font-size:9px;color:#1e40af;margin-top:1px;font-style:italic;">Spec: ${escapeHtml((item as any).specification)}</div>` : ''}
          </td>
          <td class="center">${item.quantity}</td>
          <td class="right">${formatCurrency(item.rate).replace('Rs. ', '')}</td>
          <td class="right bold">${formatCurrency(item.amount).replace('Rs. ', '')}</td>
        </tr>`,
        )
        .join('')
    : data.calc.items
        .map(
          (item, i) => `
        <tr class="item-row">
          <td class="num">${i + 1}</td>
          <td class="name">
            <div class="iname">${escapeHtml(item.name)}${item.sku ? ` <span style="font-size:8px;color:#94a3b8;">SKU: ${escapeHtml(item.sku)}</span>` : ''}</div>
            ${(item as any).description ? `<div style="font-size:9px;color:#475569;margin-top:2px;">${escapeHtml((item as any).description)}</div>` : ''}
            ${(item as any).specification ? `<div style="font-size:9px;color:#1e40af;margin-top:1px;font-style:italic;">Spec: ${escapeHtml((item as any).specification)}</div>` : ''}
          </td>
          <td class="center">${escapeHtml(item.hsnCode || '-')}</td>
          <td class="center">${item.quantity}</td>
          <td class="right">${formatCurrency(item.rate).replace('Rs. ', '')}</td>
          <td class="right">${formatCurrency(item.amount).replace('Rs. ', '')}</td>
          <td class="right">${item.gstApplicable ? formatCurrency(item.gstAmount).replace('Rs. ', '') + (item.gstRate ? ` (${item.gstRate}%)` : '') : '-'}</td>
          <td class="right bold">${formatCurrency(item.total).replace('Rs. ', '')}</td>
        </tr>`,
        )
        .join('')

  // HSN summary (only if 2-6 distinct HSN codes AND GST mode AND NOT a service invoice).
  // Service invoices intentionally omit GST details per user request — they
  // are labour-only repair documents without HSN classification.
  const hsnSummary = (isNonGst || isService) ? [] : calculateHSNSummary(data.calc.items)
  const hsnBlock =
    !isNonGst && !isService && hsnSummary.length > 1 && hsnSummary.length <= 6
      ? `
      <div class="hsn-block">
        <h3>HSN/SAC GST SUMMARY</h3>
        <table class="hsn-table">
          <thead>
            <tr>
              <th>HSN/SAC</th>
              <th>Taxable (Rs.)</th>
              <th>CGST Rate</th>
              <th>CGST Amt (Rs.)</th>
              <th>SGST Rate</th>
              <th>SGST Amt (Rs.)</th>
              <th>Total Tax (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            ${hsnSummary
              .map(
                (h) => `
              <tr>
                <td class="center">${escapeHtml(h.hsn)}</td>
                <td class="right">${formatCurrency(h.taxable).replace('Rs. ', '')}</td>
                <td class="center">${h.cgstRate}%</td>
                <td class="right">${formatCurrency(h.cgstAmt).replace('Rs. ', '')}</td>
                <td class="center">${h.sgstRate}%</td>
                <td class="right">${formatCurrency(h.sgstAmt).replace('Rs. ', '')}</td>
                <td class="right bold">${formatCurrency(h.total).replace('Rs. ', '')}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`
      : ''

  // Totals rows
  const shopStateCode = getStateCode(data.shop.state)
  const custStateCode = getStateCode(data.customer.state)

  const totalsRows: string[] = []
  totalsRows.push(
    `<tr><td>Sub Total</td><td class="right">${formatCurrency(data.calc.subtotal)}</td></tr>`,
  )
  if (data.calc.discount > 0) {
    totalsRows.push(
      `<tr class="discount"><td>Discount</td><td class="right">- ${formatCurrency(data.calc.discount)}</td></tr>`,
    )
  }
  // Skip GST breakdown rows for non-GST mode AND for service invoices (per
  // user request — service invoices are labour-only and don't show tax split)
  if (!isNonGst && !isService && data.calc.gstAmount > 0) {
    if (sameState) {
      const rate = (data.calc.items[0]?.gstRate || 18) / 2
      totalsRows.push(
        `<tr><td>CGST (${rate}%)</td><td class="right">${formatCurrency(data.calc.cgstAmount)}</td></tr>`,
      )
      totalsRows.push(
        `<tr><td>SGST (${rate}%)</td><td class="right">${formatCurrency(data.calc.sgstAmount)}</td></tr>`,
      )
    } else {
      const rate = data.calc.items[0]?.gstRate || 18
      totalsRows.push(
        `<tr><td>IGST (${rate}%)</td><td class="right">${formatCurrency(data.calc.gstAmount)}</td></tr>`,
      )
    }
  }
  if (data.calc.courierCharges > 0) {
    totalsRows.push(
      `<tr><td>Courier</td><td class="right">${formatCurrency(data.calc.courierCharges)}</td></tr>`,
    )
  }
  if (data.calc.otherCharges > 0) {
    totalsRows.push(
      `<tr><td>Other Charges</td><td class="right">${formatCurrency(data.calc.otherCharges)}</td></tr>`,
    )
  }
  if (data.roundOff) {
    totalsRows.push(
      `<tr><td>Round Off</td><td class="right">${formatCurrency(data.roundOff)}</td></tr>`,
    )
  }
  totalsRows.push(
    `<tr class="grand-total"><td>GRAND TOTAL</td><td class="right">${formatCurrency(data.calc.grandTotal)}</td></tr>`,
  )
  if ((isInvoice || isService) && data.amountPaid !== undefined && data.amountPaid > 0) {
    totalsRows.push(
      `<tr class="paid"><td>Paid</td><td class="right">${formatCurrency(data.amountPaid)}</td></tr>`,
    )
  }
  if ((isInvoice || isService) && data.amountDue !== undefined && data.amountDue > 0) {
    totalsRows.push(
      `<tr class="due"><td>Balance Due</td><td class="right">${formatCurrency(data.amountDue)}</td></tr>`,
    )
  } else if (
    (isInvoice || isService) &&
    data.amountDue === 0 &&
    (data.amountPaid || 0) > 0
  ) {
    totalsRows.push(
      `<tr class="status-paid"><td>Status</td><td class="right">PAID &#10003;</td></tr>`,
    )
  }

  // UPI QR code (server-side via qrcode lib).
  // For regular invoices: only show when unpaid (uses amountDue = balance to pay).
  // For service invoices: ALWAYS show, using grandTotal (the total amount of the
  // service job — the customer can pay any portion via UPI and the shop tracks
  // the rest manually). Per user request "Invoice ka Total Amount ka QR Add karo".
  let qrImg = ''
  const isPaidDoc = (isInvoice || isService) && ((Number(data.amountDue) || 0) <= 0 || data.paymentStatus === 'paid')
  if (data.shop.upiId) {
    // Service invoices always get a QR for grandTotal; regular invoices only
    // when there's an unpaid balance (uses amountDue).
    const qrAmount = isService
      ? Number(data.calc.grandTotal) || 0
      : (isInvoice ? Number(data.amountDue) || 0 : data.calc.grandTotal)
    // For regular invoices, skip QR when paid. For service invoices, always show.
    if (qrAmount > 0 && (isService || !isPaidDoc)) {
      try {
        const upiLink = `upi://pay?pa=${encodeURIComponent(data.shop.upiId)}&pn=${encodeURIComponent(data.shop.name || 'Shop')}&am=${qrAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(data.number || '')}`
        qrImg = await QRCode.toDataURL(upiLink, { width: 120, margin: 1 })
      } catch {
        qrImg = ''
      }
    }
  }

  // Ad banner variant — uses STATIC image URLs (no base64 bloat)
  // Browser caches these once and they are reused across all invoices.
  const adVariant = data.adBannerVariant || 'flyer'
  const adBanner = buildAdBanner(adVariant, data.shop, tpl, data.productImages)

  // Right-side "ship to / payment" box content
  const rightBoxContent = isInvoice || isService
    ? buildPaymentBox(data, isService)
    : buildQuotationBox(data)

  // Bank details block
  const bankBlock =
    data.shop.bankName || data.shop.bankAccount
      ? `
      <div class="info-block">
        <h4>BANK DETAILS</h4>
        ${data.shop.bankName ? `<div><span>Bank:</span> ${escapeHtml(data.shop.bankName)}${data.shop.bankBranch ? `, ${escapeHtml(data.shop.bankBranch)}` : ''}</div>` : ''}
        ${data.shop.bankAccount ? `<div><span>A/c:</span> ${escapeHtml(data.shop.bankAccount)}${data.shop.bankIfsc ? ` <span class="sep">|</span> IFSC: ${escapeHtml(data.shop.bankIfsc)}` : ''}</div>` : ''}
      </div>`
      : ''

  // Terms / notes block
  const termsText = data.terms
    ? data.notes
      ? `${data.terms}\n${data.notes}`
      : data.terms
    : data.notes || ''
  const termsBlock = termsText
    ? `
      <div class="info-block">
        <h4>${data.terms && data.notes ? 'TERMS &amp; NOTES' : data.terms ? 'TERMS &amp; CONDITIONS' : 'NOTES'}</h4>
        <div class="terms-text">${escapeHtml(termsText).replace(/\n/g, '<br>')}</div>
      </div>`
    : `<div class="info-block"><h4>Thank You</h4><div>Thank you for your business!<br>Warranty as per manufacturer.</div></div>`

  // QR block
  // Display amount: for service invoices → grandTotal; for regular invoices →
  // amountDue (balance to pay); for quotations → grandTotal.
  const qrDisplayAmount = isService
    ? Number(data.calc.grandTotal) || 0
    : (isInvoice ? Number(data.amountDue) || 0 : data.calc.grandTotal)
  const qrBlock = qrImg
    ? `
      <div class="info-block qr-block">
        <h4>SCAN &amp; PAY</h4>
        <div class="qr-row">
          <img src="${qrImg}" alt="UPI QR" class="qr-img" />
          <div class="qr-text">
            <div class="qr-amt">Rs. ${qrDisplayAmount.toFixed(2)}</div>
            <div class="qr-upi">${escapeHtml(data.shop.upiId || '')}</div>
            <div class="qr-via">via UPI</div>
          </div>
        </div>
      </div>`
    : ''

  const amountInWords = `${numberToWords(data.calc.grandTotal)} Only`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(docTitle)} ${escapeHtml(data.number)}</title>
<style>
  /* ===================== A4 PRINT LAYOUT ===================== */
  @page {
    size: A4 portrait;
    margin: 6mm 8mm;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { display: flex; flex-direction: column; align-items: center; padding: 10px; gap: 8px; }

  /* ===== On-screen toolbar (hidden when printing) ===== */
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    width: 210mm;
    max-width: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    background: #0f172a;
    color: #fff;
    padding: 10px 14px;
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(15,23,42,0.18);
    font-size: 13px;
  }
  .toolbar .title { font-weight: 700; letter-spacing: 0.02em; }
  .toolbar .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .toolbar button, .toolbar a {
    background: #1e293b;
    color: #fff;
    border: 1px solid #334155;
    padding: 7px 14px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s;
  }
  .toolbar button:hover, .toolbar a:hover { background: #334155; }
  .toolbar button.primary { background: #4f46e5; border-color: #4f46e5; }
  .toolbar button.primary:hover { background: #6366f1; }

  /* ===== A4 sheet ===== */
  .sheet {
    width: 210mm;
    min-height: 275mm;
    max-width: 100%;
    background: #ffffff;
    padding: 8mm 10mm;
    box-shadow: 0 8px 28px rgba(15,23,42,0.18);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  /* ===== Header ===== */
  .header {
    background: ${tpl.headerBg};
    color: ${tpl.headerText};
    padding: 10px 14px;
    border-radius: 5px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    border-bottom: 3px solid ${tpl.accent};
    margin: -4px -6px 8px -6px;
  }
  .header .shop-block { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; }
  .header .shop-logo {
    width: 72px;
    height: 72px;
    object-fit: contain;
    border-radius: 6px;
    flex-shrink: 0;
  }
  .header .shop-text { flex: 1; min-width: 0; }
  .header .shop-name {
    font-size: 19px;
    font-weight: 800;
    margin: 0 0 3px 0;
    line-height: 1.15;
    word-break: break-word;
  }
  .header .shop-info {
    font-size: 10.5px;
    line-height: 1.45;
    opacity: 0.9;
  }
  .header .shop-info .gst { font-weight: 700; }
  .header .doc-meta {
    text-align: right;
    flex-shrink: 0;
    max-width: 45%;
  }
  .header .doc-title {
    font-size: 18px;
    font-weight: 800;
    color: ${tpl.accent};
    margin: 0 0 4px 0;
    letter-spacing: 0.04em;
  }
  .header .doc-meta .meta-line {
    font-size: 10.5px;
    line-height: 1.5;
    color: ${tpl.headerBg === '#ffffff' ? '#475569' : 'rgba(255,255,255,0.85)'};
  }
  .header .doc-meta .meta-line.bold { font-weight: 700; color: ${tpl.headerText}; }
  .header .doc-meta .badge {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 8px;
    border: 1px solid ${tpl.accent};
    color: ${tpl.accent};
    font-size: 8.5px;
    font-weight: 700;
    border-radius: 3px;
    letter-spacing: 0.06em;
  }

  /* ===== Bill-to / Ship-to ===== */
  .bill-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 6px;
  }
  .bill-box {
    background: ${tpl.lightBg};
    border: 0.5px solid ${tpl.accent}33;
    border-radius: 5px;
    padding: 6px 8px;
    min-height: 62px;
  }
  .bill-box h3 {
    margin: 0 0 6px 0;
    font-size: 9px;
    color: ${tpl.accent};
    letter-spacing: 0.08em;
    font-weight: 800;
    border-bottom: 1.2px solid ${tpl.accent};
    padding-bottom: 3px;
  }
  .bill-box .cname { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 3px; word-break: break-word; }
  .bill-box .cline { font-size: 10px; color: #475569; line-height: 1.5; }
  .bill-box .cline.gst { font-weight: 700; color: #0f172a; font-size: 9.5px; }

  /* ===== Items table ===== */
  .items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
    margin-bottom: 6px;
  }
  .items-table thead th {
    background: ${tpl.tableHead};
    color: ${tpl.tableHeadText};
    padding: 5px 4px;
    font-size: 9.5px;
    font-weight: 700;
    text-align: center;
    border: 0.3px solid ${tpl.tableHead}55;
  }
  .items-table thead th.left { text-align: left; }
  .items-table thead th.right { text-align: right; }
  .items-table tbody td {
    padding: 4px 4px;
    border: 0.3px solid #e2e8f0;
    vertical-align: middle;
    color: #0f172a;
  }
  .items-table tbody td.num { text-align: center; width: 5%; color: #64748b; font-size: 9.5px; }
  .items-table tbody td.name { text-align: left; width: auto; }
  .items-table tbody td.name .iname { font-weight: 600; }
  .items-table tbody td.name .isku { font-size: 8.5px; color: #94a3b8; margin-top: 1px; }
  .items-table tbody td.center { text-align: center; width: 8%; }
  .items-table tbody td.right { text-align: right; width: 14%; }
  .items-table tbody td.bold { font-weight: 700; }
  .items-table tbody tr:nth-child(even) { background: #f8fafc; }
  .items-table tbody tr.item-row:hover { background: #f1f5f9; }

  /* ===== HSN summary ===== */
  .hsn-block { margin-top: 8px; }
  .hsn-block h3 {
    font-size: 9px;
    color: ${tpl.accent};
    margin: 0 0 4px 0;
    letter-spacing: 0.08em;
    font-weight: 800;
  }
  .hsn-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5px;
    margin-bottom: 6px;
  }
  .hsn-table th {
    background: #f1f5f9;
    color: #0f172a;
    padding: 5px 4px;
    font-weight: 700;
    text-align: center;
    border: 0.3px solid #cbd5e1;
    font-size: 9px;
  }
  .hsn-table td {
    padding: 4px;
    border: 0.3px solid #e2e8f0;
    text-align: center;
  }
  .hsn-table td.right { text-align: right; }
  .hsn-table td.bold { font-weight: 700; }

  /* ===== Bottom split: words + totals ===== */
  .bottom-split {
    display: grid;
    grid-template-columns: 1fr 38%;
    gap: 10px;
    margin-top: 6px;
    align-items: start;
  }
  .words-block .label {
    font-size: 8px;
    color: #94a3b8;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin-bottom: 2px;
  }
  .words-block .text {
    font-size: 11px;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.35;
  }
  .totals-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
    border: 0.5px solid #cbd5e1;
  }
  .totals-table td {
    padding: 4px 6px;
    border-bottom: 0.3px solid #e2e8f0;
    color: #475569;
  }
  .totals-table td.right { text-align: right; font-weight: 600; color: #0f172a; }
  .totals-table tr.discount td { color: #dc2626; }
  .totals-table tr.discount td.right { color: #dc2626; }
  .totals-table tr.grand-total td {
    background: ${tpl.accent};
    color: ${tpl.headerBg === '#ffffff' && tpl.accent === '#ffffff' ? '#0f172a' : '#ffffff'};
    font-size: 12px;
    font-weight: 800;
    padding: 6px 8px;
    border-bottom: none;
  }
  .totals-table tr.paid td { color: #16a34a; font-weight: 700; }
  .totals-table tr.paid td.right { color: #16a34a; }
  .totals-table tr.due td { background: #fef2f2; color: #dc2626; font-weight: 700; }
  .totals-table tr.due td.right { color: #dc2626; }
  .totals-table tr.status-paid td { background: #ecfdf5; color: #16a34a; font-weight: 700; }
  .totals-table tr.status-paid td.right { color: #16a34a; }

  /* ===== Bottom info row: bank / QR / terms ===== */
  .info-row {
    display: grid;
    grid-template-columns: ${qrBlock ? '1fr 1fr 1fr' : '1fr 1fr'};
    gap: 8px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 0.5px solid #e2e8f0;
  }
  .info-block h4 {
    margin: 0 0 3px 0;
    font-size: 8px;
    color: ${tpl.accent};
    letter-spacing: 0.08em;
    font-weight: 800;
  }
  .info-block div {
    font-size: 8.5px;
    color: #475569;
    line-height: 1.45;
  }
  .info-block div span { color: #94a3b8; }
  .info-block div .sep { margin: 0 3px; color: #cbd5e1; }
  .info-block .terms-text { font-size: 8.5px; color: #64748b; line-height: 1.4; }
  .qr-block .qr-row { display: flex; gap: 6px; align-items: center; }
  .qr-block .qr-img { width: 56px; height: 56px; }
  .qr-block .qr-text { font-size: 8.5px; line-height: 1.35; }
  .qr-block .qr-amt { font-size: 11px; font-weight: 700; color: #0f172a; }
  .qr-block .qr-upi { font-size: 8.5px; color: #475569; word-break: break-all; }
  .qr-block .qr-via { font-size: 8px; color: #94a3b8; }

  /* ===== Signature ===== */
  .signature {
    margin-top: 10px;
    display: flex;
    justify-content: flex-end;
  }
  .signature .sig {
    text-align: center;
    width: 180px;
  }
  .signature .sig-line {
    border-top: 1px solid #94a3b8;
    padding-top: 3px;
  }
  .signature .sig-for { font-size: 9.5px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
  .signature .sig-auth { font-size: 8.5px; color: #94a3b8; }

  /* ===== Ad banner ===== */
  .ad-banner {
    margin-top: auto;
    margin-bottom: 6px;
    background: ${tpl.bandBg};
    border: 1px solid ${tpl.accent}55;
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 50px;
  }
  .ad-banner.poster-banner {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
    margin-top: auto;
    margin-bottom: 4px;
  }
  .ad-banner img.ad-img {
    width: auto;
    height: 50px;
    border-radius: 4px;
    object-fit: contain;
  }
  .ad-banner .ad-text { flex: 1; }
  .ad-banner .ad-headline {
    font-size: 11px;
    font-weight: 800;
    color: ${tpl.accent};
    letter-spacing: 0.04em;
    margin-bottom: 2px;
  }
  .ad-banner .ad-sub {
    font-size: 9px;
    color: #475569;
    line-height: 1.4;
  }
  .ad-banner.grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .ad-banner.grid-4 .ad-tile {
    text-align: center;
  }
  .ad-banner.grid-4 .ad-tile img {
    width: 100%;
    height: 44px;
    object-fit: contain;
    border-radius: 4px;
    margin-bottom: 2px;
  }
  .ad-banner.grid-4 .ad-tile .ad-tile-label {
    font-size: 8.5px;
    font-weight: 700;
    color: #0f172a;
  }
  .ad-banner.featured {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 10px;
  }
  .ad-banner.featured .ad-left .ad-headline { font-size: 14px; margin-top: 4px; }
  .ad-banner.featured .ad-right {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .ad-banner.featured .ad-right .ad-tile img {
    width: 100%;
    height: 40px;
    object-fit: contain;
    border-radius: 3px;
  }
  .ad-banner.featured .ad-right .ad-tile .ad-tile-label {
    font-size: 8px;
    font-weight: 700;
    text-align: center;
    margin-top: 2px;
  }

  /* ===== Footer ===== */
  .footer {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 0.5px solid #cbd5e1;
    text-align: center;
    font-size: 8px;
    color: #94a3b8;
    line-height: 1.4;
  }

  /* ===== Print rules — perfect A4 single-page fit ===== */
  @page {
    size: A4 portrait;
    margin: 6mm;
  }
  @media print {
    html, body {
      background: #ffffff !important;
      padding: 0 !important;
      margin: 0 !important;
      gap: 0 !important;
      width: 100% !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .toolbar { display: none !important; }
    .sheet {
      width: 198mm !important;
      max-width: 198mm !important;
      min-height: auto !important;
      box-shadow: none !important;
      border: none !important;
      border-radius: 0 !important;
      padding: 4mm 5mm !important;
      margin: 0 !important;
      /* Scale down slightly to ensure single-page fit on most content lengths */
      font-size: 9.5px !important;
    }
    .header {
      margin: -4mm -5mm 6px -5mm !important;
      padding: 6px 10px !important;
      border-radius: 0 !important;
    }
    .header .shop-logo {
      width: 52px !important;
      height: 52px !important;
    }
    .header .shop-name { font-size: 16px !important; margin-bottom: 2px !important; }
    .header .shop-info { font-size: 9px !important; line-height: 1.35 !important; }
    .header .doc-title { font-size: 15px !important; margin-bottom: 3px !important; }
    .header .doc-meta .meta-line { font-size: 9px !important; line-height: 1.4 !important; }
    .header .doc-meta .badge { font-size: 7.5px !important; padding: 1.5px 6px !important; margin-top: 3px !important; }

    .bill-section { gap: 5px !important; margin-bottom: 4px !important; }
    .bill-box { padding: 5px 7px !important; min-height: 50px !important; }
    .bill-box h3 { font-size: 8px !important; margin-bottom: 4px !important; padding-bottom: 2px !important; }
    .bill-box .cname { font-size: 12px !important; margin-bottom: 2px !important; }
    .bill-box .cline { font-size: 9px !important; line-height: 1.4 !important; }

    .items-table { font-size: 9px !important; margin-bottom: 4px !important; }
    .items-table thead th { padding: 4px 3px !important; font-size: 8.5px !important; }
    .items-table tbody td { padding: 3px 3px !important; }
    .items-table tbody td.num { font-size: 8.5px !important; }
    .items-table tbody td.name .iname { font-weight: 600 !important; }

    .hsn-block { margin-top: 4px !important; }
    .hsn-block h3 { font-size: 8px !important; margin-bottom: 3px !important; }
    .hsn-table { font-size: 8.5px !important; margin-bottom: 4px !important; }
    .hsn-table th { padding: 3px 3px !important; font-size: 8px !important; }
    .hsn-table td { padding: 3px !important; }

    .bottom-split { gap: 6px !important; margin-top: 4px !important; }
    .words-block .label { font-size: 7px !important; margin-bottom: 1px !important; }
    .words-block .text { font-size: 9.5px !important; line-height: 1.3 !important; }
    .totals-table { font-size: 9px !important; }
    .totals-table td { padding: 3px 5px !important; }
    .totals-table tr.grand-total td { font-size: 11px !important; padding: 4px 6px !important; }

    .info-row { gap: 6px !important; margin-top: 4px !important; padding-top: 4px !important; }
    .info-block h4 { font-size: 7.5px !important; margin-bottom: 2px !important; }
    .info-block div { font-size: 8px !important; line-height: 1.35 !important; }
    .info-block .terms-text { font-size: 8px !important; line-height: 1.35 !important; }
    .qr-block .qr-img { width: 48px !important; height: 48px !important; }
    .qr-block .qr-amt { font-size: 10px !important; }
    .qr-block .qr-text { font-size: 8px !important; }

    .signature { margin-top: 6px !important; }
    .signature .sig { width: 160px !important; }
    .signature .sig-line { padding-top: 2px !important; }
    .signature .sig-for { font-size: 9px !important; margin-bottom: 1px !important; }
    .signature .sig-auth { font-size: 8px !important; }

    .ad-banner { padding: 5px 8px !important; min-height: 40px !important; margin-bottom: 4px !important; }
    .ad-banner img.ad-img { height: 40px !important; }
    .ad-banner .ad-headline { font-size: 10px !important; margin-bottom: 1px !important; }
    .ad-banner .ad-sub { font-size: 8px !important; line-height: 1.3 !important; }
    .ad-banner.poster-banner img { max-height: 50px !important; object-fit: contain !important; }
    .ad-banner.grid-4 .ad-tile img { height: 36px !important; }
    .ad-banner.featured { grid-template-columns: 100px 1fr !important; gap: 8px !important; }
    .ad-banner.featured .ad-left .ad-headline { font-size: 12px !important; }
    .ad-banner.featured .ad-right .ad-tile img { height: 32px !important; }

    .footer { margin-top: 4px !important; padding-top: 4px !important; font-size: 7.5px !important; }

    /* Avoid breaking inside these blocks */
    .items-table tbody tr,
    .bill-box,
    .info-block,
    .totals-table tr,
    .hsn-table tr,
    .bottom-split,
    .info-row,
    .signature,
    .ad-banner,
    .footer {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    /* Keep bottom section together on same page if possible */
    .bottom-split {
      break-before: avoid !important;
    }
    /* Repeat table header on each printed page */
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
  }

  /* Responsive on small screens — keep A4 ratio but shrink to fit */
  @media (max-width: 820px) {
    body { padding: 6px; }
    .sheet {
      width: 100%;
      min-height: auto;
      padding: 10px;
    }
    .header { flex-direction: column; }
    .header .doc-meta { text-align: left; max-width: 100%; }
    .bill-section { grid-template-columns: 1fr; }
    .bottom-split { grid-template-columns: 1fr; }
    .info-row { grid-template-columns: 1fr; }
    .items-table { font-size: 9px; }
    .items-table thead th, .items-table tbody td { padding: 4px 3px; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="title">${escapeHtml(docTitle)} &middot; ${escapeHtml(data.number)}</div>
    <div class="actions">
      <button onclick="window.print()" class="primary">🖨 Print / Save as PDF</button>
      <a href="/api/pdf/${encodeURIComponent(data.docId || '')}?type=${isService ? 'service' : data.docType}&template=${encodeURIComponent(tpl.id)}&banner=${encodeURIComponent(data.adBannerVariant || 'flyer')}" download>⬇ Download PDF</a>
      <a href="/api/pdf/${encodeURIComponent(data.docId || '')}?type=${isService ? 'service' : data.docType}&template=${encodeURIComponent(tpl.id)}&banner=${encodeURIComponent(data.adBannerVariant || 'flyer')}" target="_blank">↗ Open PDF</a>
    </div>
  </div>

  <div class="sheet">
    <div class="header">
      <div class="shop-block">
        <img src="${data.productImages?.logo || data.shop?.logoUrl || '/logo.webp'}" alt="Logo" class="shop-logo" onerror="this.src='/logo.webp';this.onerror=null;" />
        <div class="shop-text">
          <h1 class="shop-name">${escapeHtml(data.shop.name || 'Smart Computers')}</h1>
          <div class="shop-info">
            ${data.shop.address ? `<div>${escapeHtml(data.shop.address)}</div>` : ''}
            ${data.shop.state ? `<div>${escapeHtml(data.shop.state)}${shopStateCode ? ` (${shopStateCode})` : ''}</div>` : ''}
            ${data.shop.phone || data.shop.email ? `<div>${data.shop.phone ? `Ph: ${escapeHtml(data.shop.phone)}` : ''}${data.shop.phone && data.shop.email ? ' &nbsp;|&nbsp; ' : ''}${data.shop.email ? escapeHtml(data.shop.email) : ''}</div>` : ''}
            ${data.shop.gstNumber && !isNonGst ? `<div class="gst">GSTIN: ${escapeHtml(data.shop.gstNumber)}</div>` : ''}
            ${isNonGst ? `<div class="gst" style="color:${tpl.accent};">RETAIL INVOICE (Non-GST)</div>` : ''}
          </div>
        </div>
      </div>
      <div class="doc-meta">
        <h2 class="doc-title">${escapeHtml(docTitle)}</h2>
        <div class="meta-line bold">No: ${escapeHtml(data.number)}</div>
        <div class="meta-line">Date: ${escapeHtml(formatDate(data.date))}</div>
        ${data.validTill ? `<div class="meta-line">Valid Till: ${escapeHtml(formatDate(data.validTill))}</div>` : ''}
        ${data.eWayBillNo ? `<div class="meta-line">E-Way: ${escapeHtml(data.eWayBillNo)}</div>` : ''}
        ${data.placeOfSupply ? `<div class="meta-line">Place of Supply: ${escapeHtml(data.placeOfSupply)}</div>` : ''}
        <div class="badge">${isInvoice ? 'ORIGINAL FOR RECIPIENT' : isService ? 'SERVICE COPY' : 'QUOTATION'}</div>
      </div>
    </div>

    <div class="bill-section">
      <div class="bill-box">
        <h3>${isInvoice ? 'BILL TO / CUSTOMER DETAILS' : isService ? 'BILL TO / SERVICE CUSTOMER' : 'QUOTE TO'}</h3>
        <div class="cname">${escapeHtml(data.customer.name || 'Walk-in Customer')}</div>
        ${data.customer.address ? `<div class="cline">${escapeHtml(data.customer.address)}</div>` : ''}
        ${data.customer.phone ? `<div class="cline">Mobile: ${escapeHtml(data.customer.phone)}</div>` : ''}
        ${!isService && data.customer.gstNumber ? `<div class="cline gst">GSTIN: ${escapeHtml(data.customer.gstNumber)}</div>` : ''}
        ${!isService && data.customer.state ? `<div class="cline">State: ${escapeHtml(data.customer.state)}${custStateCode ? ` (${custStateCode})` : ''}</div>` : ''}
      </div>
      <div class="bill-box">
        ${rightBoxContent}
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>#</th>
          <th class="left">Item / Description (SKU)</th>
          ${(isNonGst || isService) ? '' : '<th>HSN / SAC</th>'}
          <th>Qty</th>
          <th class="right">Rate (Rs.)</th>
          ${(isNonGst || isService) ? '' : '<th class="right">Taxable (Rs.)</th>'}
          ${(isNonGst || isService) ? '' : '<th class="right">GST (Rs.)</th>'}
          <th class="right">Amount (Rs.)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows || '<tr><td colspan="9" style="text-align:center;padding:20px;color:#94a3b8;">No items</td></tr>'}
      </tbody>
    </table>

    ${hsnBlock}

    <div class="bottom-split">
      <div class="words-block">
        <div class="label">AMOUNT IN WORDS</div>
        <div class="text">${escapeHtml(amountInWords)}</div>
        ${bankBlock ? `<div style="margin-top:10px;">${bankBlock}</div>` : ''}
        ${qrBlock ? `<div style="margin-top:10px;">${qrBlock}</div>` : ''}
      </div>
      <table class="totals-table">
        ${totalsRows.join('')}
      </table>
    </div>

    <div class="info-row">
      ${bankBlock && !qrBlock ? bankBlock : ''}
      ${termsBlock}
      ${!bankBlock && !qrBlock ? '<div class="info-block"><h4>CONTACT</h4><div>Thank you for your business!</div></div>' : ''}
    </div>

    <div class="signature">
      <div class="sig">
        <div class="sig-for">For ${escapeHtml(data.shop.name || 'Smart Computers')}:</div>
        <div class="sig-line">
          <div class="sig-auth">Authorized Signatory</div>
        </div>
      </div>
    </div>

    ${adBanner}

    <div class="footer">
      ${escapeHtml(docTitle)} ${escapeHtml(data.number)} &nbsp;|&nbsp; ${escapeHtml(data.shop.name || 'Smart Computers')}
      &nbsp;|&nbsp; Computer generated on ${escapeHtml(new Date().toLocaleString('en-IN'))}
      <div style="margin-top:4px;font-size:9px;font-weight:700;color:${tpl.accent};">
        ⭐ Review us on Google: <a href="${BUSINESS_GROWTH.googleReviewUrl}" target="_blank" style="color:${tpl.accent};text-decoration:underline;">${BUSINESS_GROWTH.googleReviewUrl}</a>
      </div>
    </div>
  </div>

  <script>
    // Auto-print shortcut: Ctrl/Cmd+P works natively. We also expose window.printDoc().
    window.printDoc = function() { window.print(); };
    // Keyboard shortcut: 'p' to print
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        window.print();
      }
    });
  </script>
</body>
</html>`

  return html
}

// ──────────────────────────────────────────────────────────────────────
// Right-side box builders
// ──────────────────────────────────────────────────────────────────────

function buildPaymentBox(data: PdfDocData, isService: boolean): string {
  if (isService) {
    const brandModel = (data as any).brandModel || (data as any).deviceType || 'Computer / Laptop'
    const serialNumber = (data as any).serialNumber || 'N/A'
    const problemDesc = (data as any).problemDesc || 'Repair & Maintenance'
    const serviceType = (data as any).serviceType || 'In-Shop'
    // NOTE: "Service Warranty: X Days" line removed per user request —
    // warranty info now lives only in the Terms & Conditions block.
    return `
      <h3>SERVICE &amp; REPAIR DETAILS</h3>
      <div class="cline" style="font-weight:700;color:#0f172a;">Device: ${escapeHtml(brandModel)}</div>
      <div class="cline">S/N: ${escapeHtml(serialNumber)} | Type: ${escapeHtml(serviceType)}</div>
      <div class="cline">Issue: ${escapeHtml(problemDesc)}</div>
      ${data.amountDue !== undefined
        ? `<div class="cline ${data.amountDue > 0 ? 'gst' : ''}" style="${data.amountDue > 0 ? 'color:#dc2626;font-weight:700;' : 'color:#16a34a;font-weight:700;'}margin-top:2px;">${data.amountDue > 0 ? `Balance Due: ${formatCurrency(data.amountDue).replace('Rs. ', '₹')}` : 'STATUS: PAID &#10003;'}</div>`
        : ''}
    `
  }
  return `
    <h3>PAYMENT &amp; SHIPPING DETAILS</h3>
    <div class="cline">Payment: ${escapeHtml((data.paymentType || 'cash').toUpperCase())} | Status: ${escapeHtml((data.paymentStatus || 'paid').toUpperCase())}</div>
    ${data.amountDue !== undefined && data.amountDue > 0
      ? `<div class="cline gst" style="color:#dc2626;font-weight:700;">Balance Due: ${formatCurrency(data.amountDue).replace('Rs. ', '₹')}</div>`
      : data.amountPaid !== undefined && data.amountPaid > 0
        ? `<div class="cline" style="color:#16a34a;font-weight:700;">Paid: ${formatCurrency(data.amountPaid).replace('Rs. ', '₹')}</div>`
        : ''}
    ${data.placeOfSupply ? `<div class="cline">Place of Supply: ${escapeHtml(data.placeOfSupply)}</div>` : ''}
    ${data.reverseCharge ? `<div class="cline gst">Reverse Charge: Yes</div>` : ''}
  `
}

function buildQuotationBox(data: PdfDocData): string {
  return `
    <h3>QUOTATION DETAILS</h3>
    <div class="cline">Valid Till: ${escapeHtml(data.validTill ? formatDate(data.validTill) : '7 days')}</div>
    <div class="cline">Quote No: ${escapeHtml(data.number)}</div>
    <div class="cline" style="color:#16a34a;font-weight:700;margin-top:4px;">Thank you for your inquiry!</div>
  `
}

// ──────────────────────────────────────────────────────────────────────
// Ad banner builders — support .webp poster images with base64 fallback
// ──────────────────────────────────────────────────────────────────────

function buildAdBanner(variant: string, shop: ShopInfo, tpl: HtmlTemplate, productImages?: any): string {
  if (variant === 'none') return ''

  const phone = shop.phone || ''
  const shopName = shop.name || 'Smart Computers'

  const flyerSrc = productImages?.flyer || '/posters/smartcomputers-a4-flyer-landscape.webp'
  const gridSrc = productImages?.productgrid || '/posters/smartcomputers-product-grid.webp'
  const compSrc = productImages?.computers || '/posters/gaming-pc.webp'
  const laptopSrc = productImages?.laptop || '/posters/laptop-sale.webp'
  const printerSrc = productImages?.printers || '/posters/printer-offer.webp'
  const accSrc = productImages?.accessories || '/posters/accessories.webp'

  // Variant: flyer — landscape WebP flyer image (exact 1000x285 px format, 100% full view, zero cropping)
  if (variant === 'flyer') {
    return `
      <div class="ad-banner poster-banner" style="page-break-inside:avoid;break-inside:avoid;">
        <img src="${flyerSrc}" alt="Offers" style="width:100%;height:auto;aspect-ratio:1000/285;object-fit:contain;border-radius:6px;display:block;margin:0 auto;" />
      </div>
    `
  }

  // Variant: grid — WebP 4x4 product grid poster (exact 1000x285 px format, 100% full view, zero cropping)
  if (variant === 'grid') {
    return `
      <div class="ad-banner poster-banner" style="page-break-inside:avoid;break-inside:avoid;">
        <img src="${gridSrc}" alt="Product Showcase" style="width:100%;height:auto;aspect-ratio:1000/285;object-fit:contain;border-radius:6px;display:block;margin:0 auto;" />
      </div>
    `
  }

  // Variant: featured — left panel + 4 product tiles
  if (variant === 'featured') {
    return `
      <div class="ad-banner featured" style="page-break-inside:avoid;break-inside:avoid;">
        <div class="ad-left">
          <div class="ad-headline">WE ALSO SUPPLY</div>
          <div class="ad-sub">${escapeHtml(shopName)}</div>
          ${phone ? `<div class="ad-sub">Call: ${escapeHtml(phone)}</div>` : ''}
        </div>
        <div class="ad-right">
          <div class="ad-tile"><img src="${compSrc}" alt="Computers" /><div class="ad-tile-label">Computers</div></div>
          <div class="ad-tile"><img src="${laptopSrc}" alt="Laptops" /><div class="ad-tile-label">Laptops</div></div>
          <div class="ad-tile"><img src="${printerSrc}" alt="Printers" /><div class="ad-tile-label">Printers</div></div>
          <div class="ad-tile"><img src="${accSrc}" alt="Accessories" /><div class="ad-tile-label">Accessories</div></div>
        </div>
      </div>
    `
  }

  // Variant: strip — compact horizontal strip
  if (variant === 'strip') {
    return `
      <div class="ad-banner" style="page-break-inside:avoid;break-inside:avoid;">
        <div class="ad-text">
          <div class="ad-headline">WE ALSO SUPPLY</div>
          <div class="ad-sub">Computers &middot; Laptops &middot; Printers &middot; Accessories ${phone ? `&middot; Call: ${escapeHtml(phone)}` : ''}</div>
        </div>
        <img src="${compSrc}" class="ad-img" alt="" />
        <img src="${laptopSrc}" class="ad-img" alt="" />
        <img src="${printerSrc}" class="ad-img" alt="" />
        <img src="${accSrc}" class="ad-img" alt="" />
      </div>
    `
  }

  // Fallback = flyer
  return buildAdBanner('flyer', shop, tpl, productImages)
}
