import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow } from '@/lib/sheets-client'
import { safeJsonParse } from '@/lib/utils'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'
import { generateWhatsAppLink, buildPurchaseOrderMessage } from '@/lib/whatsapp'

/**
 * GET /api/purchase-orders — list all purchase orders (draft/sent/received)
 * POST /api/purchase-orders — create a PO with auto PO number + optional
 *   WhatsApp message link to the supplier.
 *
 * Schema (collection: PurchaseOrders):
 *   poNumber, supplierId, supplierName, supplierPhone, date, notes,
 *   itemsJson [{ itemId, name, quantity, costPrice }],
 *   grandTotal, itemCount, status (draft|sent|received),
 *   receivedAt, stockItemsAdded, payableAmount, amountDue, deleted
 */
export async function GET() {
  try {
    const pos = await listRows<any>('PurchaseOrders')

    const result = pos.map((po) => {
      const items = safeJsonParse<any[]>(po.itemsJson, [])
      return {
        ...po,
        poNumber: String(po.poNumber || ''),
        supplierId: String(po.supplierId || ''),
        supplierName: String(po.supplierName || ''),
        date: po.date || po.createdAt || '',
        itemsJson: po.itemsJson || '[]',
        itemCount: items.length,
        grandTotal: items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.costPrice) || 0), 0),
        status: String(po.status || 'draft'),
        payableAmount: Number(po.payableAmount) || 0,
        amountDue: po.amountDue !== undefined ? Number(po.amountDue) : Number(po.payableAmount) || 0,
        stockItemsAdded: Number(po.stockItemsAdded) || 0,
      }
    })

    result.sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())
    return NextResponse.json(result)
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
    if (!String(body?.supplierId || '').trim()) {
      return NextResponse.json({ error: 'Supplier is required' }, { status: 400 })
    }

    const lineItems = Array.isArray(body.itemsJson) ? body.itemsJson : safeJsonParse<any[]>(body.itemsJson, [])
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json({ error: 'Add at least one line item' }, { status: 400 })
    }

    // Look up supplier for name + WhatsApp number
    let supplier: any = null
    try {
      const suppliers = await listRows<any>('Suppliers')
      supplier = suppliers.find((s) => String(s.id) === String(body.supplierId)) || null
    } catch {}

    // Auto PO number: PO<year>-<seq>
    const existing = await listRows<any>('PurchaseOrders')
    const year = new Date().getFullYear()
    const yearCount = existing.filter((p) => String(p.poNumber || '').includes(String(year))).length
    const poNumber = `PO${year}-${String(yearCount + 1).padStart(4, '0')}`

    const grandTotal = lineItems.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.costPrice) || 0), 0)
    const status = body.sendWhatsApp === true ? 'sent' : 'draft'

    const po = await createRow('PurchaseOrders', {
      poNumber,
      supplierId: String(body.supplierId),
      supplierName: String(supplier?.name || body.supplierName || ''),
      supplierPhone: String(supplier?.whatsappNumber || supplier?.phone || ''),
      date: body.date || new Date().toISOString(),
      notes: String(body.notes || ''),
      itemsJson: JSON.stringify(lineItems),
      grandTotal,
      itemCount: lineItems.length,
      status,
      receivedAt: '',
      stockItemsAdded: 0,
      payableAmount: 0,
      amountDue: 0,
      deleted: false,
    })

    // Build WhatsApp send link for the supplier
    let whatsappLink = ''
    if (status === 'sent' && po.supplierPhone) {
      const message = buildPurchaseOrderMessage(poNumber, supplier?.name || '', lineItems, grandTotal, body.notes)
      whatsappLink = generateWhatsAppLink(po.supplierPhone, message)
    }

    return NextResponse.json({ ...po, whatsappLink })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}