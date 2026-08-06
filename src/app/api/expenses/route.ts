import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow } from '@/lib/sheets-client'

import { writeLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/expenses
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&category=xxx
 * Returns: { expenses, totals: { total, byCategory, byMode } }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const category = url.searchParams.get('category')

    let expenses = await listRows<any>('Expenses')
    if (from) {
      const fromD = new Date(from)
      expenses = expenses.filter((e) => new Date(e.date) >= fromD)
    }
    if (to) {
      const toD = new Date(to)
      toD.setHours(23, 59, 59, 999)
      expenses = expenses.filter((e) => new Date(e.date) <= toD)
    }
    if (category && category !== 'all') {
      expenses = expenses.filter((e) => String(e.category) === category)
    }

    expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // Aggregate
    const totals: any = { total: 0, byCategory: {}, byMode: { Cash: 0, UPI: 0, Card: 0, Bank: 0, Cheque: 0 } }
    for (const e of expenses) {
      const amt = Number(e.amount) || 0
      totals.total += amt
      const cat = String(e.category || 'Other')
      totals.byCategory[cat] = (totals.byCategory[cat] || 0) + amt
      const mode = String(e.mode || 'Cash')
      if (totals.byMode[mode] !== undefined) totals.byMode[mode] += amt
      else totals.byMode[mode] = amt
    }

    const result = expenses.map((e) => ({
      ...e,
      amount: Number(e.amount) || 0,
      category: String(e.category || 'Other'),
      mode: String(e.mode || 'Cash'),
      description: String(e.description || ''),
      vendor: String(e.vendor || ''),
      reference: String(e.reference || ''),
      notes: String(e.notes || ''),
    }))

    return NextResponse.json({ expenses: result, totals })
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
    const expense = await createRow('Expenses', {
      category: String(body.category || 'Other'),
      description: String(body.description || ''),
      amount: Number(body.amount) || 0,
      mode: String(body.mode || 'Cash'),
      date: body.date || new Date().toISOString(),
      vendor: String(body.vendor || ''),
      reference: String(body.reference || ''),
      notes: String(body.notes || ''),
    })
    return NextResponse.json(expense)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
