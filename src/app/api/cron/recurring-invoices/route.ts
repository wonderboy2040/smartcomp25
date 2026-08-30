import { NextRequest, NextResponse } from 'next/server'
import { listRows, updateRow, createRow, getRow } from '@/lib/sheets-client'
import { cronLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * /api/cron/recurring-invoices  (GET and POST)
 *
 * v13 NEW FEATURE: Recurring / Subscription Invoices.
 *
 * Runs daily (suggested 9 AM). Scans all AMC contracts with `autoInvoice: true`.
 * For each contract that is due (nextInvoiceDate <= today), generates an invoice
 * with the AMC fee as the line item, marks the contract's nextInvoiceDate
 * forward by one frequency period, and records an audit row in
 * `RecurringInvoices` collection so shop owners can track which invoices were
 * auto-generated.
 *
 * SECURITY: Same CRON_SECRET / VERCEL_CRON_SECRET scheme as other cron routes.
 */

function verifyCron(req: NextRequest, allowDevBypass: boolean): NextResponse | null {
  const ip = getClientIp(req)
  const check = cronLimiter(ip)
  if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const secrets = [process.env.CRON_SECRET, process.env.VERCEL_CRON_SECRET].filter(Boolean) as string[]
  if (secrets.length === 0) {
    if (process.env.NODE_ENV === 'production' || !allowDevBypass) {
      return NextResponse.json(
        { error: 'No CRON_SECRET or VERCEL_CRON_SECRET configured — cron disabled' },
        { status: 503 },
      )
    }
    console.warn('[cron/recurring-invoices] No cron secret set (dev mode) — allowing request')
    return null
  }
  const authHeader = req.headers.get('authorization') || ''
  const ok = secrets.some((s) => authHeader === `Bearer ${s}`)
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}

function advanceDate(input: Date, frequency: string): Date {
  const d = new Date(input)
  switch (frequency) {
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      break
    case 'quarterly':
      d.setMonth(d.getMonth() + 3)
      break
    case 'half-yearly':
      d.setMonth(d.getMonth() + 6)
      break
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1)
      break
    default:
      d.setMonth(d.getMonth() + 1)
  }
  return d
}

async function generateInvoiceNumber(): Promise<string> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const fyStart = month >= 4 ? year : year - 1
  const fyEnd = fyStart + 1
  const fyShort = `${String(fyStart).slice(2)}-${String(fyEnd).slice(2)}`
  const existing = await listRows<any>('Invoices').catch(() => [])
  const fyCount = existing.filter((i) => String(i.number || '').includes(fyShort)).length
  return `SCSS/${fyShort}/${String(fyCount + 1).padStart(4, '0')}`
}

async function runRecurringCron() {
  try {
    const contracts = await listRows<any>('AMCContracts')
    const shops = await listRows<any>('Shop')
    const shop = shops[0] || {}
    const shopName = String(shop.name || 'Smart Computers')
    const shopPhone = String(shop.phone || '')
    const shopGstin = String(shop.gstNumber || '')
    const shopUpi = String(shop.upiId || '')
    const shopAddress = String(shop.address || '')

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let invoicesCreated = 0
    let skipped = 0

    for (const c of contracts) {
      // Only process auto-invoice-enabled contracts
      if (!c.autoInvoice || c.autoInvoice !== true && c.autoInvoice !== 'true') {
        skipped++
        continue
      }
      if (String(c.status) !== 'active') {
        skipped++
        continue
      }

      const nextDate = c.nextInvoiceDate ? new Date(c.nextInvoiceDate) : null
      if (!nextDate || nextDate > today) {
        skipped++
        continue
      }

      // Generate invoice
      const fee = Number(c.fee) || 0
      if (fee <= 0) {
        skipped++
        continue
      }

      const invoiceNumber = await generateInvoiceNumber()
      const invoiceId = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const nowIso = new Date().toISOString()

      const invoiceRow = {
        id: invoiceId,
        number: invoiceNumber,
        customerId: String(c.customerId || ''),
        customerName: String(c.customerName || ''),
        customerPhone: String(c.customerPhone || ''),
        customerAddress: String(c.customerAddress || ''),
        customerGstin: '',
        engineerId: '',
        engineerName: '',
        itemsJson: JSON.stringify([
          {
            name: `AMC Service — ${c.contractNumber || 'Contract'}`,
            description: `Devices covered: ${(c.devicesCoveredJson ? JSON.parse(c.devicesCoveredJson).length : 0)} device(s). Frequency: ${c.frequency || 'monthly'}`,
            quantity: 1,
            rate: fee,
            gstRate: 0,
            amount: fee,
            total: fee,
            cost: 0,
            profit: fee,
          },
        ]),
        subtotal: fee,
        gstAmount: 0,
        gstRate: 0,
        courierCharges: 0,
        otherCharges: 0,
        discount: 0,
        roundOff: false,
        grandTotal: fee,
        totalCost: 0,
        profit: fee,
        paymentType: 'credit',
        paymentStatus: 'unpaid',
        amountPaid: 0,
        amountDue: fee,
        notes: `Auto-generated from AMC contract ${c.contractNumber || c.id}`,
        date: nowIso,
        template: 'tally-classic',
        gstMode: 'non-gst',
        isRecurring: true,
        sourceAmcId: String(c.id || ''),
        sourceContractNumber: String(c.contractNumber || ''),
      }

      try {
        await createRow('Invoices', invoiceRow)

        // Record in audit collection
        await createRow('RecurringInvoices', {
          invoiceId,
          invoiceNumber,
          contractId: String(c.id || ''),
          contractNumber: String(c.contractNumber || ''),
          customerId: String(c.customerId || ''),
          customerName: String(c.customerName || ''),
          customerPhone: String(c.customerPhone || ''),
          amount: fee,
          frequency: c.frequency || 'monthly',
          generatedAt: nowIso,
          shopName,
          shopPhone,
          shopGstin,
          shopUpi,
          shopAddress,
        })

        // Advance nextInvoiceDate
        const newNextDate = advanceDate(nextDate, String(c.frequency || 'monthly'))
        await updateRow('AMCContracts', String(c.id), {
          nextInvoiceDate: newNextDate.toISOString(),
          lastInvoiceDate: nowIso,
        })

        invoicesCreated++
      } catch (e: any) {
        console.error(`[cron/recurring-invoices] Failed for contract ${c.id}:`, e?.message)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Recurring invoices cron complete: ${invoicesCreated} created, ${skipped} skipped`,
      invoicesCreated,
      skipped,
      processedContracts: contracts.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = verifyCron(req, true)
  if (denied) return denied
  return runRecurringCron()
}

export async function GET(req: NextRequest) {
  const denied = verifyCron(req, false)
  if (denied) return denied
  return runRecurringCron()
}
