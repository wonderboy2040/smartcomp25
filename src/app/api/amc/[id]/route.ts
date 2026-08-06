import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow } from '@/lib/sheets-client'
import { safeJsonParse } from '@/lib/utils'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const c = await getRow<any>('AMCContracts', id)
    if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({
      ...c,
      devicesCovered: safeJsonParse<any[]>(c.devicesCoveredJson, []),
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

    if (action === 'logVisit') {
      // Log a service visit — increment visitsUsed, update lastVisitDate, calculate nextVisitDate
      const contract = await getRow<any>('AMCContracts', id)
      if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const visitsUsed = (Number(contract.visitsUsed) || 0) + 1
      const now = new Date()
      const frequency = String(contract.frequency || 'monthly')
      let nextVisit = new Date(now)
      if (frequency === 'monthly') nextVisit.setMonth(nextVisit.getMonth() + 1)
      else if (frequency === 'quarterly') nextVisit.setMonth(nextVisit.getMonth() + 3)
      else if (frequency === 'half-yearly') nextVisit.setMonth(nextVisit.getMonth() + 6)
      else if (frequency === 'yearly') nextVisit.setFullYear(nextVisit.getFullYear() + 1)

      const updated = await updateRow('AMCContracts', id, {
        visitsUsed,
        lastVisitDate: now.toISOString(),
        nextVisitDate: nextVisit.toISOString(),
        notes: String(body.notes || contract.notes || ''),
      })

      return NextResponse.json({ success: true, contract: updated })
    }

    if (action === 'renew') {
      // Renew contract — extend end date by 1 period
      const contract = await getRow<any>('AMCContracts', id)
      if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const currentEnd = new Date(contract.endDate || Date.now())
      const frequency = String(contract.frequency || 'yearly')
      let newEnd = new Date(currentEnd)
      if (frequency === 'monthly') newEnd.setMonth(newEnd.getMonth() + 1)
      else if (frequency === 'quarterly') newEnd.setMonth(newEnd.getMonth() + 3)
      else if (frequency === 'half-yearly') newEnd.setMonth(newEnd.getMonth() + 6)
      else newEnd.setFullYear(newEnd.getFullYear() + 1)

      let nextVisit = new Date()
      if (frequency === 'monthly') nextVisit.setMonth(nextVisit.getMonth() + 1)
      else if (frequency === 'quarterly') nextVisit.setMonth(nextVisit.getMonth() + 3)
      else if (frequency === 'half-yearly') nextVisit.setMonth(nextVisit.getMonth() + 6)
      else nextVisit.setFullYear(nextVisit.getFullYear() + 1)

      const updated = await updateRow('AMCContracts', id, {
        status: 'active',
        endDate: newEnd.toISOString(),
        nextVisitDate: nextVisit.toISOString(),
        visitsUsed: 0, // reset visits on renewal
        fee: Number(body.fee) || Number(contract.fee) || 0,
      })

      return NextResponse.json({ success: true, contract: updated })
    }

    if (action === 'update') {
      const data: any = {}
      const fields = ['customerName', 'customerPhone', 'customerAddress', 'fee', 'frequency', 'visitsIncluded', 'startDate', 'endDate', 'status', 'notes']
      for (const f of fields) {
        if (body[f] !== undefined) data[f] = body[f]
      }
      if (body.devicesCovered !== undefined) {
        data.devicesCoveredJson = JSON.stringify(body.devicesCovered)
      }
      const updated = await updateRow('AMCContracts', id, data)
      return NextResponse.json({ success: true, contract: updated })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteRow('AMCContracts', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
