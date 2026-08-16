import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, isConfigured } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * Audit Log API
 * Tracks all critical operations for compliance and security
 * Records: who, what, when, where (IP address)
 */

export async function GET(req: NextRequest) {
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

    if (action) logs = logs.filter((l) => l.action === action)
    if (resource) logs = logs.filter((l) => l.resource === resource)

    // Sort: newest first
    logs.sort((a, b) => new Date(b.timestamp || b.createdAt).getTime() - new Date(a.timestamp || a.createdAt).getTime())
    logs = logs.slice(0, limit)

    return NextResponse.json(logs, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

/**
 * Log an audit event
 * Call this from other API routes after critical operations
 */
export async function logAuditEvent(
  action: string,
  resource: string,
  resourceId: string,
  details: string,
  ipAddress: string
): Promise<void> {
  try {
    if (!isConfigured()) return

    await createRow('AuditLog', {
      action, // 'create' | 'update' | 'delete' | 'login' | 'export'
      resource, // 'invoice' | 'payment' | 'stock' | 'customer' | 'settings'
      resourceId,
      details, // JSON string with relevant info
      ipAddress,
      timestamp: new Date().toISOString(),
      user: 'admin', // TODO: Add user context when RBAC is implemented
    })
  } catch (e) {
    // Silent fail - audit logging should never break the main operation
    console.error('[AuditLog] Failed to log event:', e)
  }
}
