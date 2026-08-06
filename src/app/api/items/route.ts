import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, isConfigured } from '@/lib/sheets-client'
import { itemSchema, validate } from '@/lib/validators'
import { apiLimiter, writeLimiter, getClientIp } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    if (!isConfigured()) return NextResponse.json([])

    const url = new URL(req.url)
    const search = url.searchParams.get('search') || undefined
    const category = url.searchParams.get('category')
    const lowStock = url.searchParams.get('lowStock') === 'true'
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '200')
    const sortBy = url.searchParams.get('sortBy') || 'name'
    const sortOrder = url.searchParams.get('sortOrder') || 'asc'

    const [allItems, suppliers] = await Promise.all([
      listRows<any>('Items', { search }),
      listRows<any>('Suppliers', { useCache: true }),
    ])
    
    let items = allItems
    if (category && category !== 'all') {
      items = items.filter((i) => i.category === category)
    }
    if (lowStock) {
      items = items.filter((i) => Number(i.quantity) <= Number(i.minQuantity || 0))
    }

    const supplierMap = new Map(suppliers.map((s) => [s.id, s]))
    
    let result = items.map((i) => ({
      ...i,
      gstApplicable: i.gstApplicable === true || i.gstApplicable === 'true',
      gstRate: Number(i.gstRate) || 0,
      costPrice: Number(i.costPrice) || 0,
      sellingPrice: Number(i.sellingPrice) || 0,
      quantity: Number(i.quantity) || 0,
      minQuantity: Number(i.minQuantity) || 0,
      profitMargin: Number(i.sellingPrice) && Number(i.costPrice) ? 
        Math.round(((Number(i.sellingPrice) - Number(i.costPrice)) / Number(i.sellingPrice)) * 100) : 0,
      stockValue: (Number(i.sellingPrice) || 0) * (Number(i.quantity) || 0),
      supplier: i.supplierId ? supplierMap.get(i.supplierId) : null,
    }))

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'name') {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      }
      if (sortBy === 'quantity' || sortBy === 'sellingPrice' || sortBy === 'stockValue') {
        const aVal = Number(a[sortBy]) || 0
        const bVal = Number(b[sortBy]) || 0
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })

    // Pagination if requested
    if (url.searchParams.has('page')) {
      const start = (page - 1) * limit
      const paginated = result.slice(start, start + limit)
      return NextResponse.json({
        data: paginated,
        pagination: {
          page,
          limit,
          total: result.length,
          totalPages: Math.ceil(result.length / limit),
        }
      }, {
        headers: {
          'X-Total-Count': result.length.toString(),
          'X-RateLimit-Remaining': check.remaining.toString(),
        }
      })
    }

    return NextResponse.json(result, {
      headers: {
        'X-Total-Count': result.length.toString(),
        'X-RateLimit-Remaining': check.remaining.toString(),
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    if (!isConfigured()) return NextResponse.json({ error: 'Not configured' }, { status: 400 })

    const body = await req.json()
    const validation = validate(itemSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const item = await createRow('Items', {
      ...validation.data,
      gstApplicable: body.gstApplicable !== false,
      gstRate: Number(body.gstRate) || 18,
      costPrice: Number(body.costPrice) || 0,
      sellingPrice: Number(body.sellingPrice) || 0,
      quantity: Number(body.quantity) || 0,
      minQuantity: Number(body.minQuantity) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json(item, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
