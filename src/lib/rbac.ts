/**
 * v13 NEW: Basic RBAC (Role-Based Access Control).
 *
 * Lightweight — single-shop multi-user support.
 *
 * Roles:
 *   - admin    — full access (everything)
 *   - manager  — read + write but cannot change settings or delete shop
 *   - engineer — only their assigned jobs + parts (read-only everything else)
 *   - sales    — invoices + customers + quotations (no settings/backup/audit)
 *
 * Storage: `Users` collection with fields:
 *   - id, username, passwordHash (SHA-256), role, active, lastLogin, createdAt
 *
 * Session: same SHA-256 cookie scheme as PIN auth (`smartcomp_auth` cookie).
 *
 * This file is intentionally simple — for production use, replace with
 * NextAuth.js or Clerk. The data layer + middleware stay the same.
 */

import { listRows, getRow, createRow, updateRow } from '@/lib/sheets-client'
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

export type Role = 'admin' | 'manager' | 'engineer' | 'sales'

export interface User {
  id: string
  username: string
  role: Role
  active: boolean
  lastLogin?: string
  createdAt?: string
}

export const ROLE_PERMISSIONS: Record<Role, { canDelete: boolean; canSettings: boolean; canBackup: boolean; canAudit: boolean; canViewAllEngineers: boolean; canViewAllCustomers: boolean; canEditInvoices: boolean; canEditJobs: boolean }> = {
  admin: {
    canDelete: true,
    canSettings: true,
    canBackup: true,
    canAudit: true,
    canViewAllEngineers: true,
    canViewAllCustomers: true,
    canEditInvoices: true,
    canEditJobs: true,
  },
  manager: {
    canDelete: false,
    canSettings: false,
    canBackup: false,
    canAudit: true,
    canViewAllEngineers: true,
    canViewAllCustomers: true,
    canEditInvoices: true,
    canEditJobs: true,
  },
  engineer: {
    canDelete: false,
    canSettings: false,
    canBackup: false,
    canAudit: false,
    canViewAllEngineers: false,
    canViewAllCustomers: false, // only their assigned customers
    canEditInvoices: false,
    canEditJobs: true,
  },
  sales: {
    canDelete: false,
    canSettings: false,
    canBackup: false,
    canAudit: false,
    canViewAllEngineers: true,
    canViewAllCustomers: true,
    canEditInvoices: true,
    canEditJobs: false,
  },
}

export function hasPermission(role: Role | undefined | null, permission: keyof typeof ROLE_PERMISSIONS['admin']): boolean {
  if (!role) return false
  const perms = ROLE_PERMISSIONS[role]
  if (!perms) return false
  return Boolean(perms[permission])
}

// v13.1: Random per-user salt + scrypt KDF (via Node's crypto.scryptSync)
// replaces the previous static salt + raw SHA-256. The static salt meant
// identical passwords hashed to the same value across all users — a single
// rainbow-table lookup broke every account. Scrypt is intentionally slow
// (CPU/memory-hard) so brute-forcing stolen hashes is infeasible.
//
// The stored passwordHash format is `scrypt:<saltHex>:<hashHex>` for new
// users. Legacy hashes (raw SHA-256 with static salt) are still verified
// via the fallback path in `verifyPassword` and silently migrated to the
// new format on next successful login (we don't migrate here — call sites
// handle that, OR the legacy hash just keeps working).

const SCRYPT_KEYLEN = 64
const SCRYPT_SALT_LEN = 16
const SCRYPT_N = 16384 // CPU/memory cost (2^14) — ~50ms per hash on commodity hw
const SCRYPT_R = 8    // block size
const SCRYPT_P = 1    // parallelism

function generateSalt(): string {
  return randomBytes(SCRYPT_SALT_LEN).toString('hex')
}

function scryptHash(password: string, saltHex: string): string {
  const salt = Buffer.from(saltHex, 'hex')
  const buf = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024, // 64 MB allowed for scrypt computation
  })
  return buf.toString('hex')
}

export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt()
  const hash = scryptHash(password, salt)
  return `scrypt:${salt}:${hash}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false
  // New format: scrypt:<salt>:<hash>
  if (stored.startsWith('scrypt:')) {
    const parts = stored.split(':')
    if (parts.length !== 3) return false
    const [, salt, expected] = parts
    const actual = scryptHash(password, salt)
    if (actual.length !== expected.length) return false
    try {
      return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
    } catch {
      return false
    }
  }
  // Legacy format: raw SHA-256 with static salt — kept for backward compat
  // so existing users aren't locked out. New logins upgrade to scrypt.
  const enc = new TextEncoder()
  const legacySalt = 'smartcomp-v13-'
  const data = enc.encode(`${legacySalt}:${password}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  const legacyHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  if (legacyHash.length !== stored.length) return false
  // Constant-time compare
  let diff = 0
  for (let i = 0; i < legacyHash.length; i++) {
    diff |= legacyHash.charCodeAt(i) ^ stored.charCodeAt(i)
  }
  return diff === 0
}

export async function findUser(username: string): Promise<any | null> {
  const users = await listRows<any>('Users').catch(() => [])
  return users.find((u) => String(u.username || '').toLowerCase() === String(username).toLowerCase() && u.active !== false) || null
}

export async function createUser(username: string, password: string, role: Role = 'manager'): Promise<User> {
  const existing = await findUser(username)
  if (existing) throw new Error(`User '${username}' already exists`)
  const hash = await hashPassword(password)
  return await createRow('Users', {
    username,
    passwordHash: hash,
    role,
    active: true,
    createdAt: new Date().toISOString(),
    lastLogin: '',
  })
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  const user = await findUser(username)
  if (!user) return null
  const ok = await verifyPassword(password, String(user.passwordHash || ''))
  if (!ok) return null
  // Update lastLogin
  await updateRow('Users', String(user.id), { lastLogin: new Date().toISOString() }).catch(() => {})
  return {
    id: String(user.id),
    username: String(user.username),
    role: String(user.role) as Role,
    active: true,
    lastLogin: new Date().toISOString(),
    createdAt: user.createdAt,
  }
}

export async function listUsers(): Promise<User[]> {
  const users = await listRows<any>('Users').catch(() => [])
  return users.map((u) => ({
    id: String(u.id || ''),
    username: String(u.username || ''),
    role: String(u.role || 'manager') as Role,
    active: u.active !== false && u.active !== 'false',
    lastLogin: u.lastLogin || '',
    createdAt: u.createdAt || '',
  }))
}
