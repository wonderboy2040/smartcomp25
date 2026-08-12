/**
 * Item units — serial numbers and digital product keys.
 *
 * Both are "one tracked unit of an item", so both live in the ItemSerials
 * sheet and differ only by `type`:
 *   - 'serial' → a physical unit's serial number
 *   - 'key'    → a software licence / activation key
 *
 * Why not columns on the Items row? Because a unit has a lifecycle: it is in
 * stock, then it is sold to a named customer on a specific invoice, and it may
 * be under warranty. A newline-joined blob on the item row cannot record any
 * of that, which is why keys typed into the Add Item dialog previously went
 * nowhere and never reached the invoice.
 */
import { listRows, createRow, bulkCreate, bulkUpdate } from '@/lib/sheets-client'

export type UnitType = 'serial' | 'key'

export interface ItemUnit {
  id: string
  itemId: string
  itemName: string
  serialNumber: string
  type: UnitType
  status: string
  invoiceId?: string
  invoiceNumber?: string
  customerName?: string
  purchaseDate?: string
  warrantyDays?: number
  warrantyExpiry?: string
  costPrice?: number
  notes?: string
}

/** Split a textarea blob ("one per line") into clean, de-duplicated values. */
export function parseUnitList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return dedupe(raw.map((v) => String(v ?? '').trim()).filter(Boolean))
  }
  if (typeof raw !== 'string') return []
  return dedupe(
    raw
      .split(/[\r\n]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const k = v.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(v)
  }
  return out
}

/** Older rows predate the `type` column — treat an unset type as a serial. */
export function unitTypeOf(row: any): UnitType {
  return String(row?.type || '').toLowerCase() === 'key' ? 'key' : 'serial'
}

export function isAvailable(row: any): boolean {
  const status = String(row?.status || 'in_stock').toLowerCase()
  return status === 'in_stock' || status === 'returned' || status === ''
}

/**
 * Create ItemSerials rows for every serial/key that does not already exist for
 * this item. Safe to call on both create and edit — re-saving an item with the
 * same list is a no-op instead of duplicating every unit.
 *
 * Returns the number of rows actually created.
 */
export async function syncItemUnits(opts: {
  itemId: string
  itemName: string
  serialNumbers?: unknown
  digitalKeys?: unknown
  costPrice?: number
  warrantyDays?: number
  existing?: any[]
}): Promise<{ created: number; serials: number; keys: number }> {
  const serials = parseUnitList(opts.serialNumbers)
  const keys = parseUnitList(opts.digitalKeys)
  if (serials.length === 0 && keys.length === 0) return { created: 0, serials: 0, keys: 0 }

  const existing = opts.existing ?? (await listRows<any>('ItemSerials').catch(() => []))
  const known = new Set(
    existing
      .filter((row) => String(row?.itemId) === String(opts.itemId))
      .map((row) => `${unitTypeOf(row)}::${String(row?.serialNumber || '').trim().toLowerCase()}`),
  )

  const now = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  const push = (value: string, type: UnitType) => {
    if (known.has(`${type}::${value.toLowerCase()}`)) return
    known.add(`${type}::${value.toLowerCase()}`)
    rows.push({
      itemId: String(opts.itemId),
      itemName: String(opts.itemName || ''),
      serialNumber: value,
      type,
      status: 'in_stock',
      invoiceId: '',
      invoiceNumber: '',
      customerName: '',
      purchaseDate: now,
      warrantyDays: Number(opts.warrantyDays) || 365,
      warrantyExpiry: '',
      costPrice: Number(opts.costPrice) || 0,
      notes: '',
    })
  }
  for (const s of serials) push(s, 'serial')
  for (const k of keys) push(k, 'key')

  if (rows.length === 0) return { created: 0, serials: 0, keys: 0 }

  // bulkCreate is a single Apps Script call; falling back to one call per row
  // would turn a 20-key item into 20 round-trips.
  try {
    await bulkCreate('ItemSerials', rows)
  } catch {
    for (const row of rows) {
      await createRow('ItemSerials', row).catch(() => {})
    }
  }
  return {
    created: rows.length,
    serials: rows.filter((r) => r.type === 'serial').length,
    keys: rows.filter((r) => r.type === 'key').length,
  }
}

/**
 * Mark the given unit values as sold against an invoice. Matching is by
 * (itemId, type, value) so a key that is already sold is never reassigned.
 */
export async function markUnitsSold(
  assignments: {
    itemId?: string
    values: string[]
    type: UnitType
  }[],
  invoice: { id: string; number: string; customerName: string; date?: string },
): Promise<number> {
  const wanted = assignments.filter((a) => a.itemId && a.values.length > 0)
  if (wanted.length === 0) return 0

  const all = await listRows<any>('ItemSerials').catch(() => [])
  if (!Array.isArray(all) || all.length === 0) return 0

  const soldAt = invoice.date || new Date().toISOString()
  const updates: { id: string; data: Record<string, unknown> }[] = []

  for (const assignment of wanted) {
    for (const value of assignment.values) {
      const match = all.find(
        (row) =>
          String(row?.itemId) === String(assignment.itemId) &&
          unitTypeOf(row) === assignment.type &&
          String(row?.serialNumber || '').trim().toLowerCase() === value.trim().toLowerCase() &&
          isAvailable(row),
      )
      if (!match) continue
      // Do not let the same row be claimed twice within one invoice.
      if (updates.some((u) => u.id === String(match.id))) continue
      const warrantyDays = Number(match.warrantyDays) || 0
      updates.push({
        id: String(match.id),
        data: {
          status: 'sold',
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          customerName: invoice.customerName,
          purchaseDate: soldAt,
          warrantyExpiry: warrantyDays > 0
            ? new Date(new Date(soldAt).getTime() + warrantyDays * 24 * 60 * 60 * 1000).toISOString()
            : '',
        },
      })
    }
  }

  if (updates.length === 0) return 0
  await bulkUpdate('ItemSerials', updates)
  return updates.length
}
