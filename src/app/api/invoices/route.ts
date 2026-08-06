import { NextRequest, NextResponse } from 'next/server'
import { listRows, createInvoiceUltra } from '@/lib/sheets-client'
import { computeInvoice, type LineItem } from '@/lib/calc'
import { apiLimiter, writeLimiter, getClientIp } from '@/lib/rate-limit'

// Normalize invoice paymentType → Payments sheet `type` label
function normalizePaymentType(raw: string): string {
  const t = String(raw || 'cash').toLowerCase()
  if (t.includes('upi')) return 'UPI'
  if (t.includes('card')) return 'Card'
  if (t.includes('cheque') || t.includes('check')) return 'Cheque'
  if (t.includes('neft') || t.includes('imps') || t.includes('transfer') || t.includes('bank')) return 'Bank Transfer'
  if (t.includes('credit')) return 'Credit'
  if (t.includes('cash')) return 'Cash'
  if (t.includes('wallet')) return 'Wallet'
  return 'Cash'
}

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const paymentType = url.searchParams.get('paymentType')
    const customerId = url.searchParams.get('customerId')
    const limit = parseInt(url.searchParams.get('limit') || '200')
    const search = url.searchParams.get('search')

    let invoices = await listRows<any>('Invoices')

    if (status) invoices = invoices.filter((i) => i.paymentStatus === status)
    if (paymentType) invoices = invoices.filter((i) => i.paymentType === paymentType)
    if (customerId) invoices = invoices.filter((i) => i.customerId === customerId)
    if (search) {
      const q = search.toLowerCase()
      invoices = invoices.filter(
        (i) =>
          String(i.number || '').toLowerCase().includes(q) ||
          String(i.customerName || '').toLowerCase().includes(q) ||
          String(i.customerPhone || '').toLowerCase().includes(q),
      )
    }

    invoices.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime())

    invoices = invoices.slice(0, limit).map((inv) => ({
      ...inv,
      customer: {
        id: inv.customerId,
        name: inv.customerName,
        phone: inv.customerPhone,
        gstNumber: inv.customerGstin,
      },
      subtotal: Number(inv.subtotal) || 0,
      gstAmount: Number(inv.gstAmount) || 0,
      courierCharges: Number(inv.courierCharges) || 0,
      otherCharges: Number(inv.otherCharges) || 0,
      discount: Number(inv.discount) || 0,
      grandTotal: Number(inv.grandTotal) || 0,
      totalCost: Number(inv.totalCost) || 0,
      profit: Number(inv.profit) || 0,
      amountPaid: Number(inv.amountPaid) || 0,
      amountDue: Number(inv.amountDue) || 0,
    }))

    return NextResponse.json(invoices, {
      headers: {
        'X-Ultra-Fast': 'true',
        'X-Version': '10.0',
        'X-RateLimit-Remaining': check.remaining.toString(),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const body = await req.json()
    const { customerId, items, courierCharges = 0, otherCharges = 0, discount = 0, paymentType = 'cash', amountPaid = 0, notes = '', date, deductStock = true, template, gstMode = 'gst' } = body

    if (!customerId) return NextResponse.json({ error: 'Customer required' }, { status: 400 })
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Items required' }, { status: 400 })

    // Compute totals client-side for INSTANT optimistic UI
    const calc = computeInvoice(items as LineItem[], { courierCharges, otherCharges, discount })
    const paid = Number(amountPaid) || 0
    const due = Math.max(0, calc.grandTotal - paid)

    // v11.2 FIX: when the user pays AT invoice creation, createInvoiceUltra
    // ONLY writes a Payments row when it receives a `payment` object — plain
    // amountPaid just set the invoice field and the money vanished from the
    // payments ledger. Build the payment object here so Cash/UPI/Card paid at
    // creation is recorded instantly in the same single call.
    const payType = normalizePaymentType(String(paymentType || (paid >= calc.grandTotal ? 'cash' : 'credit')))
    const payment = paid > 0
      ? {
          amount: paid,
          type: payType,
          date: date || new Date().toISOString(),
          notes: paid >= calc.grandTotal ? 'Full payment at invoice creation' : 'Partial payment at invoice creation',
        }
      : undefined

    // Prepare stock updates for ultra fast transaction
    const stockUpdates: { id: string; deductQty: number }[] = []
    if (deductStock) {
      const qtyMap = new Map<string, number>()
      for (const item of calc.items) {
        if (item.itemId) {
          qtyMap.set(item.itemId, (qtyMap.get(item.itemId) || 0) + item.quantity)
        }
      }
      for (const [id, qty] of qtyMap.entries()) {
        stockUpdates.push({ id, deductQty: qty })
      }
    }

    // ULTRA-ULTRA FAST v6.0: Single call does EVERYTHING - customer fetch + number generation + invoice + stock + customer credit + payment
    // No need to fetch customer or list invoices separately - server does it all in one Apps Script execution
    // This is CLIENT-SIDE NUMBER GENERATION ELIMINATED - server generates number
    const result = await createInvoiceUltra({
      customerId,
      items, // Pass raw items, server will compute too for safety
      itemsJson: JSON.stringify(calc.items),
      subtotal: calc.subtotal,
      gstAmount: calc.gstAmount,
      courierCharges: calc.courierCharges,
      otherCharges: calc.otherCharges,
      discount: calc.discount,
      grandTotal: calc.grandTotal,
      totalCost: calc.totalCost,
      profit: calc.profit,
      paymentType: paymentType || (paid >= calc.grandTotal ? 'cash' : 'credit'),
      paymentStatus: paid >= calc.grandTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      amountPaid: paid,
      amountDue: due,
      notes: notes || '',
      date: date || new Date().toISOString(),
      stockUpdates: stockUpdates.length > 0 ? stockUpdates : undefined,
      payment,
      template: template || 'tally-classic',
      gstMode: gstMode === 'non-gst' ? 'non-gst' : 'gst',
      // Server will fetch customer and generate number
    })

    const elapsed = Date.now() - startTime

    return NextResponse.json({
      ...result.data,
      ultraFast: true,
      ultraUltraFast: true,
      version: '6.0',
      elapsedMs: elapsed,
      operationsSaved: '7 calls -> 1 call = 7x faster',
      clientSideNumberGenEliminated: true,
    }, {
      headers: {
        'X-Ultra-Fast': 'true',
        'X-Ultra-Ultra-Fast': 'true',
        'X-Elapsed-Ms': elapsed.toString(),
        'X-Version': '6.0',
        'X-Operations': '1',
      }
    })
  } catch (e: any) {
    console.error('Invoice ultra ultra fast error:', e)
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
