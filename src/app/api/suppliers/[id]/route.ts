import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow, listRows } from '@/lib/sheets-client'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supplier = await getRow('Suppliers', id)
    if (!supplier) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    
    const [items, enquiries] = await Promise.all([
      listRows<any>('Items'),
      listRows<any>('Enquiries'),
    ])
    
    return NextResponse.json({
      ...supplier,
      items: items.filter((i) => i.supplierId === id),
      enquiries: enquiries.filter((e) => e.supplierId === id).slice(0, 20),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: any = {}
    for (const f of ['name', 'phone', 'whatsappNumber', 'email', 'company', 'address', 'suppliedItems']) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    if (body.active !== undefined) data.active = Boolean(body.active)
    if (body.includeInAutoEnquiry !== undefined) data.includeInAutoEnquiry = Boolean(body.includeInAutoEnquiry)
    const supplier = await updateRow('Suppliers', id, data)
    return NextResponse.json(supplier)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteRow('Suppliers', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
