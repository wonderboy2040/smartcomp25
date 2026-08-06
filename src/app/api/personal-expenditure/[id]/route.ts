import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow } from '@/lib/sheets-client'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const e = await getRow('PersonalExpenditure', id)
    if (!e) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(e)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: any = {}
    const fields = ['type', 'category', 'description', 'amount', 'mode', 'date', 'person', 'notes']
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    const updated = await updateRow('PersonalExpenditure', id, data)
    return NextResponse.json(updated)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteRow('PersonalExpenditure', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
