import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, getRow, updateRow } from '@/lib/sheets-client'
import { writeLimiter, apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/supplier-payments?supplierId=xxx
 *   List all supplier payments (settlements against POs).
 *   Optional ?supplierId= filter.
 *
 * POST /api/supplier-payments
 *   Settle a supplier payable: { poId, amount, mode, date, notes, reference }
 *   - Creates a SupplierPayment row
 *   - Reduces the PO's amountDue
 *   - If amountDue <= 0, marks PO status as 'paid'
 */

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const supplierId = url.searchParams.get('supplierId')

    let payments = await listRows<any>('SupplierPayments')
    if (supplierId) {
      payments = payments.filter((p) => String(p.supplierId) === String(supplierId))
    }
    payments.sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())

    return NextResponse.json(payments)
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
    const { poId, amount, mode, date, notes, reference } = body

    if (!poId) return NextResponse.json({ error: 'Purchase Order ID is required' }, { status: 400 })
    const amt = Number(amount) || 0
    if (amt <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })

    const po = await getRow<any>('PurchaseOrders', String(poId))
    if (!po) return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 })
    if (String(po.status) !== 'received') {
      return NextResponse.json({ error: 'PO must be received before payment' }, { status: 400 })
    }

    const currentDue = Number(po.amountDue) || 0
    if (amt > currentDue) {
      return NextResponse.json({ error: `Amount exceeds due (Rs.${currentDue.toFixed(2)})` }, { status: 400 })
    }

    const newDue = currentDue - amt
    const newStatus = newDue <= 0 ? 'paid' : 'received'

    const payment = await createRow('SupplierPayments', {
      poId: String(poId),
      poNumber: String(po.poNumber || ''),
      supplierId: String(po.supplierId || ''),
      supplierName: String(po.supplierName || ''),
      amount: amt,
      mode: String(mode || 'Cash'),
      date: date || new Date().toISOString(),
      notes: String(notes || ''),
      reference: String(reference || ''),
      previousDue: currentDue,
      remainingDue: newDue,
    })

    await updateRow('PurchaseOrders', String(poId), {
      amountDue: newDue,
      status: newStatus,
      lastPaymentDate: date || new Date().toISOString(),
    })

    return NextResponse.json({ ...payment, poStatus: newStatus, remainingDue: newDue })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
