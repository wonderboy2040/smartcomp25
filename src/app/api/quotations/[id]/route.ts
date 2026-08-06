import { NextRequest, NextResponse } from 'next/server'
import { getRow, deleteRow, updateRow, createRow, listRows, bulkUpdate } from '@/lib/sheets-client'
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
    const newItems = rawItems.map((i: any) => ({
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
    }))

    const computed = computeInvoice(newItems, {
      courierCharges: Number(body.courierCharges) || 0,
      otherCharges: Number(body.otherCharges) || 0,
      discount: Number(body.discount) || 0,
    })

    const updated = await updateRow('Quotations', id, {
      customerId: String(body.customerId || existing.customerId || ''),
      customerName: String(body.customerName || existing.customerName || ''),
      customerPhone: String(body.customerPhone || existing.customerPhone || ''),
      customerGstin: String(body.customerGstin || existing.customerGstin || ''),
      date: body.date || existing.date,
      validTill: body.validTill || existing.validTill,
      itemsJson: JSON.stringify(newItems),
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
      const calc = computeInvoice(items, {
        courierCharges: Number(q.courierCharges) || 0,
        otherCharges: Number(q.otherCharges) || 0,
        discount: Number(q.discount) || 0,
      })

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

      // Create invoice
      const invoice = await createRow('Invoices', {
        number,
        customerId: String(q.customerId || ''),
        customerName: String(q.customerName || ''),
        customerPhone: String(q.customerPhone || ''),
        customerGstin: String(q.customerGstin || ''),
        date: new Date().toISOString(),
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
      })

      // v11.2: record the payment in the Payments ledger (was silently missing)
      if (clampedPaid > 0) {
        await createRow('Payments', {
          invoiceId: String(invoice.id || ''),
          invoiceNumber: number,
          customerName: String(q.customerName || ''),
          amount: clampedPaid,
          type: payTypeLabel,
          date: new Date().toISOString(),
          notes: clampedPaid >= calc.grandTotal ? 'Full payment at quotation conversion' : 'Partial payment at quotation conversion',
        }).catch(() => {})
      }

      // Update quotation
      await updateRow('Quotations', id, { status: 'converted', convertedToInvoiceId: String(invoice.id || '') })

      // PERFORMANCE: Batch stock deduction via bulkUpdate (only if requested)
      if (deductStock) {
        const uniqueItems = new Map<string, number>()
        for (const item of calc.items) {
          if (item.itemId) {
            uniqueItems.set(String(item.itemId), (uniqueItems.get(String(item.itemId)) || 0) + item.quantity)
          }
        }
        if (uniqueItems.size > 0) {
          const itemIds = Array.from(uniqueItems.keys())
          const dbItems = await Promise.all(itemIds.map((id) => getRow<any>('Items', id).catch(() => null)))
          const stockUpdates: { id: string; data: any }[] = []
          for (let i = 0; i < itemIds.length; i++) {
            if (dbItems[i]) {
              stockUpdates.push({
                id: itemIds[i],
                data: { quantity: Math.max(0, (Number(dbItems[i].quantity) || 0) - (uniqueItems.get(itemIds[i]) || 0)) },
              })
            }
          }
          if (stockUpdates.length > 0) await bulkUpdate('Items', stockUpdates)
        }
      }

      // Update customer credit (only the unpaid portion)
      if (due > 0 && q.customerId) {
        const customer = await getRow<any>('Customers', String(q.customerId))
        if (customer) {
          const currentCredit = Number(customer.creditBalance) || 0
          await updateRow('Customers', String(q.customerId), { creditBalance: currentCredit + due })
        }
      }

      return NextResponse.json({ success: true, invoiceId: invoice.id, invoiceNumber: number, amountPaid: clampedPaid, amountDue: due })
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
