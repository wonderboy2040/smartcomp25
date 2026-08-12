import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow, listRows } from '@/lib/sheets-client'
import { syncItemUnits, unitTypeOf, isAvailable } from '@/lib/item-units'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const item: any = await getRow('Items', id)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Include the unsold serials / keys so the edit dialog can show what is
    // already on file instead of presenting an empty box (which used to make
    // the user re-type keys, creating duplicates).
    const units = await listRows<any>('ItemSerials', { useCache: true }).catch(() => [] as any[])
    const mine = (Array.isArray(units) ? units : []).filter(
      (u) => String(u?.itemId) === String(id) && isAvailable(u),
    )
    return NextResponse.json({
      ...item,
      isDigitalProduct: item.isDigitalProduct === true || item.isDigitalProduct === 'true',
      availableSerials: mine.filter((u) => unitTypeOf(u) === 'serial').map((u) => String(u.serialNumber)),
      availableKeys: mine.filter((u) => unitTypeOf(u) === 'key').map((u) => String(u.serialNumber)),
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
    const fields = ['name', 'sku', 'category', 'description', 'unit', 'hsnCode', 'supplierId']
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    if (body.gstApplicable !== undefined) data.gstApplicable = Boolean(body.gstApplicable)
    if (body.isDigitalProduct !== undefined) data.isDigitalProduct = Boolean(body.isDigitalProduct)
    for (const f of ['gstRate', 'costPrice', 'sellingPrice', 'quantity', 'minQuantity', 'warrantyDays']) {
      if (body[f] !== undefined) data[f] = Number(body[f])
    }
    const item: any = await updateRow('Items', id, data)

    // Append any newly typed serials / keys. syncItemUnits skips values that
    // already exist for this item, so re-saving an unchanged item is a no-op
    // rather than a duplicate-generating write.
    const units = await syncItemUnits({
      itemId: String(id),
      itemName: String(body.name || item?.name || ''),
      serialNumbers: body.serialNumbers,
      digitalKeys: body.isDigitalProduct === false ? undefined : body.digitalKeys,
      costPrice: Number(body.costPrice) || Number(item?.costPrice) || 0,
      warrantyDays: Number(body.warrantyDays) || 365,
    }).catch(() => ({ created: 0, serials: 0, keys: 0 }))

    return NextResponse.json({ ...item, unitsCreated: units.created })
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
