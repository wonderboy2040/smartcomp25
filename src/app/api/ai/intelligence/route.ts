import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'
import { generateSuperIntelligence } from '@/lib/super-intelligence'

export async function GET(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'Not configured' }, { status: 400 })
    }

    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '500')

    const [invoices, items, customers, jobs, payments, expenses, quotations] = await Promise.all([
      listRows<any>('Invoices').then(r => r.slice(0, limit)),
      listRows<any>('Items'),
      listRows<any>('Customers'),
      listRows<any>('Jobs'),
      listRows<any>('Payments').then(r => r.slice(0, 200)),
      listRows<any>('Expenses').then(r => r.slice(0, 200)).catch(() => []),
      listRows<any>('Quotations').then(r => r.slice(0, 200)).catch(() => []),
    ])

    const intelligence = generateSuperIntelligence({
      invoices,
      items,
      customers,
      jobs,
      payments,
      expenses,
      quotations,
    })

    return NextResponse.json({
      ...intelligence,
      meta: {
        recordsAnalyzed: invoices.length + items.length + customers.length + jobs.length,
        generatedAt: new Date().toISOString(),
        version: '7.0 PRO Super Intelligence',
        engine: 'Pure TypeScript • Zero API Cost • Privacy-First',
      }
    }, {
      headers: {
        'X-AI-Engine': 'super-intelligence-v7',
        'X-Records': (invoices.length + items.length + customers.length).toString(),
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI Intelligence error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { invoices, items, customers, jobs, payments, expenses } = body

    if (!invoices) {
      return NextResponse.json({ error: 'invoices required' }, { status: 400 })
    }

    const intelligence = generateSuperIntelligence({
      invoices: invoices || [],
      items: items || [],
      customers: customers || [],
      jobs: jobs || [],
      payments: payments || [],
      expenses: expenses || [],
    })

    return NextResponse.json(intelligence)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
