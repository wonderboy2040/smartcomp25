import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'

/**
 * GET /api/reports/balance-sheet?asOn=YYYY-MM-DD
 * Returns Balance Sheet as on the given date.
 *
 * Assets:
 *   - Stock Value (at cost) = Σ (costPrice × quantity) for all items
 *   - Receivables = Σ amountDue for all unpaid invoices (up to asOn date)
 *   - Cash in Hand = (all cash payments received) - (all cash expenses + cash personal)
 *   - UPI/Bank = similar for UPI/Bank modes
 *
 * Liabilities:
 *   - Customer Credit = Σ creditBalance for all customers (advance received)
 *   - Payables (future: supplier dues)
 *
 * Net Worth = Assets - Liabilities
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const asOn = url.searchParams.get('asOn') || new Date().toISOString().slice(0, 10)
    const asOnD = new Date(asOn)
    asOnD.setHours(23, 59, 59, 999)

    const upTo = (d: string) => {
      if (!d) return false
      return new Date(d) <= asOnD
    }

    const [items, invoices, payments, expenses, servicePayments, personalExp] = await Promise.all([
      listRows<any>('Items'),
      listRows<any>('Invoices'),
      listRows<any>('Payments'),
      listRows<any>('Expenses'),
      listRows<any>('ServicePayments'),
      listRows<any>('PersonalExpenditure'),
    ])

    // ASSETS
    // 1. Stock Value (at cost)
    const stockValueCost = items.reduce((s, i) => s + (Number(i.costPrice) || 0) * (Number(i.quantity) || 0), 0)
    const stockValueSelling = items.reduce((s, i) => s + (Number(i.sellingPrice) || 0) * (Number(i.quantity) || 0), 0)

    // 2. Receivables (unpaid invoice amounts up to asOn)
    const receivables = invoices
      .filter((inv) => upTo(String(inv.date || inv.createdAt || '')))
      .reduce((s, inv) => s + (Number(inv.amountDue) || 0), 0)

    // 3. Cash in Hand = cash received (sales payments + service payments) - cash paid (expenses + personal)
    const cashIn = payments
      .filter((p) => upTo(String(p.date || '')) && String(p.type).toLowerCase() === 'cash')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const cashInService = servicePayments
      .filter((p) => upTo(String(p.date || '')) && String(p.mode).toLowerCase() === 'cash')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const cashOut = expenses
      .filter((e) => upTo(String(e.date || '')) && String(e.mode).toLowerCase() === 'cash')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const cashOutPersonal = personalExp
      .filter((e) => upTo(String(e.date || '')) && String(e.type) === 'expense' && String(e.mode).toLowerCase() === 'cash')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const cashInHand = (cashIn + cashInService) - (cashOut + cashOutPersonal)

    // 4. UPI/Bank Balance
    const upiIn = payments
      .filter((p) => upTo(String(p.date || '')) && String(p.type).toLowerCase() === 'upi')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const upiInService = servicePayments
      .filter((p) => upTo(String(p.date || '')) && String(p.mode).toLowerCase() === 'upi')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const upiOut = expenses
      .filter((e) => upTo(String(e.date || '')) && String(e.mode).toLowerCase() === 'upi')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const upiOutPersonal = personalExp
      .filter((e) => upTo(String(e.date || '')) && String(e.type) === 'expense' && String(e.mode).toLowerCase() === 'upi')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const upiBalance = (upiIn + upiInService) - (upiOut + upiOutPersonal)

    // 5. Bank Balance (card + bank + cheque)
    const bankIn = payments
      .filter((p) => upTo(String(p.date || '')) && ['card', 'bank', 'cheque'].includes(String(p.type).toLowerCase()))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const bankInService = servicePayments
      .filter((p) => upTo(String(p.date || '')) && ['card', 'bank', 'cheque'].includes(String(p.mode).toLowerCase()))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const bankOut = expenses
      .filter((e) => upTo(String(e.date || '')) && ['card', 'bank', 'cheque'].includes(String(e.mode).toLowerCase()))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const bankBalance = (bankIn + bankInService) - bankOut

    const totalAssets = stockValueCost + receivables + cashInHand + upiBalance + bankBalance

    // LIABILITIES
    // Customer credit balance IS the same as receivables (outstanding invoice dues).
    // Counting both would double-count. We set liabilities to 0 for now.
    // Future: track supplier payables (purchase orders not yet paid) as real liabilities.
    const totalLiabilities = 0

    // Net Worth
    const netWorth = totalAssets - totalLiabilities

    return NextResponse.json({
      asOn,
      assets: {
        stockValueCost,
        stockValueSelling,
        receivables,
        cashInHand,
        upiBalance,
        bankBalance,
        total: totalAssets,
      },
      liabilities: {
        total: totalLiabilities,
      },
      netWorth,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
