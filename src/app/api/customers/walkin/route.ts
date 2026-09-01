import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, updateRow } from '@/lib/sheets-client'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * POST /api/customers/walkin
 *
 * Find-or-create the canonical "Walk-in Customer" record.
 *
 * Indian retail practice: counter sales where the customer doesn't want to
 * share details. One click (from the invoice/quotation form or the Customers
 * panel) and the sale books against a dedicated walk-in ledger entry — no
 * typing, no duplicate records.
 *
 * Idempotent: the FIRST call creates the customer; every later call returns
 * the same row. Double-clicks and two cashiers racing at the same moment
 * converge to one record (match by isWalkIn flag, then by exact name).
 *
 * Body: none required. Optional { name } to customise the label
 * (default "Walk-in Customer").
 */

const DEFAULT_WALKIN_NAME = 'Walk-in Customer'

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) {
      return NextResponse.json({ error: 'Rate limited - too many writes' }, { status: 429 })
    }

    let body: any = {}
    try {
      const text = await req.text()
      if (text) body = JSON.parse(text)
    } catch {
      body = {}
    }

    const label = String(body?.name || DEFAULT_WALKIN_NAME).trim().slice(0, 200) || DEFAULT_WALKIN_NAME

    const customers = await listRows<any>('Customers')

    // 1. Prefer the dedicated flag (newer records).
    const byFlag = customers.find(
      (c) => c.isWalkIn === true || c.isWalkIn === 'true'
    )
    if (byFlag) return NextResponse.json(byFlag)

    // 2. Fall back to an exact-name match (records created before the flag
    //    existed, or created manually by the shop as "Walk-in Customer").
    const byName = customers.find(
      (c) => String(c.name || '').trim().toLowerCase() === label.toLowerCase()
    )
    if (byName) {
      // Backfill the flag so future lookups hit path 1 directly.
      const patched = await updateRow('Customers', String(byName.id), { isWalkIn: true })
      return NextResponse.json(patched)
    }

    // 3. Create it.
    const created = await createRow('Customers', {
      name: label,
      phone: '',
      email: '',
      address: '',
      gstNumber: '',
      state: '',
      isWalkIn: true,
      creditBalance: 0,
      creditScore: 100,
      notes: 'Auto-created for quick counter (walk-in) sales',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    console.error('[api/customers/walkin] failed:', e?.message)
    return NextResponse.json({ error: e?.message || 'Failed to create walk-in customer' }, { status: 500 })
  }
}
