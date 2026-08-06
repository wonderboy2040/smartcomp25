import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow } from '@/lib/sheets-client'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const item = await getRow('Items', id)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(item)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: any = {}
    const fields = ['name', 'sku', 'category', 'description', 'unit', 'hsnCode', 'supplierId']
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    if (body.gstApplicable !== undefined) data.gstApplicable = Boolean(body.gstApplicable)
    for (const f of ['gstRate', 'costPrice', 'sellingPrice', 'quantity', 'minQuantity']) {
      if (body[f] !== undefined) data[f] = Number(body[f])
    }
    const item = await updateRow('Items', id, data)
    return NextResponse.json(item)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteRow('Items', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
