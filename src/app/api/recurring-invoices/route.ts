import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/recurring-invoices
 * Lists auto-generated recurring invoice audit rows.
 * Optional: ?limit=50  (default 100)
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '100')

    let rows = await listRows<any>('RecurringInvoices').catch(() => [])
    rows.sort((a, b) => new Date(b.generatedAt || b.createdAt || 0).getTime() - new Date(a.generatedAt || a.createdAt || 0).getTime())
    rows = rows.slice(0, limit).map((r) => ({
      id: String(r.id || ''),
      invoiceId: String(r.invoiceId || ''),
      invoiceNumber: String(r.invoiceNumber || ''),
      contractId: String(r.contractId || ''),
      contractNumber: String(r.contractNumber || ''),
      customerId: String(r.customerId || ''),
      customerName: String(r.customerName || ''),
      customerPhone: String(r.customerPhone || ''),
      amount: Number(r.amount) || 0,
      frequency: String(r.frequency || 'monthly'),
      generatedAt: r.generatedAt || '',
    }))

    return NextResponse.json(rows, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
