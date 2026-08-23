import { NextRequest, NextResponse } from 'next/server'
import { getRow, deleteRow, updateRow, createRow, listRows, bulkUpdate, deleteInvoiceAtomic } from '@/lib/sheets-client'
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
    // Spread the incoming line FIRST, then coerce the numeric/boolean fields.
    // The old whitelist silently dropped description, specification, serial
    // numbers and digital product keys, so editing an invoice erased the very
    // things the customer needs on the printed copy.
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

    // Recompute totals
    const computed = computeInvoice(newItems, {
      courierCharges: Number(body.courierCharges) || 0,
      otherCharges: Number(body.otherCharges) || 0,
      discount: Number(body.discount) || 0,
      roundOff: body.roundOff === true,
    })

    // TRANSACTIONAL stock update: compute net delta per itemId
    // Only adjust stock if items actually changed
    const delta = new Map<string, number>()
    for (const item of oldItems) {
      if (item.itemId && Number(item.quantity) > 0) {
        delta.set(String(item.itemId), (delta.get(String(item.itemId)) || 0) + (Number(item.quantity) || 0))
      }
    }
    for (const item of newItems) {
      if (item.itemId && Number(item.quantity) > 0) {
        delta.set(String(item.itemId), (delta.get(String(item.itemId)) || 0) - (Number(item.quantity) || 0))
      }
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

    // The form only sends customerId. When the user picks a DIFFERENT customer
    // while editing, the stored name/phone/GSTIN belonged to the old one and
    // the invoice printed the wrong party — resolve the row and refresh them.
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

    // Adjust customer credit balance. If the invoice moved to another customer,
    // the whole outstanding moves with it instead of being netted on the old one.
    const oldDue = Number(existing.amountDue) || 0
    const newDue = computed.grandTotal - newPaid
    const adjustCredit = async (customerId: string, delta: number) => {
      if (!customerId || delta === 0) return
      const customer = await getRow<any>('Customers', customerId).catch(() => null)
      if (!customer) return
      await updateRow('Customers', customerId, {
        creditBalance: Math.max(0, (Number(customer.creditBalance) || 0) + delta),
      })
    }
    if (newCustomerId !== oldCustomerId) {
      await adjustCredit(oldCustomerId, -oldDue)
      await adjustCredit(newCustomerId, Math.max(0, newDue))
    } else {
      await adjustCredit(oldCustomerId, newDue - oldDue)
    }

    // Recompute paymentStatus
    const newStatus = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid'

    // Update invoice
    const updated = await updateRow('Invoices', id, {
      customerId: newCustomerId,
      ...customerFields,
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

    // v12.8: ATOMIC delete — all 4 operations (soft-delete invoice, restore
    // stock, reduce customer credit, delete payments) commit in a single
    // Firestore batch. Either ALL succeed or NONE do. Previously the code
    // did `Promise.all(restoreOps)` THEN deleted the invoice — if the
    // invoice delete failed, restores were already committed, leaving the
    // books inconsistent (stock restored + credit reduced + payments gone,
    // but invoice still showing as unpaid).
    const items = safeJsonParse<any[]>(invoice.itemsJson, [])

    // Build stock restore list
    const uniqueItems = new Map<string, number>()
    for (const item of items) {
      if (item.itemId) {
        uniqueItems.set(String(item.itemId), (uniqueItems.get(String(item.itemId)) || 0) + (Number(item.quantity) || 0))
      }
    }
    const stockRestores: { id: string; restoreQty: number }[] = []
    for (const [itemId, qty] of uniqueItems.entries()) {
      stockRestores.push({ id: itemId, restoreQty: qty })
    }

    // Build customer credit update
    let customerUpdate: { id: string; newCreditBalance: number } | null = null
    if (Number(invoice.amountDue) > 0 && invoice.customerId) {
      const customer = await getRow<any>('Customers', String(invoice.customerId)).catch(() => null)
      if (customer) {
        const currentCredit = Number(customer.creditBalance) || 0
        customerUpdate = {
          id: String(invoice.customerId),
          newCreditBalance: Math.max(0, currentCredit - Number(invoice.amountDue)),
        }
      }
    }

    // Find payment IDs to soft-delete
    let paymentIdsToDelete: string[] = []
    const payments = await listRows<any>('Payments').catch(() => [])
    paymentIdsToDelete = payments
      .filter((p) => String(p.invoiceId || '') === String(id))
      .map((p) => String(p.id))
      .filter(Boolean)

    // ATOMIC commit
    const result = await deleteInvoiceAtomic({
      invoiceId: id,
      invoice,
      stockRestores: stockRestores.length > 0 ? stockRestores : undefined,
      customerUpdate,
      paymentIdsToDelete: paymentIdsToDelete.length > 0 ? paymentIdsToDelete : undefined,
    })

    return NextResponse.json({
      success: true,
      restoredStock: result.restoredStock,
      deletedPayments: result.deletedPayments,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
