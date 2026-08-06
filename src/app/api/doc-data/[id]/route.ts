import { NextRequest, NextResponse } from 'next/server'
import { getRow, listRows } from '@/lib/sheets-client'
import { computeInvoice, type LineItem } from '@/lib/calc'
import { safeJsonParse } from '@/lib/utils'
import { loadProductImages } from '@/lib/productImages'
import QRCode from 'qrcode'

// Fast in-memory cache for doc data
type DocDataCacheEntry = { data: any; expires: number }
const DOC_DATA_CACHE = new Map<string, DocDataCacheEntry>()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

// Shop is global and rarely changes. Cache it for 5 min to avoid re-fetching
// on every doc-data call (which would otherwise double the latency).
type ShopCacheEntry = { shop: any; expires: number }
let shopCache: ShopCacheEntry | null = null
const SHOP_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getShopFast(): Promise<any> {
  if (shopCache && shopCache.expires > Date.now()) {
    return shopCache.shop
  }
  const shopRows = await listRows<any>('Shop').catch(() => [])
  const shop = shopRows[0] || { name: 'Smart Computers', termsInvoice: '', termsQuotation: '' }
  shopCache = { shop, expires: Date.now() + SHOP_CACHE_TTL }
  return shop
}

// Product images are static — load once per process.
let productImagesCache: any = null
async function getProductImagesFast(): Promise<any> {
  if (!productImagesCache) productImagesCache = await loadProductImages()
  return productImagesCache
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const type = url.searchParams.get('type') || 'invoice'
    const templateId = url.searchParams.get('template') || ''
    const bannerVariant = url.searchParams.get('banner') || ''

    const cacheKey = `${id}:${type}:${templateId}:${bannerVariant}`
    const cached = DOC_DATA_CACHE.get(cacheKey)
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' },
      })
    }

    const shop = await getShopFast()

    const finalTemplateId = templateId || String(shop.pdfTemplate || '') || 'tally-classic'
    const finalBannerVariant = bannerVariant || String(shop.adBannerVariant || '') || 'flyer'

    let docData: any = null
    const productImages = await getProductImagesFast()

    if (type === 'invoice') {
      const invoice = await getRow<any>('Invoices', id)
      if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

      const items = safeJsonParse<any[]>(invoice.itemsJson, []) as LineItem[]
      const calc = computeInvoice(items, {
        courierCharges: Number(invoice.courierCharges) || 0,
        otherCharges: Number(invoice.otherCharges) || 0,
        discount: Number(invoice.discount) || 0,
      })

      docData = {
        id,
        number: String(invoice.number || ''),
        date: invoice.date || invoice.createdAt || new Date().toISOString(),
        docType: 'invoice',
        templateId: finalTemplateId,
        bannerVariant: finalBannerVariant,
        productImages,
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
          id: String(invoice.customerId || ''),
          name: String(invoice.customerName || ''),
          phone: String(invoice.customerPhone || ''),
          address: '',
          gstNumber: String(invoice.customerGstin || ''),
          state: '',
        },
        calc,
        notes: String(invoice.notes || ''),
        terms: String(shop.termsInvoice || '1. Goods once sold will not be taken back.\n2. Warranty as per manufacturer policies.\n3. Subject to local jurisdiction.'),
        amountPaid: Number(invoice.amountPaid) || 0,
        amountDue: Number(invoice.amountDue) || 0,
        paymentType: String(invoice.paymentType || 'cash'),
        paymentStatus: String(invoice.paymentStatus || 'unpaid'),
      }
    } else if (type === 'quotation') {
      const q = await getRow<any>('Quotations', id)
      if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })

      const items = safeJsonParse<any[]>(q.itemsJson, []) as LineItem[]
      const calc = computeInvoice(items, {
        courierCharges: Number(q.courierCharges) || 0,
        otherCharges: Number(q.otherCharges) || 0,
        discount: Number(q.discount) || 0,
      })

      docData = {
        id,
        number: String(q.number || ''),
        date: q.date || q.createdAt || new Date().toISOString(),
        validTill: q.validTill || undefined,
        docType: 'quotation',
        templateId: finalTemplateId,
        bannerVariant: finalBannerVariant,
        productImages,
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
          id: String(q.customerId || ''),
          name: String(q.customerName || ''),
          phone: String(q.customerPhone || ''),
          address: '',
          gstNumber: String(q.customerGstin || ''),
          state: '',
        },
        calc,
        notes: String(q.notes || ''),
        terms: String(shop.termsQuotation || '1. Quotation valid for 7 days.\n2. Prices subject to market changes.\n3. Delivery charges extra if applicable.'),
      }
    } else if (type === 'service') {
      const job = await getRow<any>('Jobs', id)
      if (!job) return NextResponse.json({ error: 'Service job not found' }, { status: 404 })

      const partsUsed = safeJsonParse<any[]>(job.partsUsedJson, [])
      const items: LineItem[] = partsUsed.map((p) => ({
        itemId: p.itemId,
        name: p.name || 'Part/Component',
        quantity: Number(p.quantity) || 1,
        rate: Number(p.sellingPrice) || Number(p.price) || 0,
        gstApplicable: false,
        gstRate: 0,
      }))

      if (Number(job.serviceCharge) > 0) {
        items.push({
          name: `Service Labor: ${job.deviceType || 'Repair'} (${job.problemDesc || 'Service'})`,
          quantity: 1,
          rate: Number(job.serviceCharge),
          gstApplicable: false,
          gstRate: 0,
        })
      }

      const calc = computeInvoice(items, {})

      docData = {
        id,
        number: `JOB-${job.jobId || job.id}`,
        date: job.completedDate || job.createdAt || new Date().toISOString(),
        docType: 'service',
        templateId: finalTemplateId,
        bannerVariant: finalBannerVariant,
        productImages,
        jobId: job.jobId || job.id,
        deviceType: job.deviceType,
        brandModel: job.brandModel,
        serialNumber: job.serialNumber,
        problemDesc: job.problemDesc,
        diagnosisNotes: job.diagnosisNotes,
        warrantyDays: job.warrantyDays || 30,
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
          name: String(job.customerName || ''),
          phone: String(job.customerMobile || ''),
          address: '',
        },
        calc,
        notes: String(job.diagnosisNotes || job.notes || 'Service completed. Please check warranty terms.'),
        terms: String(shop.termsInvoice || '1. Warranty covers service labor and parts supplied.\n2. Physical damage or liquid spills invalidate warranty.'),
        amountPaid: Number(job.paidAmount) || 0,
        amountDue: Math.max(0, calc.grandTotal - (Number(job.paidAmount) || 0)),
        paymentType: String(job.paymentMode || 'cash'),
        paymentStatus: Number(job.paidAmount) >= calc.grandTotal ? 'paid' : Number(job.paidAmount) > 0 ? 'partial' : 'unpaid',
      }
    }

    if (!docData) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
    }

    if (docData.shop.upiId) {
      try {
        const qrAmount = docData.amountDue > 0 ? docData.amountDue : docData.calc.grandTotal
        const upiStr = `upi://pay?pa=${encodeURIComponent(docData.shop.upiId)}&pn=${encodeURIComponent(docData.shop.name)}&am=${qrAmount.toFixed(2)}&cu=INR`
        docData.upiQr = await QRCode.toDataURL(upiStr, { margin: 1, width: 140 })
      } catch {
        docData.upiQr = null
      }
    }

    DOC_DATA_CACHE.set(cacheKey, { data: docData, expires: Date.now() + CACHE_TTL })
    return NextResponse.json(docData, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
