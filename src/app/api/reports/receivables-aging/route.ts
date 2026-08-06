import { NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'

/**
 * GET /api/reports/receivables-aging
 * Buckets unpaid/partial invoices by age: 0-30, 31-60, 61-90, 90+ days.
 */
export async function GET() {
  try {
    const invoices = await listRows<any>('Invoices')
    const unpaid = invoices.filter((i) => i.paymentStatus === 'unpaid' || i.paymentStatus === 'partial')

    const now = Date.now()
    const buckets = {
      '0-30': { count: 0, amount: 0, invoices: [] as any[] },
      '31-60': { count: 0, amount: 0, invoices: [] as any[] },
      '61-90': { count: 0, amount: 0, invoices: [] as any[] },
      '90+': { count: 0, amount: 0, invoices: [] as any[] },
    }

    for (const inv of unpaid) {
      const amt = Number(inv.amountDue) || 0
      if (amt <= 0) continue
      const days = Math.floor((now - new Date(inv.date || inv.createdAt).getTime()) / (24 * 60 * 60 * 1000))
      const entry = {
        id: inv.id,
        number: String(inv.number || ''),
        customerName: String(inv.customerName || ''),
        date: inv.date,
        amountDue: amt,
        days,
      }
      if (days <= 30) buckets['0-30'].invoices.push(entry), buckets['0-30'].count++, buckets['0-30'].amount += amt
      else if (days <= 60) buckets['31-60'].invoices.push(entry), buckets['31-60'].count++, buckets['31-60'].amount += amt
      else if (days <= 90) buckets['61-90'].invoices.push(entry), buckets['61-90'].count++, buckets['61-90'].amount += amt
      else buckets['90+'].invoices.push(entry), buckets['90+'].count++, buckets['90+'].amount += amt
    }

    const totalOutstanding = buckets['0-30'].amount + buckets['31-60'].amount + buckets['61-90'].amount + buckets['90+'].amount

    return NextResponse.json({ buckets, totalOutstanding })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
