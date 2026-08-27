import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow, listRows } from '@/lib/sheets-client'

function normalizePhone(raw: unknown): string {
  let p = String(raw ?? '').replace(/\D/g, '')
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2)
  if (p.length === 11 && p.startsWith('0')) p = p.slice(1)
  return p
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const customer = await getRow<any>('Customers', id)
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    
    const [invoices, quotations, jobs] = await Promise.all([
      listRows<any>('Invoices'),
      listRows<any>('Quotations'),
      listRows<any>('Jobs'),
    ])

    const custId = String(customer.id || id)
    const custPhone = normalizePhone(customer.phone)
    const custName = String(customer.name || '').trim().toLowerCase()
    
    return NextResponse.json({
      ...customer,
      invoices: invoices.filter((i) => {
        if (String(i.customerId) === custId) return true
        if (custPhone && custPhone.length >= 10 && normalizePhone(i.customerPhone) === custPhone) return true
        if (custName && custName.length >= 2 && String(i.customerName || '').trim().toLowerCase() === custName) return true
        return false
      }),
      quotations: quotations.filter((q) => {
        if (String(q.customerId) === custId) return true
        if (custPhone && custPhone.length >= 10 && normalizePhone(q.customerPhone) === custPhone) return true
        if (custName && custName.length >= 2 && String(q.customerName || '').trim().toLowerCase() === custName) return true
        return false
      }),
      jobs: jobs.filter((j) => {
        if (String(j.customerId) === custId) return true
        if (custPhone && custPhone.length >= 10 && (normalizePhone(j.customerMobile) === custPhone || normalizePhone(j.customerPhone) === custPhone)) return true
        if (custName && custName.length >= 2 && String(j.customerName || '').trim().toLowerCase() === custName) return true
        return false
      }),
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
