import { NextRequest, NextResponse } from 'next/server'
import { getRow, deleteRow, updateRow, createRow, listRows, bulkUpdate } from '@/lib/sheets-client'
import { computeInvoice } from '@/lib/calc'
import { safeJsonParse } from '@/lib/utils'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const invoice = await getRow<any>('Invoices', id)
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const payments = await listRows<any>('Payments')
    return NextResponse.json({
      ...invoice,
      customer: {
        id: invoice.customerId,
        name: invoice.customerName,
        phone: invoice.customerPhone,
        gstNumber: invoice.customerGstin,
      },
      payments: payments.filter((p) => p.invoiceId === id),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

// PUT /api/invoices/[id] — Edit an existing invoice
// Uses bulkUpdate for batch stock adjustments instead of sequential calls.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    const existing = await getRow<any>('Invoices', id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Parse old items to compute stock delta
    const oldItems = safeJsonParse<any[]>(existing.itemsJson, [])

    // Build new items from body — if items not provided, keep the existing
    // ones (allows partial edits like recording a payment without wiping totals)
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

    // Recompute totals
    const computed = computeInvoice(newItems, {
      courierCharges: Number(body.courierCharges) || 0,
      otherCharges: Number(body.otherCharges) || 0,
      discount: Number(body.discount) || 0,
    })

    // TRANSACTIONAL stock update: compute net delta per itemId
    const delta = new Map<string, number>()
    for (const item of oldItems) {
      if (item.itemId) delta.set(String(item.itemId), (delta.get(String(item.itemId)) || 0) + (Number(item.quantity) || 0))
    }
    for (const item of newItems) {
      if (item.itemId) delta.set(String(item.itemId), (delta.get(String(item.itemId)) || 0) - (Number(item.quantity) || 0))
    }

    // PERFORMANCE: Use bulkUpdate for stock adjustments
    const stockItemIds = Array.from(delta.entries()).filter(([, d]) => d !== 0).map(([id]) => id)
    if (stockItemIds.length > 0) {
      const dbItems = await Promise.all(stockItemIds.map((itemId) => getRow<any>('Items', itemId)))
      const stockUpdates: { id: string; data: any }[] = []
      for (let i = 0; i < stockItemIds.length; i++) {
        const dbItem = dbItems[i]
        if (dbItem) {
          const d = delta.get(stockItemIds[i]) || 0
          stockUpdates.push({
            id: stockItemIds[i],
            data: { quantity: Math.max(0, (Number(dbItem.quantity) || 0) + d) },
          })
        }
      }
      if (stockUpdates.length > 0) await bulkUpdate('Items', stockUpdates)
    }

    // v11.2: allow the paid amount to be changed while editing the invoice.
    // If the user increases the paid amount, a Payments entry is recorded for
    // the delta (keeps the ledger consistent). Decreasing paid amount is not
    // allowed here — delete the payment row instead (it reverses balances).
    const oldPaid = Number(existing.amountPaid) || 0
    const newPaid = body.amountPaid !== undefined
      ? Math.max(0, Number(body.amountPaid) || 0)
      : oldPaid
    const paidDelta = newPaid - oldPaid

    if (paidDelta > 0) {
      const payType = String(body.paymentType || existing.paymentType || 'cash').toLowerCase()
      const type = payType.includes('upi') ? 'UPI'
        : payType.includes('card') ? 'Card'
        : payType.includes('cheque') ? 'Cheque'
        : payType.includes('bank') || payType.includes('transfer') || payType.includes('neft') ? 'Bank Transfer'
        : 'Cash'
      await createRow('Payments', {
        invoiceId: id,
        invoiceNumber: String(existing.number || ''),
        customerName: String(existing.customerName || ''),
        amount: paidDelta,
        type,
        date: body.date || new Date().toISOString(),
        notes: 'Payment recorded while editing invoice',
      }).catch(() => {})
    } else if (paidDelta < 0) {
      // v11.3: user REDUCED the paid amount while editing. Soft-delete the
      // most recent payment rows until |paidDelta| is recovered, so the
      // Payments ledger always matches the invoice's amountPaid.
      try {
        const allPayments = await listRows<any>('Payments')
        const invoicePays = allPayments
          .filter((p) => String(p.invoiceId) === String(id))
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        let toReverse = Math.abs(paidDelta)
        for (const p of invoicePays) {
          if (toReverse <= 0) break
          await deleteRow('Payments', String(p.id)).catch(() => {})
          toReverse -= Number(p.amount) || 0
        }
      } catch {}
    }

    // Adjust customer credit balance
    const oldDue = Number(existing.amountDue) || 0
    const newDue = computed.grandTotal - newPaid
    const dueDiff = newDue - oldDue
    if (dueDiff !== 0 && existing.customerId) {
      const customer = await getRow<any>('Customers', String(existing.customerId))
      if (customer) {
        const currentCredit = Number(customer.creditBalance) || 0
        await updateRow('Customers', String(existing.customerId), {
          creditBalance: Math.max(0, currentCredit + dueDiff),
        })
      }
    }

    // Recompute paymentStatus
    const newStatus = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid'

    // Update invoice
    const updated = await updateRow('Invoices', id, {
      customerId: String(body.customerId || existing.customerId || ''),
      customerName: String(body.customerName || existing.customerName || ''),
      customerPhone: String(body.customerPhone || existing.customerPhone || ''),
      customerGstin: String(body.customerGstin || existing.customerGstin || ''),
      date: body.date || existing.date,
      itemsJson: JSON.stringify(computed.items),
      subtotal: computed.subtotal,
      gstAmount: computed.gstAmount,
      courierCharges: computed.courierCharges,
      otherCharges: computed.otherCharges,
      discount: computed.discount,
      grandTotal: computed.grandTotal,
      totalCost: computed.totalCost,
      profit: computed.profit,
      paymentType: body.paymentType || existing.paymentType,
      paymentStatus: newStatus,
      amountPaid: newPaid,
      amountDue: Math.max(0, newDue),
      notes: String(body.notes || existing.notes || ''),
      template: body.template || existing.template || 'tally-classic',
      gstMode: body.gstMode === 'non-gst' ? 'non-gst' : (body.gstMode === 'gst' ? 'gst' : (existing.gstMode || 'gst')),
    })

    return NextResponse.json(updated)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const invoice = await getRow<any>('Invoices', id)
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // PERFORMANCE: Parallel operations — restore stock, credit, and delete payments
    const items = safeJsonParse<any[]>(invoice.itemsJson, [])

    // Batch stock restore via bulkUpdate
    const uniqueItems = new Map<string, number>()
    for (const item of items) {
      if (item.itemId) {
        uniqueItems.set(String(item.itemId), (uniqueItems.get(String(item.itemId)) || 0) + (Number(item.quantity) || 0))
      }
    }

    const restoreOps: Promise<any>[] = []

    // Stock restore
    if (uniqueItems.size > 0) {
      const itemIds = Array.from(uniqueItems.keys())
      const restoreStockOp = (async () => {
        const dbItems = await Promise.all(itemIds.map((itemId) => getRow<any>('Items', itemId)))
        const stockUpdates: { id: string; data: any }[] = []
        for (let i = 0; i < itemIds.length; i++) {
          const dbItem = dbItems[i]
          if (dbItem) {
            stockUpdates.push({
              id: itemIds[i],
              data: { quantity: (Number(dbItem.quantity) || 0) + (uniqueItems.get(itemIds[i]) || 0) },
            })
          }
        }
        if (stockUpdates.length > 0) await bulkUpdate('Items', stockUpdates)
      })()
      restoreOps.push(restoreStockOp)
    }

    // Restore customer credit balance
    if (Number(invoice.amountDue) > 0) {
      restoreOps.push(
        (async () => {
          const customer = await getRow<any>('Customers', String(invoice.customerId || ''))
          if (customer) {
            const currentCredit = Number(customer.creditBalance) || 0
            await updateRow('Customers', String(customer.id), {
              creditBalance: Math.max(0, currentCredit - Number(invoice.amountDue)),
            })
          }
        })()
      )
    }

    // Delete payments for this invoice
    restoreOps.push(
      (async () => {
        const payments = await listRows<any>('Payments')
        const invoicePayments = payments.filter((p) => p.invoiceId === id)
        await Promise.all(invoicePayments.map((p) => deleteRow('Payments', String(p.id))))
      })()
    )

    // Run all restore operations in parallel
    await Promise.all(restoreOps)

    // Delete the invoice itself
    await deleteRow('Invoices', id)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
