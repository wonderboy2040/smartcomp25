import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow } from '@/lib/sheets-client'
import { unitTypeOf } from '@/lib/item-units'

import { writeLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/item-serials
 * Query: ?itemId=xxx ?status=in_stock ?search=xxx ?expiryCheck=true
 * Returns: serials array + summary (totalInStock, totalSold, expiringSoon)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const itemIdFilter = url.searchParams.get('itemId')
    const statusFilter = url.searchParams.get('status')
    const search = url.searchParams.get('search')

    const typeFilter = url.searchParams.get('type')

    let serials = await listRows<any>('ItemSerials')
    if (itemIdFilter) serials = serials.filter((s) => String(s.itemId) === itemIdFilter)
    if (statusFilter) serials = serials.filter((s) => String(s.status) === statusFilter)
    if (typeFilter) serials = serials.filter((s) => unitTypeOf(s) === (typeFilter === 'key' ? 'key' : 'serial'))
    if (search) {
      const q = search.toLowerCase()
      serials = serials.filter((s) =>
        String(s?.serialNumber || '').toLowerCase().includes(q) ||
        String(s?.itemName || '').toLowerCase().includes(q) ||
        String(s?.customerName || '').toLowerCase().includes(q) ||
        String(s?.invoiceNumber || '').toLowerCase().includes(q)
      )
    }

    serials.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())

    // Summary
    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const summary = {
      total: serials.length,
      inStock: serials.filter((s) => String(s.status) === 'in_stock').length,
      sold: serials.filter((s) => String(s.status) === 'sold').length,
      returned: serials.filter((s) => String(s.status) === 'returned').length,
      warrantyActive: serials.filter((s) => {
        if (String(s.status) !== 'sold' || !s.warrantyExpiry) return false
        return new Date(s.warrantyExpiry) > now
      }).length,
      expiringSoon: serials.filter((s) => {
        if (String(s.status) !== 'sold' || !s.warrantyExpiry) return false
        const exp = new Date(s.warrantyExpiry)
        return exp > now && exp < in30Days
      }).length,
      expired: serials.filter((s) => {
        if (String(s.status) !== 'sold' || !s.warrantyExpiry) return false
        return new Date(s.warrantyExpiry) < now
      }).length,
    }

    const result = serials.map((s) => ({
      ...s,
      serialNumber: String(s?.serialNumber || ''),
      type: unitTypeOf(s),
      itemName: String(s?.itemName || ''),
      status: String(s?.status || 'in_stock'),
      customerName: String(s?.customerName || ''),
      invoiceNumber: String(s?.invoiceNumber || ''),
      warrantyDays: Number(s?.warrantyDays) || 0,
      costPrice: Number(s?.costPrice) || 0,
      warrantyStatus: s.warrantyExpiry
        ? (new Date(s.warrantyExpiry) < now ? 'expired' : new Date(s.warrantyExpiry) < in30Days ? 'expiring' : 'active')
        : 'none',
    }))

    return NextResponse.json({ serials: result, summary })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

/**
 * POST /api/item-serials — add a new serial number
 * Body: { itemId, itemName, serialNumber, warrantyDays?, costPrice?, notes? }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited — too many writes, wait a moment' }, { status: 429 })

    const body = await req.json()
    const warrantyDays = Number(body.warrantyDays) || 365 // default 1 year

    // Support bulk add: if serialNumbers is an array, create multiple
    const serialNumbers: string[] = Array.isArray(body.serialNumbers)
      ? body.serialNumbers
      : [body.serialNumber]

    const created: any[] = []
    for (const sn of serialNumbers) {
      if (!sn || !String(sn).trim()) continue
      const row = await createRow('ItemSerials', {
        itemId: String(body.itemId || ''),
        itemName: String(body.itemName || ''),
        serialNumber: String(sn).trim(),
        type: String(body.type || '').toLowerCase() === 'key' ? 'key' : 'serial',
        status: 'in_stock',
        invoiceId: '',
        invoiceNumber: '',
        customerName: '',
        purchaseDate: '',
        warrantyDays,
        warrantyExpiry: '',
        costPrice: Number(body.costPrice) || 0,
        notes: String(body.notes || ''),
      })
      created.push(row)
    }

    return NextResponse.json({ success: true, count: created.length, serials: created })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
