import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, isConfigured } from '@/lib/sheets-client'
import { itemSchema, validate } from '@/lib/validators'
import { apiLimiter, writeLimiter, getClientIp } from '@/lib/rate-limit'
import { syncItemUnits, unitTypeOf, isAvailable, parseUnitList } from '@/lib/item-units'

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

    const [allItems, suppliers, units] = await Promise.all([
      listRows<any>('Items', { search }),
      listRows<any>('Suppliers', { useCache: true }),
      // Serial numbers + digital product keys tracked per unit. Needed here so
      // the invoice item picker knows which keys are still unsold without a
      // second round-trip per item.
      listRows<any>('ItemSerials', { useCache: true }).catch(() => [] as any[]),
    ])

    let items = allItems
    if (category && category !== 'all') {
      items = items.filter((i) => i.category === category)
    }
    if (lowStock) {
      items = items.filter((i) => Number(i.quantity) <= Number(i.minQuantity || 0))
    }

    const supplierMap = new Map(suppliers.map((s) => [s.id, s]))

    // Group the still-available units per item, keeping insertion order so the
    // oldest key is handed out first (FIFO).
    const availableUnits = new Map<string, { serials: string[]; keys: string[] }>()
    for (const unit of Array.isArray(units) ? units : []) {
      if (!isAvailable(unit)) continue
      const itemId = String(unit?.itemId || '')
      const value = String(unit?.serialNumber || '').trim()
      if (!itemId || !value) continue
      let bucket = availableUnits.get(itemId)
      if (!bucket) {
        bucket = { serials: [], keys: [] }
        availableUnits.set(itemId, bucket)
      }
      if (unitTypeOf(unit) === 'key') bucket.keys.push(value)
      else bucket.serials.push(value)
    }

    let result = items.map((i) => ({
      ...i,
      gstApplicable: i.gstApplicable === true || i.gstApplicable === 'true',
      isDigitalProduct: i.isDigitalProduct === true || i.isDigitalProduct === 'true',
      availableSerials: availableUnits.get(String(i.id))?.serials || [],
      availableKeys: availableUnits.get(String(i.id))?.keys || [],
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

    const item: any = await createRow('Items', {
      ...validation.data,
      gstApplicable: body.gstApplicable !== false,
      isDigitalProduct: body.isDigitalProduct === true,
      gstRate: Number(body.gstRate) || 18,
      costPrice: Number(body.costPrice) || 0,
      sellingPrice: Number(body.sellingPrice) || 0,
      quantity: Number(body.quantity) || 0,
      minQuantity: Number(body.minQuantity) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    // Serial numbers and digital keys are per-unit records, not item columns —
    // itemSchema deliberately drops them, so persist them separately here.
    // Without this the keys typed into the Add Item dialog were silently lost.
    let units = { created: 0, serials: 0, keys: 0 }
    if (item?.id) {
      units = await syncItemUnits({
        itemId: String(item.id),
        itemName: String(item.name || body.name || ''),
        serialNumbers: body.serialNumbers,
        digitalKeys: body.isDigitalProduct === true ? body.digitalKeys : undefined,
        costPrice: Number(body.costPrice) || 0,
        warrantyDays: Number(body.warrantyDays) || 365,
      }).catch(() => ({ created: 0, serials: 0, keys: 0 }))
    }

    return NextResponse.json({
      ...item,
      availableSerials: parseUnitList(body.serialNumbers),
      availableKeys: body.isDigitalProduct === true ? parseUnitList(body.digitalKeys) : [],
      unitsCreated: units.created,
      serialsCreated: units.serials,
      keysCreated: units.keys,
    }, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
