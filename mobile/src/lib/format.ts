/**
 * SmartComp Mobile — formatting helpers.
 * INR currency + date formatters aligned with the web app's `en-IN` locale.
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrFormatterDecimal = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

export function formatINR(value: number | null | undefined, decimal = false): string {
  if (value == null || Number.isNaN(Number(value))) return '₹0'
  return decimal ? inrFormatterDecimal.format(Number(value)) : inrFormatter.format(Number(value))
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '0'
  return new Intl.NumberFormat('en-IN').format(Number(value))
}

const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDate(iso: string | null | undefined, opts: 'short' | 'long' = 'short'): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    if (opts === 'long') {
      return `${d.getDate()} ${monthShort[d.getMonth()]} ${d.getFullYear()}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    }
    return `${d.getDate()} ${monthShort[d.getMonth()]} ${d.getFullYear()}`
  } catch {
    return '—'
  }
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return '—'
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return formatDate(iso, 'short')
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/**
 * Normalise an Indian phone number to last-10-digits form.
 * Mirrors the web app's `normalizePhone` so mobile and web agree on
 * "same customer = same phone".
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 10) return digits
  return digits.slice(-10)
}

export function maskPhone(phone: string | null | undefined): string {
  const p = normalizePhone(phone)
  if (p.length !== 10) return phone || ''
  return `+91 ${p.slice(0, 5)} ${p.slice(5)}`
}

export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return `${count} ${singular}`
  return `${count} ${plural ?? singular + 's'}`
}
