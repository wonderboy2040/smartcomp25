import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, updateRow, deleteRow } from '@/lib/sheets-client'
import { writeLimiter, apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/expense-budgets?month=YYYY-MM
 *   List all budgets + actual spend for the given month.
 *   Returns: [{ id, category, budgetAmount, actualAmount, variance, variancePct }]
 *   Defaults to current month.
 *
 * POST /api/expense-budgets
 *   Create or update a budget: { category, month, amount }
 *   If a budget already exists for (category, month), it updates the amount.
 */

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const month = url.searchParams.get('month') || defaultMonth

    const [budgets, expenses] = await Promise.all([
      listRows<any>('ExpenseBudgets').catch(() => []),
      listRows<any>('Expenses').catch(() => []),
    ])

    const monthBudgets = budgets.filter((b) => String(b.month) === month)
    const monthExpenses = expenses.filter((e) => {
      const eDate = String(e.date || e.createdAt || '')
      return eDate.startsWith(month)
    })

    const spendByCategory = new Map<string, number>()
    for (const e of monthExpenses) {
      const cat = String(e.category || 'Other')
      spendByCategory.set(cat, (spendByCategory.get(cat) || 0) + (Number(e.amount) || 0))
    }

    const result = monthBudgets.map((b) => {
      const budget = Number(b.amount) || 0
      const actual = spendByCategory.get(String(b.category)) || 0
      const variance = budget - actual
      const variancePct = budget > 0 ? Math.round((variance / budget) * 100) : 0
      return {
        id: b.id,
        category: String(b.category || ''),
        month: String(b.month || ''),
        budgetAmount: budget,
        actualAmount: actual,
        variance,
        variancePct,
        status: actual > budget ? 'over' : actual > budget * 0.8 ? 'warning' : 'ok',
      }
    })

    const totalBudget = result.reduce((s, r) => s + r.budgetAmount, 0)
    const totalActual = result.reduce((s, r) => s + r.actualAmount, 0)

    return NextResponse.json({
      month,
      budgets: result,
      totalBudget,
      totalActual,
      totalVariance: totalBudget - totalActual,
      totalVariancePct: totalBudget > 0 ? Math.round(((totalBudget - totalActual) / totalBudget) * 100) : 0,
    })
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
    const category = String(body?.category || '').trim()
    const month = String(body?.month || '')
    const amount = Number(body?.amount) || 0

    if (!category) return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'Invalid month (use YYYY-MM)' }, { status: 400 })
    if (amount < 0) return NextResponse.json({ error: 'Amount must be non-negative' }, { status: 400 })

    const existing = await listRows<any>('ExpenseBudgets')
    const match = existing.find((b) => String(b.category) === category && String(b.month) === month)

    if (match) {
      const updated = await updateRow('ExpenseBudgets', String(match.id), { amount })
      return NextResponse.json({ ...updated, action: 'updated' })
    }

    const budget = await createRow('ExpenseBudgets', {
      category,
      month,
      amount,
    })
    return NextResponse.json({ ...budget, action: 'created' })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    await deleteRow('ExpenseBudgets', String(id))
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
