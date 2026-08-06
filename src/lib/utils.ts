import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function str(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  try {
    return String(v)
  } catch {
    return fallback
  }
}

export function strPath(obj: unknown, ...keys: string[]): string {
  let cur: unknown = obj
  for (const k of keys) {
    if (cur === null || cur === undefined) return ""
    cur = (cur as Record<string, unknown>)[k]
  }
  return str(cur)
}

export function lower(v: unknown): string {
  return str(v).toLowerCase()
}

export function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback
  const n = typeof v === "number" ? v : Number(v)
  return isNaN(n) ? fallback : n
}

export function safeJsonParse<T>(str: unknown, fallback: T): T {
  if (str === null || str === undefined || str === "") return fallback
  try {
    const parsed = JSON.parse(String(str))
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function formatDate(v: unknown, locale = "en-IN"): string {
  if (!v) return ""
  try {
    const d = new Date(v as string | number | Date)
    if (isNaN(d.getTime())) return ""
    return d.toLocaleDateString(locale)
  } catch {
    return ""
  }
}

export function formatDateTime(v: unknown, locale = "en-IN"): string {
  if (!v) return ""
  try {
    const d = new Date(v as string | number | Date)
    if (isNaN(d.getTime())) return ""
    return d.toLocaleString(locale)
  } catch {
    return ""
  }
}

// ===== NEW v3.0 HELPERS =====

export function formatRelativeTime(date: string | Date): string {
  try {
    const now = new Date()
    const d = new Date(date)
    const diff = now.getTime() - d.getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return formatDate(date)
  } catch {
    return formatDate(date)
  }
}

export function truncate(str: string, len: number): string {
  if (!str) return ''
  if (str.length <= len) return str
  return str.slice(0, len) + '...'
}

export function generateId(prefix = ''): string {
  const random = Math.random().toString(36).slice(2, 9)
  const time = Date.now().toString(36)
  return `${prefix}${time}${random}`.toUpperCase()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `any[]` is required here: `unknown[]` would reject every concrete callback passed in.
export function debounce<T extends (...args: any[]) => unknown>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), wait)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same constraint reason as debounce above.
export function throttle<T extends (...args: any[]) => unknown>(fn: T, limit: number): (...args: Parameters<T>) => void {
  let inThrottle = false
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

export function toCSV(data: Array<Record<string, unknown>>, headers?: string[]): string {
  if (!data.length) return ''
  const keys = headers || Object.keys(data[0])
  const csvHeaders = keys.join(',')
  const rows = data.map(row => 
    keys.map(key => {
      const val = row[key]
      if (val === null || val === undefined) return ''
      const str = String(val).replace(/"/g, '""')
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str
    }).join(',')
  )
  return [csvHeaders, ...rows].join('\n')
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export function downloadJSON(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false)
  }
  // Fallback
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    return Promise.resolve(true)
  } catch {
    return Promise.resolve(false)
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.replace(/\D/g, '').slice(-10))
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) return `+91 ${cleaned.slice(0,5)} ${cleaned.slice(5)}`
  if (cleaned.length === 12 && cleaned.startsWith('91')) return `+91 ${cleaned.slice(2,7)} ${cleaned.slice(7)}`
  return phone
}

// Group array by key
export function groupBy<T>(arr: T[], key: keyof T | ((item: T) => string)): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const groupKey = typeof key === 'function' ? key(item) : String((item as Record<string, unknown>)[key as string] || 'Unknown')
    if (!acc[groupKey]) acc[groupKey] = []
    acc[groupKey].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// Sum by key
export function sumBy<T>(arr: T[], key: keyof T | ((item: T) => number)): number {
  return arr.reduce((sum, item) => {
    const val = typeof key === 'function' ? key(item) : Number((item as Record<string, unknown>)[key as string] || 0)
    return sum + (isNaN(val) ? 0 : val)
  }, 0)
}

// ===== NEW v3.1 HELPERS — added for existing-feature upgrades =====

/**
 * Pretty file size: 1536 → "1.5 KB", 1048576 → "1.0 MB"
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

/**
 * Convert a string to a URL/file-safe slug: "HP Laptop 15s!" → "hp-laptop-15s"
 */
export function slugify(s: string): string {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Format a date range compactly: "1 Jan – 15 Jan 2025"
 */
export function formatDateRange(start: string | Date, end: string | Date): string {
  const s = new Date(start)
  const e = new Date(end)
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return ''
  const sStr = s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const eStr = e.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: e.getFullYear() === s.getFullYear() ? undefined : 'numeric',
  })
  const year = s.getFullYear() === e.getFullYear() ? ` ${s.getFullYear()}` : ''
  return `${sStr} – ${eStr}${year}`
}

/**
 * Initials from a name: "Rahul Sharma" → "RS"
 */
export function initials(name: string): string {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('')
}

/**
 * Clamp a number between min and max.
 */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(n) || 0))
}

/**
 * Pick the first non-empty value from a list of candidates.
 * Useful for reading fields that may live under several keys
 * (e.g. customer.phone vs customerPhone vs mobile).
 */
export function pickFirst(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (c !== null && c !== undefined && String(c).trim() !== '') {
      return String(c)
    }
  }
  return ''
}

/**
 * Indian GST number checksum validator.
 * Returns true for valid 15-char GSTIN format: 2 state + 10 PAN + 1 entity + 1 Z + 1 checksum.
 */
export function isValidGSTIN(gstin: string): boolean {
  const g = String(gstin || '').trim().toUpperCase()
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(g)) return false
  // Luhn-style checksum on the GSTIN charset
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const factor = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2]
  let sum = 0
  for (let i = 0; i < 14; i++) {
    let v = charset.indexOf(g[i])
    if (v < 0) return false
    v = (v * factor[i])
    sum += Math.floor(v / 36) + (v % 36)
  }
  const check = (36 - (sum % 36)) % 36
  return charset[check] === g[14]
}

/**
 * Paginate an array in memory (1-indexed page).
 */
export function paginate<T>(arr: T[], page: number, pageSize: number): T[] {
  const p = Math.max(1, page)
  const ps = Math.max(1, pageSize)
  const start = (p - 1) * ps
  return arr.slice(start, start + ps)
}
