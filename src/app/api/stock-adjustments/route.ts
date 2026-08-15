import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, getRow } from '@/lib/sheets-client'
import { getDb } from '@/lib/firebase'
import { writeLimiter, apiLimiter, getClientIp } from '@/lib/rate-limit'
import { invalidateCache } from '@/lib/sheets-client'

/**
 * GET /api/stock-adjustments?itemId=xxx
 *   List all stock adjustments (stock-take entries).
 *
 * POST /api/stock-adjustments
 *   Create a stock adjustment: { itemId, adjustmentType, quantity, reason, notes }
 *   - adjustmentType: 'set' | 'add' | 'subtract'
 *   - 'set': set absolute quantity (stock-take reconciliation)
 *   - 'add': add quantity (found extra stock, returns without invoice)
 *   - 'subtract': remove quantity (damage, theft, loss, expiry)
 *   - reason: 'damage' | 'theft' | 'loss' | 'expiry' | 'correction' | 'found' | 'other'
 *   - Updates the Item's quantity in a single batch write
 */

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const itemId = url.searchParams.get('itemId')

    let adjustments = await listRows<any>('StockAdjustments')
    if (itemId) {
      adjustments = adjustments.filter((a) => String(a.itemId) === String(itemId))
    }
    adjustments.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())

    return NextResponse.json(adjustments)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited — too many writes, wait a moment' }, { status: 429 })

    const body = await req.json()
    const { itemId, adjustmentType, quantity, reason, notes } = body

    if (!itemId) return NextResponse.json({ error: 'Item is required' }, { status: 400 })
    const adjType = String(adjustmentType || 'set')
    if (!['set', 'add', 'subtract'].includes(adjType)) {
      return NextResponse.json({ error: 'Invalid adjustment type' }, { status: 400 })
    }
    const qty = Number(quantity)
    if (isNaN(qty) || qty < 0) {
      return NextResponse.json({ error: 'Quantity must be a non-negative number' }, { status: 400 })
    }
    const validReasons = ['damage', 'theft', 'loss', 'expiry', 'correction', 'found', 'other']
    const reasonStr = String(reason || 'correction')
    if (!validReasons.includes(reasonStr)) {
      return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
    }

    const item = await getRow<any>('Items', String(itemId))
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const oldQty = Number(item.quantity) || 0
    let newQty = oldQty
    let change = 0

    if (adjType === 'set') {
      newQty = qty
      change = newQty - oldQty
    } else if (adjType === 'add') {
      newQty = oldQty + qty
      change = qty
    } else if (adjType === 'subtract') {
      newQty = Math.max(0, oldQty - qty)
      change = newQty - oldQty
    }

    const db = await getDb()
    if (!db) throw new Error('Firebase not initialized')

    const batch = db.batch()

    const adjId = `adj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const adjustmentRow = {
      id: adjId,
      itemId: String(itemId),
      itemName: String(item.name || ''),
      sku: String(item.sku || ''),
      adjustmentType: adjType,
      previousQty: oldQty,
      newQty,
      change,
      reason: reasonStr,
      notes: String(notes || ''),
      createdAt: new Date().toISOString(),
      deleted: false,
    }
    batch.set(db.collection('StockAdjustments').doc(adjId), adjustmentRow)
    batch.set(db.collection('Items').doc(String(itemId)), {
      quantity: newQty,
      updatedAt: new Date().toISOString(),
    }, { merge: true })

    await batch.commit()
    invalidateCache('Items')
    invalidateCache('StockAdjustments')

    return NextResponse.json({ ...adjustmentRow, success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
