import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow, listRows, createRow, bulkUpdate, completeJobFull } from '@/lib/sheets-client'
import { safeJsonParse } from '@/lib/utils'
import { sendJobStatusNotification } from '@/lib/notifications'

const VALID_STATUSES = new Set(['Pending', 'Device Received', 'In Progress', 'Completed', 'Delivered'])

type ServicePart = {
  name: string
  qty: number
  costPrice: number
  sellPrice: number
  itemId?: string
  sku?: string
}

const money = (value: any) => Math.round((Number(value) || 0) * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function normalizeParts(parts: any): ServicePart[] {
  if (!Array.isArray(parts)) return []
  return parts
    .map((p) => ({
      name: String(p?.name || '').trim(),
      qty: Math.max(1, Number(p?.qty) || 1),
      costPrice: money(p?.costPrice),
      sellPrice: money(p?.sellPrice ?? p?.price),
      itemId: p?.itemId ? String(p.itemId) : '',
      sku: p?.sku ? String(p.sku) : '',
    }))
    .filter((p) => p.name)
}

function getPartsTotals(parts: ServicePart[]) {
  const cost = money(parts.reduce((s, p) => s + p.costPrice * p.qty, 0))
  const sell = money(parts.reduce((s, p) => s + p.sellPrice * p.qty, 0))
  return { cost, sell, profit: money(sell - cost) }
}

function getLedger(job: any, totalOverride?: number) {
  const total = money(totalOverride ?? (Number(job?.finalAmount) || Number(job?.estimatedAmount) || 0))
  const advance = money(job?.advanceAmount)
  const paid = money(job?.paidAmount)
  const paidTotal = money(advance + paid)
  const balanceDue = money(Math.max(0, total - paidTotal))
  return { total, advance, paid, paidTotal, balanceDue }
}

async function validateStockAvailability(stockUpdates: { id: string; deductQty: number }[]) {
  if (stockUpdates.length === 0) return null
  const dbItems = await Promise.all(stockUpdates.map((s) => getRow<any>('Items', s.id).catch(() => null)))
  const problems: string[] = []

  for (const upd of stockUpdates) {
    const item = dbItems.find((d: any) => d && String(d.id) === String(upd.id))
    if (!item) {
      problems.push(`Stock item ${upd.id} not found`)
      continue
    }
    const available = Number(item.quantity) || 0
    if (available < upd.deductQty) {
      problems.push(`${item.name || upd.id}: available ${available}, required ${upd.deductQty}`)
    }
  }

  return problems.length > 0 ? problems : null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const job = await getRow<any>('Jobs', id)
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const partsUsed = safeJsonParse<any[]>(job.partsUsedJson, [])
    const ledger = getLedger(job)
    return NextResponse.json({
      ...job,
      ...ledger,
      partsUsed,
      statusHistory: safeJsonParse<any[]>(job.statusHistoryJson, []),
      feedbackRating: Number(job.feedbackRating) || 0,
      feedbackComment: String(job.feedbackComment || ''),
      feedbackAt: String(job.feedbackAt || ''),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action } = body

    async function appendStatusAndNotify(jobId: string, job: any, newStatus: string, note: string, updatedJob: any) {
      try {
        const history = safeJsonParse<any[]>(job?.statusHistoryJson, [])
        const last = history[history.length - 1]
        if (!last || String(last.status) !== newStatus || String(last.note || '') !== note) {
          history.push({ status: newStatus, timestamp: new Date().toISOString(), note })
          await updateRow('Jobs', jobId, { statusHistoryJson: JSON.stringify(history) }).catch(() => {})
        }

        const shopRows = await listRows<any>('Shop', { useCache: true })
        const shopName = String(shopRows[0]?.name || 'Smart Computers')
        const baseUrl = String(process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
        const trackUrl = job?.trackToken ? `${baseUrl}/track/${job.jobId}-${job.trackToken}` : undefined
        const notif = await sendJobStatusNotification(
          { ...job, ...updatedJob },
          newStatus,
          shopName,
          trackUrl
        )
        return notif
      } catch {
        return null
      }
    }

    if (action === 'updateStatus') {
      const existing = await getRow<any>('Jobs', id)
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const newStatus = String(body?.status || 'Pending')
      if (!VALID_STATUSES.has(newStatus)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }

      // Completion is a financial transaction. Force the dedicated action so
      // parts, warranty, stock, payment, and profit share stay consistent.
      if (newStatus === 'Completed' && String(existing.status) !== 'Completed' && String(existing.status) !== 'Delivered') {
        return NextResponse.json({ error: 'Use Complete Job action to mark a job completed.' }, { status: 400 })
      }

      const data: any = { status: newStatus, updatedAt: new Date().toISOString() }
      if (body.notes !== undefined) data.notes = String(body.notes || '')
      if (body.assignedEngineer !== undefined) data.assignedEngineer = String(body.assignedEngineer || '')
      if (newStatus === 'Delivered' && !existing.deliveredAt) data.deliveredAt = new Date().toISOString()

      const updated = await updateRow('Jobs', id, data)

      let notifResult: any = null
      if (String(existing.status) !== newStatus) {
        notifResult = await appendStatusAndNotify(id, existing, newStatus, `Status changed to ${newStatus}`, updated)
      }

      return NextResponse.json({ success: true, job: updated, notification: notifResult })
    }

    if (action === 'complete') {
      const startTime = Date.now()
      const existing = await getRow<any>('Jobs', id)
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      if (String(existing.status) === 'Delivered') {
        return NextResponse.json({ error: 'Delivered job cannot be completed again' }, { status: 400 })
      }

      const partsUsed = normalizeParts(body?.partsUsed)
      const finalAmount = money(body?.finalAmount)
      if (finalAmount <= 0) {
        return NextResponse.json({ error: 'Final amount must be greater than 0' }, { status: 400 })
      }

      const paymentMode = String(body?.paymentMode || 'Cash')
      const warrantyDays = clamp(Number(body?.warrantyDays) || Number(existing?.warrantyDays) || 30, 0, 3650)
      const deductStock = body?.deductStock !== false

      const totals = getPartsTotals(partsUsed)
      const svcCharge = money(body?.serviceCharge)
      const actualServiceProfit = svcCharge
      const grossProfit = money(actualServiceProfit + totals.profit)
      const warrantyExpiry = warrantyDays > 0
        ? new Date(Date.now() + warrantyDays * 24 * 60 * 60 * 1000).toISOString()
        : ''

      // Prepare stock updates for ultra-fast transaction.
      const stockUpdates: { id: string; deductQty: number }[] = []
      if (deductStock && partsUsed.length > 0) {
        const qtyMap = new Map<string, number>()
        for (const p of partsUsed) {
          if (p.itemId) qtyMap.set(p.itemId, (qtyMap.get(p.itemId) || 0) + p.qty)
        }
        for (const [itemId, qty] of qtyMap.entries()) stockUpdates.push({ id: itemId, deductQty: qty })

        const stockProblems = await validateStockAvailability(stockUpdates)
        if (stockProblems) {
          return NextResponse.json({
            error: 'Insufficient stock for selected parts',
            details: stockProblems,
          }, { status: 400 })
        }
      }

      const advance = money(existing.advanceAmount)
      const alreadyPaid = money(existing.paidAmount)
      const outstandingBeforePayment = money(Math.max(0, finalAmount - advance - alreadyPaid))
      const requestedPayment = body?.paymentReceivedNow !== undefined
        ? money(body?.paymentReceivedNow)
        : outstandingBeforePayment
      const paymentReceivedNow = money(clamp(requestedPayment, 0, outstandingBeforePayment))
      const newPaidAmount = money(alreadyPaid + paymentReceivedNow)
      const balanceDueAfter = money(Math.max(0, finalAmount - advance - newPaidAmount))

      const payment = paymentReceivedNow > 0 ? {
        jobId: String(existing.jobId || ''),
        customerName: String(existing.customerName || ''),
        amount: paymentReceivedNow,
        mode: paymentMode,
        type: balanceDueAfter <= 0 ? 'Final' : 'Partial',
        date: new Date().toISOString(),
        notes: balanceDueAfter <= 0 ? 'Final payment at job completion' : 'Partial payment at job completion',
      } : null

      const completedPayload = {
        id,
        status: 'Completed',
        partsUsedJson: JSON.stringify(partsUsed),
        finalAmount,
        serviceCharge: svcCharge,
        paidAmount: newPaidAmount,
        paymentMode,
        // v11.2: record the payment type on the job for reporting/ledger view
        paymentType: paymentReceivedNow > 0 ? (balanceDueAfter <= 0 ? 'Final' : 'Partial') : 'Unpaid',
        partsProfit: totals.profit,
        serviceProfit: actualServiceProfit,
        grossProfit,
        warrantyDays,
        warrantyExpiry,
        completedDate: new Date().toISOString(),
        diagnosisNotes: String(body?.diagnosisNotes || existing?.diagnosisNotes || ''),
        notes: String(body?.notes || existing?.notes || ''),
        stockUpdates: stockUpdates.length > 0 ? stockUpdates : undefined,
        payment: payment || undefined,
      }

      // ULTRA FAST: Single Apps Script call does job update + stock deduction + payment.
      try {
        const result = await completeJobFull(completedPayload)

        const notifResult = await appendStatusAndNotify(id, existing, 'Completed', 'Job completed', result.data)
        const elapsed = Date.now() - startTime

        return NextResponse.json({
          success: true,
          job: result.data,
          grossProfit,
          partsProfit: totals.profit,
          serviceProfit: actualServiceProfit,
          warrantyExpiry,
          paymentReceivedNow,
          paidAmount: newPaidAmount,
          balanceDue: balanceDueAfter,
          stockDeducted: deductStock && stockUpdates.length > 0,
          notification: notifResult,
          ultraFast: true,
          elapsedMs: elapsed,
        }, {
          headers: {
            'X-Ultra-Fast': 'true',
            'X-Elapsed-Ms': elapsed.toString(),
          }
        })
      } catch (err: any) {
        // Fallback to old multi-call method if ultra fast fails.
        console.error('Ultra fast complete failed, falling back:', err)
        const updated = await updateRow('Jobs', id, {
          status: 'Completed',
          partsUsedJson: JSON.stringify(partsUsed),
          finalAmount,
          serviceCharge: svcCharge,
          paidAmount: newPaidAmount,
          paymentMode,
          partsProfit: totals.profit,
          serviceProfit: actualServiceProfit,
          grossProfit,
          warrantyDays,
          warrantyExpiry,
          completedDate: new Date().toISOString(),
          diagnosisNotes: String(body?.diagnosisNotes || existing?.diagnosisNotes || ''),
          notes: String(body?.notes || existing?.notes || ''),
        })

        if (deductStock && stockUpdates.length > 0) {
          try {
            const itemIds = stockUpdates.map(s => s.id)
            const dbItems = await Promise.all(itemIds.map((itemId: string) => getRow<any>('Items', itemId).catch(() => null)))
            const finalUpdates: { id: string; data: any }[] = []
            for (const upd of stockUpdates) {
              const dbItem = dbItems.find((d: any) => d && String(d.id) === String(upd.id))
              if (dbItem) {
                finalUpdates.push({
                  id: upd.id,
                  data: { quantity: Math.max(0, (Number(dbItem.quantity) || 0) - upd.deductQty) }
                })
              }
            }
            if (finalUpdates.length > 0) await bulkUpdate('Items', finalUpdates).catch(() => {})
          } catch {}
        }

        if (payment) await createRow('ServicePayments', payment).catch(() => {})

        const notifResult = await appendStatusAndNotify(id, existing, 'Completed', 'Job completed', updated)
        return NextResponse.json({
          success: true,
          job: updated,
          grossProfit,
          partsProfit: totals.profit,
          serviceProfit: actualServiceProfit,
          warrantyExpiry,
          paymentReceivedNow,
          paidAmount: newPaidAmount,
          balanceDue: balanceDueAfter,
          stockDeducted: deductStock && stockUpdates.length > 0,
          notification: notifResult,
          ultraFast: false,
          fallback: true,
        })
      }
    }

    if (action === 'deliver') {
      const existing = await getRow<any>('Jobs', id)
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (String(existing.status) !== 'Completed') {
        return NextResponse.json({ error: 'Only completed jobs can be marked delivered' }, { status: 400 })
      }

      const updated = await updateRow('Jobs', id, {
        status: 'Delivered',
        deliveredAt: new Date().toISOString(),
      })

      const notifResult = await appendStatusAndNotify(id, existing, 'Delivered', 'Job delivered to customer', updated)
      return NextResponse.json({ success: true, job: updated, notification: notifResult })
    }

    if (action === 'addPart') {
      const job = await getRow<any>('Jobs', id)
      if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const existing = normalizeParts(safeJsonParse<any[]>(job.partsUsedJson, []))
      existing.push(...normalizeParts([body?.part]))
      await updateRow('Jobs', id, { partsUsedJson: JSON.stringify(existing) })
      return NextResponse.json({ success: true, partsUsed: existing })
    }

    if (action === 'update') {
      const data: any = { updatedAt: new Date().toISOString() }
      // String fields - safe to copy directly
      const stringFields = [
        'customerName', 'customerMobile', 'deviceType', 'brandModel', 'serialNumber',
        'problemDesc', 'accessories', 'serviceType', 'priority',
        'advanceMode', 'assignedEngineer', 'notes', 'diagnosisNotes',
      ]
      for (const f of stringFields) {
        if (body[f] !== undefined) data[f] = String(body[f] ?? '')
      }
      // Number fields - must coerce to avoid string values in sheet
      const numberFields = [
        'estimatedAmount', 'advanceAmount', 'warrantyDays',
        'serviceCharge', 'finalAmount',
      ]
      for (const f of numberFields) {
        if (body[f] !== undefined) data[f] = money(body[f])
      }
      if (body.warrantyDays !== undefined) data.warrantyDays = Math.max(0, Number(body.warrantyDays) || 0)
      if (body.partsUsed !== undefined || body.partsUsedJson !== undefined) {
        const parts = normalizeParts(body.partsUsed || safeJsonParse(body.partsUsedJson, []))
        data.partsUsedJson = JSON.stringify(parts)
        const totals = getPartsTotals(parts)
        data.partsProfit = totals.profit
        const svcCharge = body.serviceCharge !== undefined ? money(body.serviceCharge) : undefined
        if (svcCharge !== undefined) {
          data.serviceCharge = svcCharge
          data.serviceProfit = svcCharge
          data.finalAmount = money(svcCharge + totals.sell)
        } else {
          const existing = await getRow<any>('Jobs', id)
          const existingSvc = money(existing?.serviceCharge)
          data.finalAmount = money(existingSvc + totals.sell)
        }
      }
      const updated = await updateRow('Jobs', id, data)
      return NextResponse.json({ success: true, job: updated })
    }

    if (action === 'recordPayment') {
      const existing = await getRow<any>('Jobs', id)
      if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const amount = money(body?.amount)
      const mode = String(body?.mode || 'Cash')
      if (amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

      const ledger = getLedger(existing)
      if (ledger.total > 0 && amount > ledger.balanceDue) {
        return NextResponse.json({
          error: `Payment exceeds balance due (${ledger.balanceDue})`,
          balanceDue: ledger.balanceDue,
        }, { status: 400 })
      }

      const newPaid = money((Number(existing.paidAmount) || 0) + amount)
      const balanceAfter = money(Math.max(0, ledger.total - ledger.advance - newPaid))
      const updated = await updateRow('Jobs', id, {
        paidAmount: newPaid,
        paymentMode: mode,
        // v11.2: reflect whether the job is now fully settled
        paymentType: balanceAfter <= 0 ? 'Final' : 'Partial',
        updatedAt: new Date().toISOString(),
      })

      await createRow('ServicePayments', {
        jobId: String(existing.jobId || ''),
        customerName: String(existing.customerName || ''),
        amount,
        mode,
        type: balanceAfter <= 0 ? 'Final' : 'Partial',
        date: String(body?.date || new Date().toISOString()),
        notes: String(body?.notes || (balanceAfter <= 0 ? 'Final service payment recorded' : 'Partial service payment recorded')),
      }).catch(() => {})

      return NextResponse.json({ success: true, job: updated, paidAmount: newPaid, balanceDue: balanceAfter })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // Before soft-deleting the job, restore any stock that was deducted when
    // the job was completed. Without this, deleting a completed job silently
    // loses the parts forever in the Items sheet.
    const job = await getRow<any>('Jobs', id).catch(() => null)
    if (job && String(job.status) === 'Completed') {
      try {
        const parts = normalizeParts(safeJsonParse<any[]>(job.partsUsedJson, []))
        const stockReturns: { id: string; deductQty: number }[] = []
        if (parts.length > 0) {
          const qtyMap = new Map<string, number>()
          for (const p of parts) {
            if (p.itemId) qtyMap.set(p.itemId, (qtyMap.get(p.itemId) || 0) + p.qty)
          }
          for (const [itemId, qty] of qtyMap.entries()) {
            // negative deductQty = add back to stock
            stockReturns.push({ id: itemId, deductQty: -qty })
          }
          const dbItems = await Promise.all(
            stockReturns.map((s) => getRow<any>('Items', s.id).catch(() => null))
          )
          const finalUpdates: { id: string; data: any }[] = []
          for (const upd of stockReturns) {
            const dbItem = dbItems.find((d: any) => d && String(d.id) === String(upd.id))
            if (dbItem) {
              finalUpdates.push({
                id: upd.id,
                data: { quantity: (Number(dbItem.quantity) || 0) + Math.abs(upd.deductQty) },
              })
            }
          }
          if (finalUpdates.length > 0) {
            await bulkUpdate('Items', finalUpdates).catch(() => {})
          }
        }
      } catch (stockErr: any) {
        // Log but don't block the delete — stock restore is best-effort.
        console.error('[Jobs DELETE] Stock restore failed:', stockErr?.message)
      }
    }
    // v11.2: soft-delete the job's service payments too (keeps ledger clean)
    try {
      const allPays = await listRows<any>('ServicePayments')
      const jobPays = allPays.filter((p) => String(p.jobId) === String(job?.jobId || job?.id))
      await Promise.all(jobPays.map((p) => deleteRow('ServicePayments', String(p.id)).catch(() => {})))
    } catch {}
    await deleteRow('Jobs', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
