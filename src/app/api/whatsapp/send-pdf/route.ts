import { NextRequest, NextResponse } from 'next/server'
import { getRow, listRows, isConfigured } from '@/lib/sheets-client'
import { sendPdfDocument, isCloudApiConfigured, normalizePhone } from '@/lib/whatsapp-cloud'
import { generateInvoiceHtml } from '@/lib/doc-html'
import { loadProductImages } from '@/lib/productImages'
import { computeInvoice, type LineItem } from '@/lib/calc'
import { safeJsonParse } from '@/lib/utils'
import { apiLimiter, writeLimiter, getClientIp } from '@/lib/rate-limit'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { access, constants } from 'fs'

const execFileAsync = promisify(execFile)

export const runtime = 'nodejs'
export const maxDuration = 60

// Cache WeasyPrint availability so we don't probe the binary on every request.
let weasyPrintAvailable: boolean | null = null
async function isWeasyPrintAvailable(): Promise<boolean> {
  if (weasyPrintAvailable !== null) return weasyPrintAvailable
  const bin = process.env.WEASYPRINT_BIN || '/home/z/.venv/bin/weasyprint'
  try {
    await new Promise<void>((resolve, reject) => {
      access(bin, constants.X_OK, (err) => err ? reject(err) : resolve())
    })
    weasyPrintAvailable = true
  } catch {
    weasyPrintAvailable = false
  }
  return weasyPrintAvailable
}

/**
 * POST /api/whatsapp/send-pdf
 *
 * Sends a PDF directly to the customer's WhatsApp via the official Cloud API.
 * The PDF is generated server-side from the SAME HTML engine the preview uses
 * (doc-html.ts → WeasyPrint), so the customer sees exactly what the shop sees.
 *
 * Body:
 *   { docId, docType: 'invoice' | 'quotation' | 'service', customerPhone, caption? }
 *
 * Response:
 *   - If Cloud API configured → { success: true, messageId, channel: 'cloud' }
 *     The PDF is delivered automatically as a WhatsApp document message.
 *   - If Cloud API NOT configured → { success: false, error: 'cloud-api-not-configured',
 *     hint, fallbackUrl } — client should fall back to the manual download flow.
 */
export async function POST(req: NextRequest) {
  try {
    // v12.6: Rate-limit this endpoint — each call spawns WeasyPrint (50 MB
    // RSS) and uploads to Meta (billed per message). Without a limiter a
    // compromised PIN could exhaust server memory or run up the WhatsApp
    // Cloud API bill in minutes.
    const ip = getClientIp(req)
    const writeCheck = writeLimiter(ip)
    if (!writeCheck.allowed) {
      return NextResponse.json({ error: 'Rate limited — too many PDF sends. Try again in a minute.' }, { status: 429 })
    }

    if (!isConfigured()) {
      return NextResponse.json({ error: 'Firebase not configured' }, { status: 503 })
    }

    if (!isCloudApiConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'cloud-api-not-configured',
        hint: 'Set WA_TOKEN and WA_PHONE_NUMBER_ID env vars in your Render/Vercel dashboard to enable direct PDF sharing. Without this, the PDF must be downloaded and attached manually.',
      }, { status: 200 }) // 200 so client treats it as a soft-error, not a crash
    }

    const body = await req.json()
    const { docId, docType, customerPhone, caption } = body
    if (!docId || !docType) {
      return NextResponse.json({ error: 'docId and docType are required' }, { status: 400 })
    }

    const phone = normalizePhone(String(customerPhone || ''))
    if (!phone || phone.length < 10) {
      return NextResponse.json({ error: 'A valid customer phone number is required' }, { status: 400 })
    }

    // Render the same HTML the preview shows.
    const shopRows = await listRows<any>('Shop', { useCache: true })
    const shop = shopRows[0] || { name: 'Smart Computers' }
    const sheetName = docType === 'quotation' ? 'Quotations' : docType === 'service' ? 'Jobs' : 'Invoices'
    const row = await getRow<any>(sheetName, String(docId))
    if (!row) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const productImages = await loadProductImages()
    const templateId = String(row.template || shop.pdfTemplate || 'tally-classic')
    const gstMode = String(row.gstMode || 'gst') === 'non-gst' ? 'non-gst' : 'gst'

    let pdfDocData: any
    if (docType === 'invoice') {
      const items = safeJsonParse<any[]>(row.itemsJson, []) as LineItem[]
      const calc = computeInvoice(items, {
        courierCharges: Number(row.courierCharges) || 0,
        otherCharges: Number(row.otherCharges) || 0,
        discount: Number(row.discount) || 0,
      })
      pdfDocData = {
        number: String(row.number || ''),
        date: new Date(row.date || row.createdAt || Date.now()),
        shop: buildShop(shop),
        customer: {
          name: String(row.customerName || ''),
          phone: String(row.customerPhone || ''),
          gstNumber: String(row.customerGstin || ''),
        },
        calc,
        notes: String(row.notes || ''),
        terms: String(shop.termsInvoice || ''),
        amountPaid: Number(row.amountPaid) || 0,
        amountDue: Number(row.amountDue) || 0,
        paymentType: String(row.paymentType || ''),
        paymentStatus: String(row.paymentStatus || ''),
        docType: 'invoice',
        templateId,
        adBannerVariant: 'flyer',
        productImages,
        gstMode,
      }
    } else if (docType === 'quotation') {
      const items = safeJsonParse<any[]>(row.itemsJson, []) as LineItem[]
      const calc = computeInvoice(items, {
        courierCharges: Number(row.courierCharges) || 0,
        otherCharges: Number(row.otherCharges) || 0,
        discount: Number(row.discount) || 0,
      })
      pdfDocData = {
        number: String(row.number || ''),
        date: new Date(row.date || row.createdAt || Date.now()),
        validTill: row.validTill ? new Date(row.validTill) : undefined,
        shop: buildShop(shop),
        customer: {
          name: String(row.customerName || ''),
          phone: String(row.customerPhone || ''),
          gstNumber: String(row.customerGstin || ''),
        },
        calc,
        notes: String(row.notes || ''),
        terms: String(shop.termsQuotation || ''),
        docType: 'quotation',
        templateId,
        adBannerVariant: 'flyer',
        productImages,
        gstMode,
      }
    } else {
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
      const calc = computeInvoice(finalLineItems, { courierCharges: 0, otherCharges: 0, discount: 0 })
      const jobTotal = Number(job.finalAmount) || Number(job.estimatedAmount) || calc.grandTotal
      const paid = (Number(job.paidAmount) || 0) + (Number(job.advanceAmount) || 0)
      pdfDocData = {
        number: `INV-${String(job.jobId || docId)}`,
        date: new Date(job.createdAt || job.date || Date.now()),
        shop: buildShop(shop),
        customer: {
          name: String(job.customerName || 'Walk-in Customer'),
          phone: String(job.customerMobile || ''),
          address: String(job.customerAddress || ''),
        },
        calc: { ...calc, grandTotal: jobTotal },
        notes: String(job.diagnosisNotes || job.notes || `Service completed for ${job.deviceType || 'device'}. Problem: ${job.problemDesc || ''}`),
        terms: String(shop.termsInvoice || 'Parts warranty as per manufacturer. Please collect device within 30 days.'),
        amountPaid: paid,
        amountDue: Math.max(0, jobTotal - paid),
        paymentType: String(job.paymentMode || 'cash'),
        paymentStatus: paid >= jobTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        docType: 'service',
        templateId,
        adBannerVariant: 'flyer',
        productImages,
        gstMode,
        ...(job as any),
      }
    }

    const html = await generateInvoiceHtml(pdfDocData, String(docId))

    // v12.6: Probe WeasyPrint once and cache the result. If it's missing,
    // return a typed error so the client can fall back gracefully instead
    // of getting a confusing 500 from execFile ENOENT.
    if (!(await isWeasyPrintAvailable())) {
      return NextResponse.json(
        { success: false, error: 'weasyprint-not-installed', hint: 'WeasyPrint binary not found on the server. Install it (pip install weasyprint) and set WEASYPRINT_BIN env var.' },
        { status: 501 },
      )
    }

    // Convert HTML → PDF via WeasyPrint (same engine the new POST /api/doc-html
    // uses, so the PDF matches the on-screen preview).
    const WEASYPRINT_BIN = process.env.WEASYPRINT_BIN || '/home/z/.venv/bin/weasyprint'
    let pdfBuffer: Buffer
    let tmpDir: string | null = null
    try {
      tmpDir = await mkdtemp(join(tmpdir(), 'smartcomp-wa-'))
      const htmlPath = join(tmpDir, 'doc.html')
      const pdfPath = join(tmpDir, 'doc.pdf')
      await writeFile(htmlPath, html, 'utf-8')
      await execFileAsync(WEASYPRINT_BIN, [htmlPath, pdfPath], {
        timeout: 45000,
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
      })
      pdfBuffer = await readFile(pdfPath)
      if (!pdfBuffer || pdfBuffer.length < 1000) {
        throw new Error('WeasyPrint produced an empty or too-small PDF')
      }
    } finally {
      if (tmpDir) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      }
    }

    // Send the PDF via WhatsApp Cloud API.
    const docNumber = String(row.number || row.jobId || docId)
    const filename = `${docType === 'invoice' ? 'Invoice' : docType === 'quotation' ? 'Quotation' : 'Service-Invoice'}-${docNumber}.pdf`
    const finalCaption = String(caption || `${shop.name || 'Smart Computers'} • ${docType === 'invoice' ? 'Invoice' : docType === 'quotation' ? 'Quotation' : 'Service Invoice'} ${docNumber}`)

    const result = await sendPdfDocument(phone, pdfBuffer, filename, finalCaption)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      channel: 'cloud',
      messageId: result.messageId,
      phone,
      filename,
      pdfSizeBytes: pdfBuffer.length,
    })
  } catch (e: any) {
    console.error('[whatsapp/send-pdf] error:', e)
    return NextResponse.json({ error: e?.message || 'Failed to send PDF' }, { status: 500 })
  }
}

function buildShop(shop: any) {
  return {
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
  }
}
