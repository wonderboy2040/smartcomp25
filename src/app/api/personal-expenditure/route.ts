import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow } from '@/lib/sheets-client'

import { writeLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/personal-expenditure
 * Query: ?from=&to=&type=income|expense&category=xxx&person=xxx
 * Returns: { entries, totals: { todayIncome, todayExpense, todayNet, monthIncome, monthExpense, monthNet, filterIncome, filterExpense } }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const typeFilter = url.searchParams.get('type')
    const categoryFilter = url.searchParams.get('category')
    const personFilter = url.searchParams.get('person')

    let entries = await listRows<any>('PersonalExpenditure')
    if (typeFilter) entries = entries.filter((e) => String(e.type) === typeFilter)
    if (categoryFilter && categoryFilter !== 'all') entries = entries.filter((e) => String(e.category) === categoryFilter)
    if (personFilter && personFilter !== 'all') entries = entries.filter((e) => String(e.person) === personFilter)

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // Today's totals
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayEntries = entries.filter((e) => String(e.date || '').slice(0, 10) === todayStr || (e.createdAt && String(e.createdAt).slice(0, 10) === todayStr))
    const todayIncome = todayEntries.filter((e) => String(e.type) === 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const todayExpense = todayEntries.filter((e) => String(e.type) === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0)

    // This month's totals
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEntries = entries.filter((e) => {
      const d = e.date ? new Date(e.date) : (e.createdAt ? new Date(e.createdAt) : null)
      return d && d >= monthStart
    })
    const monthIncome = monthEntries.filter((e) => String(e.type) === 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const monthExpense = monthEntries.filter((e) => String(e.type) === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0)

    // Filtered totals (for date range)
    let filtered = entries
    if (from) {
      const fromD = new Date(from)
      filtered = filtered.filter((e) => {
        const d = e.date ? new Date(e.date) : (e.createdAt ? new Date(e.createdAt) : null)
        return d && d >= fromD
      })
    }
    if (to) {
      const toD = new Date(to)
      toD.setHours(23, 59, 59, 999)
      filtered = filtered.filter((e) => {
        const d = e.date ? new Date(e.date) : (e.createdAt ? new Date(e.createdAt) : null)
        return d && d <= toD
      })
    }
    const filterIncome = filtered.filter((e) => String(e.type) === 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const filterExpense = filtered.filter((e) => String(e.type) === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0)

    const result = entries.map((e) => ({
      ...e,
      type: String(e.type || 'expense'),
      category: String(e.category || 'Other'),
      description: String(e.description || ''),
      amount: Number(e.amount) || 0,
      mode: String(e.mode || 'Cash'),
      person: String(e.person || ''),
      notes: String(e.notes || ''),
    }))

    return NextResponse.json({
      entries: result,
      totals: {
        todayIncome,
        todayExpense,
        todayNet: todayIncome - todayExpense,
        monthIncome,
        monthExpense,
        monthNet: monthIncome - monthExpense,
        filterIncome,
        filterExpense,
        filterNet: filterIncome - filterExpense,
        filterCount: filtered.length,
      },
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
    const entry = await createRow('PersonalExpenditure', {
      type: String(body.type || 'expense'),
      category: String(body.category || 'Other'),
      description: String(body.description || ''),
      amount: Number(body.amount) || 0,
      mode: String(body.mode || 'Cash'),
      date: body.date || new Date().toISOString(),
      person: String(body.person || ''),
      notes: String(body.notes || ''),
    })
    return NextResponse.json(entry)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
