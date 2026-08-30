import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'
import { buildGstr3B } from '@/lib/gst-return'

/**
 * GET /api/reports/gstr3b?month=2026-08
 *
 * v13 NEW: GSTR-3B summary for a month.
 *
 * Combines outward supplies (from invoices) + inward supplies (from received
 * purchase orders) to compute net tax payable + ITC available.
 *
 * Cache: 5 minutes.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const month = url.searchParams.get('month') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    const format = (url.searchParams.get('format') || 'json').toLowerCase()

    const [invoices, purchaseOrders] = await Promise.all([
      listRows<any>('Invoices').catch(() => []),
      listRows<any>('PurchaseOrders').catch(() => []),
    ])

    const result = buildGstr3B(invoices, purchaseOrders, month)

    if (format === 'csv') {
      const rows = [
        ['Field', 'Central Tax', 'State Tax', 'Integrated Tax', 'Cess', 'Taxable Value'].join(','),
        [`Outward Supplies`, result.outwardSupplies.centralTax, result.outwardSupplies.stateTax, result.outwardSupplies.integratedTax, result.outwardSupplies.cess, result.outwardSupplies.taxableValue].join(','),
        [`Inward Supplies (ITC)`, result.inputTaxCredit.centralTax, result.inputTaxCredit.stateTax, result.inputTaxCredit.integratedTax, result.inputTaxCredit.cess, result.inwardSupplies.taxableValue].join(','),
        [`Net Tax Payable`, '', '', '', '', result.netTaxPayable],
        [`ITC Carried Forward`, '', '', '', '', result.itcCarriedForward],
      ]
      return new NextResponse(rows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="gstr3b-${month}.csv"`,
        },
      })
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'X-RateLimit-Remaining': check.remaining.toString(),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
