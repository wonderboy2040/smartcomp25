import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow } from '@/lib/sheets-client'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const s = await getRow('ItemSerials', id)
    if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(s)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: any = {}
    const fields = ['serialNumber', 'status', 'itemId', 'itemName', 'warrantyDays', 'warrantyExpiry', 'costPrice', 'notes', 'invoiceId', 'invoiceNumber', 'customerName', 'purchaseDate']
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    const updated = await updateRow('ItemSerials', id, data)
    return NextResponse.json(updated)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteRow('ItemSerials', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
