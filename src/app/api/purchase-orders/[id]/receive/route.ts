import { NextRequest, NextResponse } from 'next/server'
import { getRow, listRows, invalidateCache } from '@/lib/sheets-client'
import { getDb } from '@/lib/firebase'
import { safeJsonParse } from '@/lib/utils'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * POST /api/purchase-orders/:id/receive — Goods Receipt (GRN)
 *
 * Marks the PO as received and:
 *   - Adds each line's quantity to the matching Item's stock
 *   - Updates the item's costPrice to the latest purchase cost (only when a
 *     positive cost was quoted on the PO) so P&L stays accurate
 *   - Records supplier payable = PO grand total (amountDue)
 *
 * Returns { success, data, stockItemsAdded, payableAmount }
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = getClientIp(_req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited — too many writes, wait a moment' }, { status: 429 })

    const { id } = await params
    const po = await getRow('PurchaseOrders', id)
    if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    if (String(po.status) === 'received') {
      return NextResponse.json({ error: `${po.poNumber} is already received` }, { status: 400 })
    }

    const lineItems = safeJsonParse<any[]>(po.itemsJson, [])
    const itemsList = await listRows<any>('Items')
    const itemById = new Map(itemsList.map((i) => [String(i.id), i]))

    const db = await getDb()
    if (!db) throw new Error('Firebase not initialized')

    const batch = db.batch()
    let stockItemsAdded = 0
    let stockQuantityAdded = 0
    let costUpdated = 0

    for (const line of lineItems) {
      const itemId = String(line?.itemId || '')
      const qty = Number(line?.quantity) || 0
      if (!itemId || qty <= 0) continue

      const existingItem = itemById.get(itemId)
      const currentQty = Number(existingItem?.quantity) || 0
      stockItemsAdded += 1
      stockQuantityAdded += qty

      const itemUpdate: any = {
        quantity: currentQty + qty,
        lastPurchaseDate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const cost = Number(line?.costPrice) || 0
      if (cost > 0) {
        itemUpdate.costPrice = cost
        costUpdated += 1
      }
      batch.set(db.collection('Items').doc(itemId), itemUpdate, { merge: true })
    }

    if (stockItemsAdded === 0) {
      return NextResponse.json({ error: 'PO has no line items linked to stock — nothing to receive' }, { status: 400 })
    }

    const grandTotal = lineItems.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.costPrice) || 0), 0)
    const receivedAt = new Date().toISOString()

    batch.set(db.collection('PurchaseOrders').doc(String(id)), {
      status: 'received',
      receivedAt,
      stockItemsAdded,
      stockQuantityAdded,
      payableAmount: grandTotal,
      amountDue: grandTotal,
      updatedAt: receivedAt,
    }, { merge: true })

    await batch.commit()

    invalidateCache('Items')
    invalidateCache('PurchaseOrders')

    const updated = {
      ...po,
      status: 'received',
      receivedAt,
      stockItemsAdded,
      stockQuantityAdded,
      payableAmount: grandTotal,
      amountDue: grandTotal,
    }

    return NextResponse.json({
      success: true,
      data: updated,
      stockItemsAdded,
      stockQuantityAdded,
      costUpdated,
      payableAmount: grandTotal,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}