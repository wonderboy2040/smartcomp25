import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow, listRows } from '@/lib/sheets-client'
import { safeJsonParse } from '@/lib/utils'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const po = await getRow('PurchaseOrders', id)
    if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const items = safeJsonParse<any[]>(po.itemsJson, [])
    return NextResponse.json({
      ...po,
      lines: items,
      grandTotal: items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.costPrice) || 0), 0),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited — too many writes, wait a moment' }, { status: 429 })

    const { id } = await params
    const existing = await getRow('PurchaseOrders', id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (String(existing.status) === 'received') {
      return NextResponse.json({ error: 'Cannot edit a received PO — stock already added' }, { status: 400 })
    }

    const body = await req.json()
    if (!String(body?.supplierId || '').trim()) {
      return NextResponse.json({ error: 'Supplier is required' }, { status: 400 })
    }

    const lineItems = Array.isArray(body.itemsJson) ? body.itemsJson : safeJsonParse<any[]>(body.itemsJson, [])
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json({ error: 'Add at least one line item' }, { status: 400 })
    }

    let supplier: any = null
    try {
      const suppliers = await listRows<any>('Suppliers')
      supplier = suppliers.find((s) => String(s.id) === String(body.supplierId)) || null
    } catch {}

    const grandTotal = lineItems.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.costPrice) || 0), 0)
    const status = body.sendWhatsApp === true ? 'sent' : String(existing.status || 'draft')

    const po = await updateRow('PurchaseOrders', id, {
      supplierId: String(body.supplierId),
      supplierName: String(supplier?.name || body.supplierName || existing.supplierName || ''),
      supplierPhone: String(supplier?.whatsappNumber || supplier?.phone || existing.supplierPhone || ''),
      date: body.date || existing.date || new Date().toISOString(),
      notes: String(body.notes ?? existing.notes ?? ''),
      itemsJson: JSON.stringify(lineItems),
      grandTotal,
      itemCount: lineItems.length,
      status,
    })

    return NextResponse.json(po)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const existing = await getRow('PurchaseOrders', id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (String(existing.status) === 'received') {
      return NextResponse.json({ error: 'Cannot delete a received PO — stock already added' }, { status: 400 })
    }
    await deleteRow('PurchaseOrders', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}