import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow } from '@/lib/sheets-client'

/**
 * GET /api/engineers/[id] — single engineer with computed financials.
 * Same aggregation logic as the list endpoint but for one engineer.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const engineer = await getRow<any>('Engineers', id)
    if (!engineer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(engineer)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

/**
 * PUT /api/engineers/[id] — update engineer fields.
 * Body: any subset of { name, phone, email, specialization, commissionRate, salaryMonthly, active }
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: any = { updatedAt: new Date().toISOString() }

    if (typeof body.name === 'string') data.name = body.name.trim()
    if (typeof body.phone === 'string') data.phone = body.phone.trim()
    if (typeof body.email === 'string') data.email = body.email.trim()
    if (typeof body.specialization === 'string') data.specialization = body.specialization.trim()
    if (body.commissionRate !== undefined) {
      data.commissionRate = Math.max(0, Math.min(100, Number(body.commissionRate) || 0))
    }
    if (body.salaryMonthly !== undefined) {
      data.salaryMonthly = Math.max(0, Number(body.salaryMonthly) || 0)
    }
    if (body.active !== undefined) {
      data.active = body.active !== false && body.active !== 'false'
    }

    const updated = await updateRow('Engineers', id, data)
    return NextResponse.json(updated)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

/**
 * DELETE /api/engineers/[id] — soft-delete an engineer.
 * Existing jobs assigned to this engineer keep their `engineerId` field —
 * the engineer row is just marked deleted so it stops appearing in the
 * list / picker.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteRow('Engineers', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
