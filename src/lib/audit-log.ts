/**
 * Audit Log helper — import this from other API routes to log events.
 * Kept separate from the route file so Next.js route type-checking passes
 * (route files may only export HTTP verbs + config, not arbitrary functions).
 *
 * v13 UPGRADE: Now supports user identity (RBAC). If no user is available
 * (e.g. legacy PIN auth), falls back to 'admin' for backward compat.
 */

import { createRow, isConfigured } from '@/lib/sheets-client'

/**
 * Log a critical operation to the AuditLog collection.
 * Call this after any important create / update / delete / login / export.
 * Always fire-and-forget — never awaited in the critical path.
 *
 * @param user Optional user identifier (username, role, or RBAC user id).
 *             Pass undefined to fall back to 'admin' (legacy behavior).
 */
export async function logAuditEvent(
  action: string,
  resource: string,
  resourceId: string,
  details: string,
  ipAddress: string,
  user?: string,
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
      user: user || 'admin', // v13: now accepts RBAC user id; falls back to 'admin'
    })
  } catch (e) {
    // Silent fail — audit logging must never break the main operation
    console.error('[AuditLog] Failed to log event:', e)
  }
}
