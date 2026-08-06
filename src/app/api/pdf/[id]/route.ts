import { NextRequest, NextResponse } from 'next/server'
import { getRow, listRows, isConfigured } from '@/lib/sheets-client'
import { generateInvoicePdf } from '@/lib/pdf'
import { loadProductImages } from '@/lib/productImages'
import { computeInvoice, type LineItem } from '@/lib/calc'
import { safeJsonParse } from '@/lib/utils'

export const runtime = 'nodejs'

// Server in-memory PDF cache (10 min TTL for instant back-to-back downloads)
type PdfCacheEntry = { buffer: Buffer; expires: number }
const PDF_CACHE = new Map<string, PdfCacheEntry>()
const PDF_CACHE_TTL = 10 * 60 * 1000

// Fast Shop cache (5 min TTL)
type ShopCacheEntry = { shop: any; expires: number }
let shopCache: ShopCacheEntry | null = null
const SHOP_CACHE_TTL = 5 * 60 * 1000

async function getShopFast(): Promise<any> {
  if (shopCache && shopCache.expires > Date.now()) {
    return shopCache.shop
  }
  const shopRows = await listRows<any>('Shop').catch(() => [])
  const shop = shopRows[0] || { name: 'Smart Computers', termsInvoice: '', termsQuotation: '' }
  shopCache = { shop, expires: Date.now() + SHOP_CACHE_TTL }
  return shop
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }

    const { id } = await params
    const url = new URL(req.url)
    const type = url.searchParams.get('type') || 'invoice'

    const shop = await getShopFast()

    const templateId = url.searchParams.get('template') || String(shop.pdfTemplate || '') || 'tally-classic'
    const bannerVariant = url.searchParams.get('banner') || String(shop.adBannerVariant || '') || 'flyer'
    const gstMode = (url.searchParams.get('gstMode') === 'non-gst' ? 'non-gst' : 'gst') as 'gst' | 'non-gst'

    const cacheKey = `${id}:${type}:${templateId}:${bannerVariant}:${gstMode}`
    const cached = PDF_CACHE.get(cacheKey)
    if (cached && cached.expires > Date.now()) {
      return new NextResponse(cached.buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${type}-${id}.pdf"`,
          'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
        },
      })
    }

    let pdfBuffer: Buffer | null = null
    let filename = `${type}-${id}.pdf`

    if (type === 'invoice') {
      const invoice = await getRow<any>('Invoices', id)
      if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const items = safeJsonParse<any[]>(invoice.itemsJson, []) as LineItem[]
      const calc = computeInvoice(items, {
        courierCharges: Number(invoice.courierCharges) || 0,
        otherCharges: Number(invoice.otherCharges) || 0,
        discount: Number(invoice.discount) || 0,
      })

      filename = `Invoice-${invoice.number || id}.pdf`

      pdfBuffer = await generateInvoicePdf({
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
        productImages: await loadProductImages(),
        adBannerVariant: bannerVariant,
        gstMode,
      })
    } else if (type === 'quotation') {
      const q = await getRow<any>('Quotations', id)
      if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const items = safeJsonParse<any[]>(q.itemsJson, []) as LineItem[]
      const calc = computeInvoice(items, {
        courierCharges: Number(q.courierCharges) || 0,
        otherCharges: Number(q.otherCharges) || 0,
        discount: Number(q.discount) || 0,
      })

      filename = `Quotation-${q.number || id}.pdf`

      pdfBuffer = await generateInvoicePdf({
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
        productImages: await loadProductImages(),
        adBannerVariant: bannerVariant,
        gstMode,
      })
    } else if (type === 'service') {
      const job = await getRow<any>('Jobs', id)
      if (!job) return NextResponse.json({ error: 'Service job not found' }, { status: 404 })

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
          rate: Number(job.serviceCharge) || Number(job.finalAmount) || 0,
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

      filename = `Service-Invoice-${job.jobId || id}.pdf`

      pdfBuffer = await generateInvoicePdf({
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
        notes: String(job.diagnosisNotes || job.notes || `Service completed for ${job.deviceType || 'device'}. Problem: ${job.problemDesc || ''}.`),
        terms: String(shop.termsInvoice || `${Number(job.warrantyDays) || 30} days service warranty. Please collect device within 30 days.`),
        amountPaid: paid,
        amountDue: Math.max(0, jobTotal - paid),
        paymentType: String(job.paymentMode || 'cash'),
        paymentStatus: paid >= jobTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        docType: 'service',
        templateId,
        productImages: await loadProductImages(),
        adBannerVariant: bannerVariant,
        gstMode,
        ...(job as any),
      })
    }

    if (!pdfBuffer) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
    }

    // Cache PDF buffer for instant subsequent requests
    PDF_CACHE.set(cacheKey, { buffer: pdfBuffer, expires: Date.now() + PDF_CACHE_TTL })

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
      },
    })
  } catch (e: any) {
    console.error('PDF generation error:', e)
    return NextResponse.json({ error: e?.message || 'Failed to generate PDF' }, { status: 500 })
  }
}
