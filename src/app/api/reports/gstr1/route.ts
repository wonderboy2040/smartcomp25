import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'
import { buildGstr1, gstr1ToCsv } from '@/lib/gst-return'

/**
 * GET /api/reports/gstr1?month=YYYY-MM&format=json|csv
 *
 * Builds the GSTR-1 sections (B2B, B2CS, HSN, document series) for one month
 * from saved invoices. Defaults to the previous month, which is the one you
 * normally file.
 *
 * The response always carries `warnings` — missing HSN codes, malformed
 * GSTINs, cancelled invoices. Reconcile before filing; see src/lib/gst-return.ts.
 */
export async function GET(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'Firebase not configured' }, { status: 503 })
    }

    const url = new URL(req.url)
    const format = (url.searchParams.get('format') || 'json').toLowerCase()

    // Default to last month — the period you'd actually be filing.
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const defaultPeriod = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`
    const month = url.searchParams.get('month') || defaultPeriod

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json(
        { error: 'Invalid month — use YYYY-MM (e.g. 2026-07)' },
        { status: 400 }
      )
    }

    const [invoices, shopRows] = await Promise.all([
      listRows<any>('Invoices').catch(() => []),
      listRows<any>('Shop', { useCache: true }).catch(() => []),
    ])

    const result = buildGstr1(invoices, shopRows[0] || {}, month)

    if (format === 'csv') {
      return new NextResponse(gstr1ToCsv(result), {
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="GSTR1-${month}.csv"`,
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to build GSTR-1' }, { status: 500 })
  }
}
