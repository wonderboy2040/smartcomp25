import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, isConfigured } from '@/lib/sheets-client'
import { apiLimiter, writeLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * Stock Movement History API
 * Tracks all stock changes: sales, purchases, adjustments, returns
 * Provides audit trail for inventory management
 */

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    if (!isConfigured()) return NextResponse.json([])

    const url = new URL(req.url)
    const itemId = url.searchParams.get('itemId')
    const changeType = url.searchParams.get('changeType')
    const limit = parseInt(url.searchParams.get('limit') || '100')

    let movements = await listRows<any>('StockMovements')

    if (itemId) movements = movements.filter((m) => m.itemId === itemId)
    if (changeType) movements = movements.filter((m) => m.changeType === changeType)

    // Sort: newest first
    movements.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime())
    movements = movements.slice(0, limit)

    return NextResponse.json(movements, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const body = await req.json()
    const { itemId, itemName, changeType, quantity, reference, notes } = body

    if (!itemId) return NextResponse.json({ error: 'Item ID required' }, { status: 400 })
    if (!changeType) return NextResponse.json({ error: 'Change type required' }, { status: 400 })
    if (!quantity || quantity === 0) return NextResponse.json({ error: 'Quantity must be non-zero' }, { status: 400 })

    const movement = await createRow('StockMovements', {
      itemId,
      itemName: itemName || '',
      changeType, // 'sale' | 'purchase' | 'adjustment' | 'return'
      quantity: Number(quantity), // positive = in, negative = out
      reference: reference || '', // invoiceId, purchaseOrderId, adjustmentId
      notes: notes || '',
      date: new Date().toISOString(),
    })

    return NextResponse.json(movement, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
