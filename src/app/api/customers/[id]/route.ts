import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow, listRows } from '@/lib/sheets-client'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const customer = await getRow('Customers', id)
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    
    const [invoices, quotations] = await Promise.all([
      listRows<any>('Invoices'),
      listRows<any>('Quotations'),
    ])
    
    return NextResponse.json({
      ...customer,
      invoices: invoices.filter((i) => i.customerId === id),
      quotations: quotations.filter((q) => q.customerId === id),
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
    for (const f of ['name', 'phone', 'email', 'address', 'gstNumber', 'state']) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    if (body.creditBalance !== undefined) data.creditBalance = Number(body.creditBalance)
    const customer = await updateRow('Customers', id, data)
    return NextResponse.json(customer)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteRow('Customers', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
