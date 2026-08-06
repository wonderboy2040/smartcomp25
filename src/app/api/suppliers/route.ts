import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow } from '@/lib/sheets-client'

import { writeLimiter, getClientIp } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const activeOnly = url.searchParams.get('active') === 'true'
    
    // PERFORMANCE: Load all 3 in parallel instead of sequential
    const [allSuppliers, items, enquiries] = await Promise.all([
      listRows<any>('Suppliers'),
      listRows<any>('Items', { useCache: true }),
      listRows<any>('Enquiries', { useCache: true }),
    ])
    
    let suppliers = allSuppliers
    if (activeOnly) {
      suppliers = suppliers.filter((s) => s.active === true || s.active === 'true')
    }
    
    const result = suppliers.map((s) => ({
      ...s,
      active: s.active === true || s.active === 'true',
      includeInAutoEnquiry: s.includeInAutoEnquiry === true || s.includeInAutoEnquiry === 'true',
      _count: {
        items: items.filter((i) => i.supplierId === s.id).length,
        enquiries: enquiries.filter((e) => e.supplierId === s.id).length,
      },
    }))
    return NextResponse.json(result)
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
    const supplier = await createRow('Suppliers', {
      ...body,
      whatsappNumber: body.whatsappNumber || body.phone,
      active: body.active !== false,
      includeInAutoEnquiry: body.includeInAutoEnquiry !== false,
    })
    return NextResponse.json(supplier)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
