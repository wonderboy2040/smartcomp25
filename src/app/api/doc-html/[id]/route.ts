import { NextRequest, NextResponse } from 'next/server'
import { getRow, listRows, isConfigured } from '@/lib/sheets-client'
import { generateInvoiceHtml } from '@/lib/doc-html'
import { loadProductImages } from '@/lib/productImages'
import { computeInvoice, type LineItem } from '@/lib/calc'
import { safeJsonParse } from '@/lib/utils'

// HTML preview is nodejs runtime (uses qrcode lib)
export const runtime = 'nodejs'

// In-memory LRU cache — HTML is fully deterministic per (id, type, template, banner)
// so we can cache the rendered string for 10 minutes and serve instantly.
type HtmlCacheEntry = { html: string; expires: number }
const HTML_CACHE = new Map<string, HtmlCacheEntry>()
const HTML_CACHE_TTL = 10 * 60 * 1000 // 10 min
const HTML_CACHE_MAX = 80

function getCachedHtml(key: string): string | null {
  const e = HTML_CACHE.get(key)
  if (!e) return null
  if (e.expires < Date.now()) {
    HTML_CACHE.delete(key)
    return null
  }
  // Move to end (LRU)
  HTML_CACHE.delete(key)
  HTML_CACHE.set(key, e)
  return e.html
}

function setCachedHtml(key: string, html: string) {
  if (HTML_CACHE.size >= HTML_CACHE_MAX) {
    const firstKey = HTML_CACHE.keys().next().value
    if (firstKey) HTML_CACHE.delete(firstKey)
  }
  HTML_CACHE.set(key, { html, expires: Date.now() + HTML_CACHE_TTL })
}

// Fast Shop cache (5 min TTL)
type ShopCacheEntry = { shop: any; expires: number }
let shopCache: ShopCacheEntry | null = null
const SHOP_CACHE_TTL = 5 * 60 * 1000

/**
 * Short content fingerprint of a source row.
 *
 * The cache was keyed on id + template + banner alone, so for ten minutes after
 * an edit the user was served the PRE-EDIT HTML. Fingerprint the row itself —
 * any saved change produces a different key. (Same approach as pdf/[id]/route.ts)
 */
function rowFingerprint(row: any): string {
  let h = 0
  const s = JSON.stringify(row ?? {})
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

async function getShopFast(): Promise<any> {
  if (shopCache && shopCache.expires > Date.now()) {
    return shopCache.shop
  }
  const shopRows = await listRows<any>('Shop').catch(() => [])
  const shop = shopRows[0] || { name: 'Smart Computers', termsInvoice: '', termsQuotation: '' }
  shopCache = { shop, expires: Date.now() + SHOP_CACHE_TTL }
  return shop
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: 'Firebase not configured' },
        { status: 503 },
      )
    }

    const { id } = await params
    const url = new URL(req.url)
    const type = url.searchParams.get('type') || 'invoice'
    const bannerVariant =
      url.searchParams.get('banner') || 'flyer'
    const gstMode = (url.searchParams.get('gstMode') === 'non-gst' ? 'non-gst' : 'gst') as 'gst' | 'non-gst'

    // Fast shop info with 5-min memory cache
    const shop = await getShopFast()

    // Load the source row BEFORE the cache lookup so we can fingerprint its
    // content and use the row's stored template as a fallback.
    const sheetName = type === 'quotation' ? 'Quotations' : type === 'service' ? 'Jobs' : 'Invoices'
    const row = await getRow<any>(sheetName, id)
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Template fallback chain aligned with pdf/[id]/route.ts:
    // query param → row's saved template → shop default → hard default
    const templateId =
      url.searchParams.get('template') ||
      String(row.template || '') ||
      String(shop.pdfTemplate || '') ||
      'tally-classic'

    // Cache key now includes a content fingerprint so edits invalidate instantly
    const cacheKey = `${id}:${type}:${templateId}:${bannerVariant}:${gstMode}:${rowFingerprint(row)}`
    const cached = getCachedHtml(cacheKey)
    if (cached) {
      return new NextResponse(cached, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control':
            'private, max-age=300, stale-while-revalidate=600',
        },
      })
    }

    // Pre-load product images (logo + ad banners) once for all doc types
    const productImages = await loadProductImages()

    if (type === 'invoice') {
      const invoice = row

      const items = safeJsonParse<any[]>(invoice.itemsJson, []) as LineItem[]
      const calc = computeInvoice(items, {
        courierCharges: Number(invoice.courierCharges) || 0,
        otherCharges: Number(invoice.otherCharges) || 0,
        discount: Number(invoice.discount) || 0,
      })

      const html = await generateInvoiceHtml(
        {
          number: String(invoice.number || ''),
          date: new Date(invoice.date || invoice.createdAt || Date.now()),
          shop: {
            name: String(shop.name || 'Smart Computers'),
            owner: String(shop.owner || ''),
            phone: String(shop.phone || ''),
            email: String(shop.email || ''),
            address: String(shop.address || ''),
            gstNumber: String(shop.gstNumber || ''),
            state: String(shop.state || ''),
            upiId: String(shop.upiId || ''),
            bankName: String(shop.bankName || ''),
            bankAccount: String(shop.bankAccount || ''),
            bankIfsc: String(shop.bankIfsc || ''),
            bankBranch: String(shop.bankBranch || ''),
          },
          customer: {
            name: String(invoice.customerName || ''),
            phone: String(invoice.customerPhone || ''),
            address: '',
            gstNumber: String(invoice.customerGstin || ''),
            state: '',
          },
          calc,
          notes: String(invoice.notes || ''),
          terms: String(shop.termsInvoice || ''),
          amountPaid: Number(invoice.amountPaid) || 0,
          amountDue: Number(invoice.amountDue) || 0,
          paymentType: String(invoice.paymentType || ''),
          paymentStatus: String(invoice.paymentStatus || ''),
          docType: 'invoice',
          templateId,
          adBannerVariant: bannerVariant,
          productImages,
          gstMode,
        },
        id,
      )

      setCachedHtml(cacheKey, html)
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control':
            'private, max-age=300, stale-while-revalidate=600',
        },
      })
    }

    if (type === 'quotation') {
      const q = row

      const items = safeJsonParse<any[]>(q.itemsJson, []) as LineItem[]
      const calc = computeInvoice(items, {
        courierCharges: Number(q.courierCharges) || 0,
        otherCharges: Number(q.otherCharges) || 0,
        discount: Number(q.discount) || 0,
      })

      const html = await generateInvoiceHtml(
        {
          number: String(q.number || ''),
          date: new Date(q.date || q.createdAt || Date.now()),
          validTill: q.validTill ? new Date(q.validTill) : undefined,
          shop: {
            name: String(shop.name || 'Smart Computers'),
            owner: String(shop.owner || ''),
            phone: String(shop.phone || ''),
            email: String(shop.email || ''),
            address: String(shop.address || ''),
            gstNumber: String(shop.gstNumber || ''),
            state: String(shop.state || ''),
            upiId: String(shop.upiId || ''),
            bankName: String(shop.bankName || ''),
            bankAccount: String(shop.bankAccount || ''),
            bankIfsc: String(shop.bankIfsc || ''),
            bankBranch: String(shop.bankBranch || ''),
          },
          customer: {
            name: String(q.customerName || ''),
            phone: String(q.customerPhone || ''),
            address: '',
            gstNumber: String(q.customerGstin || ''),
            state: '',
          },
          calc,
          notes: String(q.notes || ''),
          terms: String(shop.termsQuotation || ''),
          docType: 'quotation',
          templateId,
          adBannerVariant: bannerVariant,
          productImages,
          gstMode,
        },
        id,
      )

      setCachedHtml(cacheKey, html)
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control':
            'private, max-age=300, stale-while-revalidate=600',
        },
      })
    }

    if (type === 'service') {
      const job = row

      const partsUsed = safeJsonParse<any[]>(job.partsUsedJson || job.partsUsed || '[]', [])
      const lineItems: LineItem[] = [
        ...partsUsed.map((p: any) => ({
          name: String(p.name || 'Spare Part'),
          sku: String(p.sku || ''),
          hsnCode: String(p.hsnCode || ''),
          quantity: Number(p.qty || 1),
          rate: Number(p.sellPrice || p.price || p.costPrice || 0),
          gstApplicable: false,
          gstRate: 0,
          costPrice: Number(p.costPrice || 0),
        })),
        {
          name: `Service & Repair Charge - ${job.deviceType || 'Device'} ${job.brandModel ? `(${job.brandModel})` : ''}`,
          sku: 'SERVICE',
          hsnCode: '9983',
          quantity: 1,
          rate: Number(job.serviceCharge) || Math.max(0, (Number(job.finalAmount) || 0) - partsUsed.reduce((s: number, p: any) => s + (Number(p.sellPrice || p.price || p.costPrice || 0) * Number(p.qty || 1)), 0)) || 0,
          gstApplicable: false,
          gstRate: 0,
          costPrice: 0,
        },
      ]

      const finalLineItems = partsUsed.length > 0 ? lineItems : [lineItems[lineItems.length - 1]]
      const calc = computeInvoice(finalLineItems, {
        courierCharges: 0,
        otherCharges: 0,
        discount: 0,
      })

      const jobTotal = Number(job.finalAmount) || Number(job.estimatedAmount) || calc.grandTotal
      const paid = (Number(job.paidAmount) || 0) + (Number(job.advanceAmount) || 0)

      const html = await generateInvoiceHtml(
        {
          number: `INV-${String(job.jobId || id)}`,
          date: new Date(job.createdAt || job.date || Date.now()),
          shop: {
            name: String(shop.name || 'Smart Computers'),
            owner: String(shop.owner || ''),
            phone: String(shop.phone || ''),
            email: String(shop.email || ''),
            address: String(shop.address || ''),
            gstNumber: String(shop.gstNumber || ''),
            state: String(shop.state || ''),
            upiId: String(shop.upiId || ''),
            bankName: String(shop.bankName || ''),
            bankAccount: String(shop.bankAccount || ''),
            bankIfsc: String(shop.bankIfsc || ''),
            bankBranch: String(shop.bankBranch || ''),
          },
          customer: {
            name: String(job.customerName || 'Walk-in Customer'),
            phone: String(job.customerMobile || ''),
            address: String(job.customerAddress || ''),
            gstNumber: '',
            state: '',
          },
          calc: {
            ...calc,
            grandTotal: jobTotal,
          },
          notes: String(job.diagnosisNotes || job.notes || `Service completed for ${job.deviceType || 'device'}. Problem: ${job.problemDesc || ''}. ${job.accessories ? `Accessories: ${job.accessories}` : ''}`),
          // Terms & Conditions — service invoice uses a clean default that
          // mentions only manufacturer parts warranty + 30-day device pickup.
          // "30 days service warranty" line intentionally removed per user
          // request (warranty info lives only in shop settings).
          terms: String(shop.termsInvoice || 'Parts warranty as per manufacturer. Please collect device within 30 days.'),
          amountPaid: paid,
          amountDue: Math.max(0, jobTotal - paid),
          paymentType: String(job.paymentMode || 'cash'),
          paymentStatus: paid >= jobTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
          docType: 'service',
          templateId,
          adBannerVariant: bannerVariant,
          productImages,
          gstMode,
          ...(job as any),
        },
        id,
      )

      setCachedHtml(cacheKey, html)
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control':
            'private, max-age=300, stale-while-revalidate=600',
        },
      })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (e: any) {
    console.error('HTML doc generation error:', e)
    return NextResponse.json(
      { error: e?.message || 'Failed' },
      { status: 500 },
    )
  }
}
