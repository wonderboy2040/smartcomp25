import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow } from '@/lib/sheets-client'

import { safeJsonParse } from '@/lib/utils'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/amc — list all AMC contracts
 * Query: ?status=active|expired|expiring
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const statusFilter = url.searchParams.get('status')

    let contracts = await listRows<any>('AMCContracts')

    // Compute status dynamically if not set
    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const result = contracts.map((c) => {
      const endDate = c.endDate ? new Date(c.endDate) : null
      let dynamicStatus = 'active'
      if (endDate) {
        if (endDate < now) dynamicStatus = 'expired'
        else if (endDate < in30Days) dynamicStatus = 'expiring'
      }

      return {
        ...c,
        contractNumber: String(c?.contractNumber || ''),
        customerId: String(c?.customerId || ''),
        customerName: String(c?.customerName || ''),
        customerPhone: String(c?.customerPhone || ''),
        customerAddress: String(c?.customerAddress || ''),
        devicesCovered: safeJsonParse<any[]>(c?.devicesCoveredJson, []),
        startDate: c?.startDate || '',
        endDate: c?.endDate || '',
        fee: Number(c?.fee) || 0,
        frequency: String(c?.frequency || 'monthly'),
        visitsIncluded: Number(c?.visitsIncluded) || 0,
        visitsUsed: Number(c?.visitsUsed) || 0,
        visitsRemaining: (Number(c?.visitsIncluded) || 0) - (Number(c?.visitsUsed) || 0),
        lastVisitDate: c?.lastVisitDate || '',
        nextVisitDate: c?.nextVisitDate || '',
        status: c?.status || dynamicStatus,
        dynamicStatus,
        notes: String(c?.notes || ''),
      }
    })

    if (statusFilter) {
      const filtered = result.filter((c) => c.dynamicStatus === statusFilter || c.status === statusFilter)
      return NextResponse.json(filtered)
    }

    result.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

/**
 * POST /api/amc — create a new AMC contract
 * Generates contract number: AMC2026-001
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited — too many writes, wait a moment' }, { status: 429 })

    const body = await req.json()

    // Generate contract number
    const existing = await listRows<any>('AMCContracts')
    const year = new Date().getFullYear()
    const yearCount = existing.filter((c) => String(c.contractNumber || '').includes(String(year))).length
    const contractNumber = `AMC${year}-${String(yearCount + 1).padStart(3, '0')}`

    const devices = body.devicesCovered || []
    const startDate = body.startDate || new Date().toISOString()
    const frequency = String(body.frequency || 'monthly')

    // Calculate end date based on frequency
    const start = new Date(startDate)
    let endDate = new Date(start)
    if (frequency === 'monthly') endDate.setMonth(endDate.getMonth() + 1)
    else if (frequency === 'quarterly') endDate.setMonth(endDate.getMonth() + 3)
    else if (frequency === 'half-yearly') endDate.setMonth(endDate.getMonth() + 6)
    else if (frequency === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1)

    // Calculate next visit date
    let nextVisit = new Date(start)
    if (frequency === 'monthly') nextVisit.setMonth(nextVisit.getMonth() + 1)
    else if (frequency === 'quarterly') nextVisit.setMonth(nextVisit.getMonth() + 3)
    else if (frequency === 'half-yearly') nextVisit.setMonth(nextVisit.getMonth() + 6)
    else if (frequency === 'yearly') nextVisit.setFullYear(nextVisit.getFullYear() + 1)

    const contract = await createRow('AMCContracts', {
      contractNumber,
      customerId: String(body.customerId || ''),
      customerName: String(body.customerName || ''),
      customerPhone: String(body.customerPhone || ''),
      customerAddress: String(body.customerAddress || ''),
      devicesCoveredJson: JSON.stringify(devices),
      startDate,
      endDate: endDate.toISOString(),
      fee: Number(body.fee) || 0,
      frequency,
      visitsIncluded: Number(body.visitsIncluded) || 0,
      visitsUsed: 0,
      lastVisitDate: '',
      nextVisitDate: nextVisit.toISOString(),
      status: 'active',
      notes: String(body.notes || ''),
    })

    return NextResponse.json(contract)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
