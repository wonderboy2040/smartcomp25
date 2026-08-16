/**
 * Audit Log helper — import this from other API routes to log events.
 * Kept separate from the route file so Next.js route type-checking passes
 * (route files may only export HTTP verbs + config, not arbitrary functions).
 */

import { createRow, isConfigured } from '@/lib/sheets-client'

/**
 * Log a critical operation to the AuditLog collection.
 * Call this after any important create / update / delete / login / export.
 * Always fire-and-forget — never awaited in the critical path.
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
      action,    // 'create' | 'update' | 'delete' | 'login' | 'export'
      resource,  // 'invoice' | 'payment' | 'stock' | 'customer' | 'settings'
      resourceId,
      details,   // JSON string with relevant info
      ipAddress,
      timestamp: new Date().toISOString(),
      user: 'admin', // extend when RBAC is added
    })
  } catch (e) {
    // Silent fail — audit logging must never break the main operation
    console.error('[AuditLog] Failed to log event:', e)
  }
}
