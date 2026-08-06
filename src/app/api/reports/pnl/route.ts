import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'


/**
 * GET /api/reports/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns Profit & Loss Statement for the given period.
 *
 * Revenue = Sales (invoices in period) + Service Income (service payments in period) + Personal Income
 * COGS = Opening Stock + Purchases - Closing Stock (approx: sum of totalCost of invoices)
 * Gross Profit = Revenue - COGS
 * Expenses = Shop Expenses + Personal Expenses
 * Net Profit = Gross Profit - Expenses
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const from = url.searchParams.get('from') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    const to = url.searchParams.get('to') || new Date().toISOString().slice(0, 10)

    const fromD = new Date(from)
    const toD = new Date(to)
    toD.setHours(23, 59, 59, 999)

    const inPeriod = (d: string) => {
      if (!d) return false
      const date = new Date(d)
      return date >= fromD && date <= toD
    }

    const [invoices, servicePayments, expenses, personalExpenditure] = await Promise.all([
      listRows<any>('Invoices'),
      listRows<any>('ServicePayments'),
      listRows<any>('Expenses'),
      listRows<any>('PersonalExpenditure'),
    ])

    // Revenue: Sales (invoices)
    const periodInvoices = invoices.filter((inv) => inPeriod(String(inv.date || '')))
    const salesRevenue = periodInvoices.reduce((s, inv) => s + (Number(inv.grandTotal) || 0), 0)
    const salesCost = periodInvoices.reduce((s, inv) => s + (Number(inv.totalCost) || 0), 0)

    // Service Income
    const periodServicePayments = servicePayments.filter((p) => inPeriod(String(p.date || '')))
    const serviceRevenue = periodServicePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)

    // Personal Income (separate, shown as "Other Income")
    const periodPersonalIncome = personalExpenditure
      .filter((e) => inPeriod(String(e.date || '')) && String(e.type) === 'income')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)

    // Total Revenue
    const totalRevenue = salesRevenue + serviceRevenue

    // COGS (cost of goods sold = totalCost of invoices in period)
    const cogs = salesCost
    const grossProfit = totalRevenue - cogs

    // Expenses
    const periodExpenses = expenses.filter((e) => inPeriod(String(e.date || '')))
    const shopExpenses = periodExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const expensesByCategory: Record<string, number> = {}
    for (const e of periodExpenses) {
      const cat = String(e.category || 'Other')
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (Number(e.amount) || 0)
    }

    // Personal Expenses (separate, shown as "Drawings/Personal")
    const periodPersonalExpense = personalExpenditure
      .filter((e) => inPeriod(String(e.date || '')) && String(e.type) === 'expense')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)

    const totalExpenses = shopExpenses
    const netProfit = grossProfit - totalExpenses

    // Margins
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

    return NextResponse.json({
      period: { from, to },
      revenue: {
        sales: salesRevenue,
        service: serviceRevenue,
        total: totalRevenue,
      },
      cogs,
      grossProfit,
      grossMargin: Math.round(grossMargin * 100) / 100,
      expenses: {
        byCategory: expensesByCategory,
        total: totalExpenses,
      },
      netProfit,
      netMargin: Math.round(netMargin * 100) / 100,
      other: {
        personalIncome: periodPersonalIncome,
        personalExpense: periodPersonalExpense,
        invoiceCount: periodInvoices.length,
        servicePaymentCount: periodServicePayments.length,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
