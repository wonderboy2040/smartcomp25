import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, isConfigured } from '@/lib/sheets-client'
import { customerSchema, validate } from '@/lib/validators'
import { apiLimiter, writeLimiter, getClientIp } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    }

    if (!isConfigured()) return NextResponse.json([], { headers: { 'X-Config': 'missing' } })

    const url = new URL(req.url)
    const search = url.searchParams.get('search') || undefined
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '100')
    const sortBy = url.searchParams.get('sortBy') || 'createdAt'
    const sortOrder = url.searchParams.get('sortOrder') || 'desc'

    // Parallel fetch for performance
    const [customers, invoices, quotations] = await Promise.all([
      listRows<any>('Customers', { search }),
      listRows<any>('Invoices', { useCache: true }),
      listRows<any>('Quotations', { useCache: true }),
    ])

    // v11: single-pass Map counting — O(N+M) instead of O(N×M) filters.
    // With 2k invoices + 300 customers this is ~100x fewer comparisons.
    const invoiceCount = new Map<string, number>()
    for (const i of invoices) {
      if (i.customerId) invoiceCount.set(String(i.customerId), (invoiceCount.get(String(i.customerId)) || 0) + 1)
    }
    const quotationCount = new Map<string, number>()
    for (const q of quotations) {
      if (q.customerId) quotationCount.set(String(q.customerId), (quotationCount.get(String(q.customerId)) || 0) + 1)
    }

    let result = customers.map((c) => ({
      ...c,
      creditBalance: Number(c.creditBalance) || 0,
      creditLimit: Number(c.creditLimit) || 0,
      _count: {
        invoices: invoiceCount.get(String(c.id)) || 0,
        quotations: quotationCount.get(String(c.id)) || 0,
      },
    }))

    // Sorting
    result.sort((a, b) => {
      const aVal = a[sortBy] || ''
      const bVal = b[sortBy] || ''
      if (sortOrder === 'asc') return String(aVal).localeCompare(String(bVal))
      return String(bVal).localeCompare(String(aVal))
    })

    // Pagination
    const start = (page - 1) * limit
    const paginated = result.slice(start, start + limit)

    return NextResponse.json(
      limit < result.length ? {
        data: paginated,
        pagination: {
          page,
          limit,
          total: result.length,
          totalPages: Math.ceil(result.length / limit),
        }
      } : paginated,
      {
        headers: {
          'X-Total-Count': result.length.toString(),
          'X-RateLimit-Remaining': check.remaining.toString(),
        }
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) {
      return NextResponse.json({ error: 'Rate limited - too many writes' }, { status: 429 })
    }

    if (!isConfigured()) {
      return NextResponse.json({ error: 'Not configured' }, { status: 400 })
    }

    const body = await req.json()
    
    // Validate
    const validation = validate(customerSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const customer = await createRow('Customers', {
      ...validation.data,
      creditBalance: 0,
      creditScore: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json(customer, {
      headers: {
        'X-RateLimit-Remaining': check.remaining.toString(),
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
