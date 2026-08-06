import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'
import { processNaturalLanguageQuery } from '@/lib/super-intelligence'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { query } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query string required' }, { status: 400 })
    }

    let invoices: any[] = []
    let items: any[] = []
    let customers: any[] = []
    let jobs: any[] = []

    if (isConfigured()) {
      try {
        ;[invoices, items, customers, jobs] = await Promise.all([
          listRows<any>('Invoices').then(r => r.slice(0, 300)),
          listRows<any>('Items'),
          listRows<any>('Customers'),
          listRows<any>('Jobs').then(r => r.slice(0, 200)),
        ])
      } catch (e) {
        console.warn('AI query: sheets fetch failed, using empty', e)
      }
    }

    const result = processNaturalLanguageQuery(query, {
      invoices,
      items,
      customers,
      jobs,
      payments: [],
    })

    return NextResponse.json({
      ...result,
      meta: {
        engine: 'NLQ v7.0 PRO',
        timestamp: new Date().toISOString(),
        recordsSearched: invoices.length + items.length + customers.length + jobs.length,
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q') || url.searchParams.get('query')
  if (!q) {
    return NextResponse.json({
      examples: [
        "sales this month",
        "low stock items",
        "top customers",
        "profit this month",
        "pending jobs",
        "today sales",
        "outstanding payments"
      ],
      usage: "POST /api/ai/query with { query: 'your question' } or GET ?q=your question"
    })
  }

  // Redirect to POST logic
  try {
    const invoices = isConfigured() ? await listRows<any>('Invoices').then(r => r.slice(0, 300)).catch(() => []) : []
    const items = isConfigured() ? await listRows<any>('Items').catch(() => []) : []
    const customers = isConfigured() ? await listRows<any>('Customers').catch(() => []) : []
    const jobs = isConfigured() ? await listRows<any>('Jobs').then(r => r.slice(0, 200)).catch(() => []) : []

    const result = processNaturalLanguageQuery(q, {
      invoices,
      items,
      customers,
      jobs,
      payments: [],
    })

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
