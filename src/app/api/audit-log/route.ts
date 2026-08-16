import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * Audit Log API
 * Tracks all critical operations for compliance and security
 * Records: who, what, when, where (IP address)
 */

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    if (!isConfigured()) return NextResponse.json([])

    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const resource = url.searchParams.get('resource')
    const limit = parseInt(url.searchParams.get('limit') || '200')

    let logs = await listRows<any>('AuditLog')

    if (action) logs = logs.filter((l: any) => l.action === action)
    if (resource) logs = logs.filter((l: any) => l.resource === resource)

    // Sort: newest first
    logs.sort((a: any, b: any) => new Date(b.timestamp || b.createdAt).getTime() - new Date(a.timestamp || a.createdAt).getTime())
    logs = logs.slice(0, limit)

    return NextResponse.json(logs, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
