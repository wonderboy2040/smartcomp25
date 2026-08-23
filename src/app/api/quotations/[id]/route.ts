import { NextRequest, NextResponse } from 'next/server'
import { getRow, deleteRow, updateRow, createRow, listRows, bulkUpdate, convertQuotationToInvoice } from '@/lib/sheets-client'
import { computeInvoice, nextInvoiceNumber, type LineItem } from '@/lib/calc'
import { safeJsonParse } from '@/lib/utils'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const q = await getRow<any>('Quotations', id)
    if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      ...q,
      customer: {
        id: q.customerId,
        name: q.customerName,
        phone: q.customerPhone,
        gstNumber: q.customerGstin,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

// PUT /api/quotations/[id] — Edit an existing quotation
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    const existing = await getRow<any>('Quotations', id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const rawItems = Array.isArray(body.items)
      ? body.items
      : safeJsonParse<any[]>(existing.itemsJson, [])
    // Spread first, coerce after — the old whitelist dropped description,
    // specification, serial numbers and product keys on every edit.
    const newItems = rawItems.map((i: any) => ({
      ...i,
      itemId: i.itemId,
      name: i.name,
      sku: i.sku || '',
      hsnCode: i.hsnCode || '',
      quantity: Number(i.quantity) || 0,
      rate: Number(i.rate) || 0,
      discount: Number(i.discount) || 0,
      gstApplicable: i.gstApplicable === true || i.gstApplicable === 'true',
      gstRate: Number(i.gstRate) || 0,
      costPrice: Number(i.costPrice) || 0,
      serialNumbers: Array.isArray(i.serialNumbers) ? i.serialNumbers.filter(Boolean).map(String) : [],
      productKeys: Array.isArray(i.productKeys) ? i.productKeys.filter(Boolean).map(String) : [],
    }))

    const computed = computeInvoice(newItems, {
      courierCharges: Number(body.courierCharges) || 0,
      otherCharges: Number(body.otherCharges) || 0,
      discount: Number(body.discount) || 0,
      roundOff: body.roundOff === true,
    })

    // Same customer-swap fix as the invoice route: the form sends only an id.
    const oldCustomerId = String(existing.customerId || '')
    const newCustomerId = String(body.customerId || oldCustomerId)
    let customerFields = {
      customerName: String(body.customerName || existing.customerName || ''),
      customerPhone: String(body.customerPhone || existing.customerPhone || ''),
      customerGstin: String(body.customerGstin || existing.customerGstin || ''),
    }
    if (newCustomerId && newCustomerId !== oldCustomerId) {
      const picked = await getRow<any>('Customers', newCustomerId).catch(() => null)
      if (picked) {
        customerFields = {
          customerName: String(picked.name || ''),
          customerPhone: String(picked.phone || ''),
          customerGstin: String(picked.gstNumber || ''),
        }
      }
    }

    const updated = await updateRow('Quotations', id, {
      customerId: newCustomerId,
      ...customerFields,
      date: body.date || existing.date,
      validTill: body.validTill || existing.validTill,
      // Store the COMPUTED lines (amount / gstAmount / total per row) so an
      // edited quotation carries the same shape a freshly created one does.
      itemsJson: JSON.stringify(computed.items),
      subtotal: computed.subtotal,
      gstAmount: computed.gstAmount,
      courierCharges: computed.courierCharges,
      otherCharges: computed.otherCharges,
      discount: computed.discount,
      grandTotal: computed.grandTotal,
      notes: String(body.notes || existing.notes || ''),
      template: body.template || existing.template || 'tally-classic',
      gstMode: body.gstMode === 'non-gst' ? 'non-gst' : (body.gstMode === 'gst' ? 'gst' : (existing.gstMode || 'gst')),
    })

    return NextResponse.json(updated)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const action = body.action || 'convert'

    if (action === 'convert') {
      const q = await getRow<any>('Quotations', id)
      if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      if (String(q.status) === 'converted') {
        return NextResponse.json({ error: 'Quotation already converted' }, { status: 400 })
      }

      const items = safeJsonParse<any[]>(q.itemsJson, []) as LineItem[]
      const charges = {
        courierCharges: Number(q.courierCharges) || 0,
        otherCharges: Number(q.otherCharges) || 0,
        discount: Number(q.discount) || 0,
      }
      // Carry the quotation's rounding into the invoice, otherwise the customer
      // is billed a different total from the quote they accepted. There is no
      // roundOff column, so infer it from the stored total (see DocForm).
      const rawTotal = computeInvoice(items, charges).grandTotal
      const quotedTotal = Number(q.grandTotal) || 0
      const wasRounded =
        quotedTotal > 0 &&
        Math.abs(quotedTotal - Math.round(rawTotal)) < 0.005 &&
        Math.abs(quotedTotal - rawTotal) > 0.005
      const calc = computeInvoice(items, { ...charges, roundOff: wasRounded })

      // v11.2 ADVANCED CONVERT: optional payment at conversion + stock toggle
      const deductStock = body?.deductStock !== false
      const paid = Math.max(0, Number(body?.amountPaid) || 0)
      const clampedPaid = Math.min(paid, calc.grandTotal)
      const due = Math.max(0, calc.grandTotal - clampedPaid)
      const paymentType = String(body?.paymentType || (clampedPaid >= calc.grandTotal ? 'cash' : 'credit'))
      const payTypeLower = paymentType.toLowerCase()
      const payTypeLabel = payTypeLower.includes('upi') ? 'UPI'
        : payTypeLower.includes('card') ? 'Card'
        : payTypeLower.includes('cheque') ? 'Cheque'
        : payTypeLower.includes('bank') || payTypeLower.includes('transfer') || payTypeLower.includes('neft') ? 'Bank Transfer'
        : 'Cash'

      // Generate invoice number: SCSS/26-27/001
      const existingInvoices = await listRows<any>('Invoices')
      const number = await nextInvoiceNumber(existingInvoices.map((i) => ({ number: i.number })))

      // v12.8: Build the invoice + payment + stock + credit updates, then
      // commit them all in a single Firestore batch via convertQuotationToInvoice.
      // This fixes the silent-corruption bug where the old code did 5 separate
      // writes with `.catch(() => {})` on the payment create — partial failures
      // left the invoice "paid" with no payment row, stock not deducted, etc.
      const invoiceId = `inv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
      const now = new Date().toISOString()
      const invoiceRow: any = {
        id: invoiceId,
        number,
        customerId: String(q.customerId || ''),
        customerName: String(q.customerName || ''),
        customerPhone: String(q.customerPhone || ''),
        customerGstin: String(q.customerGstin || ''),
        date: now,
        itemsJson: q.itemsJson,
        subtotal: calc.subtotal,
        gstAmount: calc.gstAmount,
        courierCharges: calc.courierCharges,
        otherCharges: calc.otherCharges,
        discount: calc.discount,
        grandTotal: calc.grandTotal,
        totalCost: calc.totalCost,
        profit: calc.profit,
        paymentType,
        paymentStatus: due <= 0 ? 'paid' : clampedPaid > 0 ? 'partial' : 'unpaid',
        amountPaid: clampedPaid,
        amountDue: due,
        notes: String(q.notes || ''),
        template: String(body?.template || q.template || 'tally-classic'),
        gstMode: body?.gstMode === 'non-gst' ? 'non-gst' : (String(q.gstMode || 'gst')),
        shareToken: '',
        createdAt: now,
        deleted: false,
      }

      // Build payment row (if any) — committed atomically with the invoice.
      const paymentRow = clampedPaid > 0 ? {
        id: `pay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        invoiceId,
        invoiceNumber: number,
        customerName: String(q.customerName || ''),
        amount: clampedPaid,
        type: payTypeLabel,
        date: now,
        notes: clampedPaid >= calc.grandTotal ? 'Full payment at quotation conversion' : 'Partial payment at quotation conversion',
        createdAt: now,
        deleted: false,
      } : null

      // Build stock updates (if deductStock is true)
      let stockUpdates: { id: string; deductQty: number }[] = []
      if (deductStock) {
        const uniqueItems = new Map<string, number>()
        for (const item of calc.items) {
          if (item.itemId) {
            uniqueItems.set(String(item.itemId), (uniqueItems.get(String(item.itemId)) || 0) + item.quantity)
          }
        }
        for (const [itemId, qty] of uniqueItems.entries()) {
          stockUpdates.push({ id: itemId, deductQty: qty })
        }
      }

      // Build customer credit update (only the unpaid portion)
      let customerUpdate: { id: string; newCreditBalance: number } | null = null
      if (due > 0 && q.customerId) {
        const customer = await getRow<any>('Customers', String(q.customerId)).catch(() => null)
        if (customer) {
          const currentCredit = Number(customer.creditBalance) || 0
          customerUpdate = { id: String(q.customerId), newCreditBalance: currentCredit + due }
        }
      }

      // ATOMIC commit — all 5 writes succeed or all fail.
      await convertQuotationToInvoice({
        quotationId: id,
        quotation: q,
        invoiceNumber: number,
        invoiceId,
        invoiceRow,
        paymentRow,
        stockUpdates: stockUpdates.length > 0 ? stockUpdates : undefined,
        customerUpdate,
      })

      return NextResponse.json({ success: true, invoiceId, invoiceNumber: number, amountPaid: clampedPaid, amountDue: due })
    }

    if (action === 'updateStatus') {
      const q = await updateRow('Quotations', id, { status: String(body.status || '') })
      return NextResponse.json(q)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteRow('Quotations', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
