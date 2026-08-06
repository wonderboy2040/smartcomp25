// Calculation helpers for invoices, quotations, profit, GST - UPGRADED v3.0

export interface LineItem {
  itemId?: string
  name: string
  description?: string
  specification?: string
  sku?: string
  hsnCode?: string
  quantity: number
  rate: number
  gstApplicable: boolean
  gstRate: number
  costPrice?: number
  discount?: number
}

export interface ComputedLineItem extends LineItem {
  amount: number
  gstAmount: number
  total: number
  costTotal: number
  profit: number
}

export interface InvoiceCalc {
  items: ComputedLineItem[]
  subtotal: number
  gstAmount: number
  sgstAmount: number
  cgstAmount: number
  courierCharges: number
  otherCharges: number
  discount: number
  grandTotal: number
  totalCost: number
  profit: number
}

export function computeLineItem(item: LineItem): ComputedLineItem {
  const qty = Number(item.quantity) || 0
  const rate = Number(item.rate) || 0
  const discount = Number(item.discount) || 0
  const amount = Math.max(0, rate * qty - discount)
  const gstAmount = item.gstApplicable
    ? (amount * (Number(item.gstRate) || 0)) / 100
    : 0
  const total = amount + gstAmount
  const costTotal = (Number(item.costPrice) || 0) * qty
  const profit = amount - costTotal
  return {
    ...item,
    amount: round2(amount),
    gstAmount: round2(gstAmount),
    total: round2(total),
    costTotal: round2(costTotal),
    profit: round2(profit),
  }
}

export function computeInvoice(
  items: LineItem[],
  options: {
    courierCharges?: number
    otherCharges?: number
    discount?: number
  } = {}
): InvoiceCalc {
  const computed = items.map(computeLineItem)
  const subtotal = computed.reduce((s, i) => s + i.amount, 0)
  const gstAmount = computed.reduce((s, i) => s + i.gstAmount, 0)
  const sgstAmount = round2(gstAmount / 2)
  const cgstAmount = round2(gstAmount / 2)
  const courierCharges = Number(options.courierCharges) || 0
  const otherCharges = Number(options.otherCharges) || 0
  const discount = Number(options.discount) || 0
  const grandTotal = Math.max(0, subtotal + gstAmount + courierCharges + otherCharges - discount)
  const totalCost = computed.reduce((s, i) => s + i.costTotal, 0)
  const profit = subtotal - totalCost - discount
  return {
    items: computed,
    subtotal: round2(subtotal),
    gstAmount: round2(gstAmount),
    sgstAmount,
    cgstAmount,
    courierCharges: round2(courierCharges),
    otherCharges: round2(otherCharges),
    discount: round2(discount),
    grandTotal: round2(grandTotal),
    totalCost: round2(totalCost),
    profit: round2(profit),
  }
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  const n = Number(amount) || 0
  if (currency === 'INR') {
    return 'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatCurrencyCompact(amount: number): string {
  const n = Number(amount) || 0
  if (n >= 10000000) return `Rs. ${(n / 10000000).toFixed(1)}Cr`
  if (n >= 100000) return `Rs. ${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `Rs. ${(n / 1000).toFixed(1)}K`
  return formatCurrency(n)
}

export function formatNumber(n: number): string {
  return (Number(n) || 0).toLocaleString('en-IN')
}

export async function nextInvoiceNumber(existing: { number: string | number }[]): Promise<string> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const fyStart = month >= 4 ? year : year - 1
  const fyEnd = fyStart + 1
  const fyShort = `${String(fyStart).slice(2)}-${String(fyEnd).slice(2)}`
  const base = `SCSS/${fyShort}/`
  let max = 0
  for (const r of existing) {
    const num = String(r?.number || '')
    if (num.startsWith(base)) {
      const suffix = parseInt(num.slice(base.length), 10)
      if (!isNaN(suffix) && suffix > max) max = suffix
    }
  }
  return `${base}${String(max + 1).padStart(3, '0')}`
}

export async function nextQuotationNumber(existing: { number: string | number }[]): Promise<string> {
  const base = `SCSS/QT/`
  let max = 0
  for (const r of existing) {
    const num = String(r?.number || '')
    if (num.startsWith(base)) {
      const suffix = parseInt(num.slice(base.length), 10)
      if (!isNaN(suffix) && suffix > max) max = suffix
    }
  }
  return `${base}${String(max + 1).padStart(3, '0')}`
}

export async function nextNumber(prefix: string, existing: { number: string | number }[]): Promise<string> {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const base = `${prefix}${year}${month}`
  let max = 0
  for (const r of existing) {
    const num = String(r?.number || '')
    if (num.startsWith(base)) {
      const suffix = parseInt(num.slice(base.length), 10)
      if (!isNaN(suffix) && suffix > max) max = suffix
    }
  }
  return `${base}${String(max + 1).padStart(3, '0')}`
}

export function numberToWords(num: number): string {
  if (num === 0) return 'Rupees Zero Only'
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const inWords = (n: number): string => {
    if (n < 20) return a[n]
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '')
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + inWords(n % 100) : '')
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + inWords(n % 1000) : '')
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + inWords(n % 100000) : '')
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + inWords(n % 10000000) : '')
  }
  const rupees = Math.floor(num)
  const paise = Math.round((num - rupees) * 100)
  let words = 'Rupees ' + inWords(rupees) + ' Only'
  if (paise > 0) words = 'Rupees ' + inWords(rupees) + ' and ' + inWords(paise) + ' Paise Only'
  return words
}

export function calculateProfitMargin(cost: number, selling: number): number {
  if (selling === 0) return 0
  return round2(((selling - cost) / selling) * 100)
}

export function calculateMarkup(cost: number, selling: number): number {
  if (cost === 0) return 0
  return round2(((selling - cost) / cost) * 100)
}

export function calculateGstSplit(totalGst: number, sameState: boolean = true): { sgst: number; cgst: number; igst: number } {
  if (sameState) {
    return { sgst: round2(totalGst / 2), cgst: round2(totalGst / 2), igst: 0 }
  }
  return { sgst: 0, cgst: 0, igst: round2(totalGst) }
}

export function calculateEMI(principal: number, ratePerYear: number, months: number): number {
  if (months === 0) return principal
  const monthlyRate = ratePerYear / 12 / 100
  if (monthlyRate === 0) return round2(principal / months)
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1)
  return round2(emi)
}

export function calculateDiscount(original: number, discountPercent: number): { discountAmount: number; final: number } {
  const discountAmount = round2((original * discountPercent) / 100)
  return { discountAmount, final: round2(original - discountAmount) }
}

export function calculateAMCExpiry(startDate: string, durationMonths: number): string {
  const start = new Date(startDate)
  start.setMonth(start.getMonth() + durationMonths)
  return start.toISOString()
}

export function getAMCStatus(endDate: string): 'active' | 'expiring_soon' | 'expired' {
  const now = new Date()
  const end = new Date(endDate)
  const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'expired'
  if (diffDays <= 30) return 'expiring_soon'
  return 'active'
}

// ===== NEW v3.1 HELPERS — added for existing-feature upgrades =====

/**
 * If a price already includes GST, extract the taxable base + GST amount.
 * Example: 1180 inclusive @ 18% → { base: 1000, gst: 180 }
 */
export function extractGstFromInclusive(inclusivePrice: number, gstRate: number): { base: number; gst: number } {
  const rate = Number(gstRate) || 0
  if (rate <= 0) return { base: round2(inclusivePrice), gst: 0 }
  const base = round2(inclusivePrice / (1 + rate / 100))
  return { base, gst: round2(inclusivePrice - base) }
}

/**
 * Apply GST on a base price (exclusive → inclusive).
 */
export function applyGstToExclusive(basePrice: number, gstRate: number): { base: number; gst: number; total: number } {
  const rate = Number(gstRate) || 0
  const gst = round2((basePrice * rate) / 100)
  return { base: round2(basePrice), gst, total: round2(basePrice + gst) }
}

/**
 * Returns the Indian Financial Year label for a date, e.g. "FY 2025-26".
 * Indian FY starts on April 1.
 */
export function getFinancialYearLabel(date: Date | string = new Date()): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const fyStart = month >= 4 ? year : year - 1
  const fyEnd = fyStart + 1
  return `FY ${fyStart}-${String(fyEnd).slice(2)}`
}

/**
 * Whole days between two dates (b - a). Negative if b is in the past.
 */
export function daysBetween(a: Date | string, b: Date | string = new Date()): number {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (isNaN(da) || isNaN(db)) return 0
  return Math.floor((db - da) / (1000 * 60 * 60 * 24))
}

/**
 * Age an invoice in human-readable form: "Today", "2 days ago", "3 weeks ago", "2 months ago".
 */
export function invoiceAge(date: Date | string): string {
  const days = daysBetween(date)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return '1 week ago'
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 60) return '1 month ago'
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

/**
 * Sum a list of objects by a numeric key. Useful for dashboard aggregations.
 */
export function sumBy<T>(arr: T[], key: (item: T) => number | string | undefined | null): number {
  return arr.reduce((s, x) => s + (Number(key(x)) || 0), 0)
}

/**
 * Group an array by a key function. Returns a Map.
 */
export function groupBy<T, K>(arr: T[], key: (item: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const item of arr) {
    const k = key(item)
    const arr2 = m.get(k) || []
    arr2.push(item)
    m.set(k, arr2)
  }
  return m
}

/**
 * Returns Indian-style short currency: Rs.1.2L, Rs.3.4Cr — without decimals for compact UI.
 */
export function formatINRShort(n: number): string {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  if (abs >= 10000000) return `${sign}Rs.${(abs / 10000000).toFixed(2)}Cr`
  if (abs >= 100000) return `${sign}Rs.${(abs / 100000).toFixed(2)}L`
  if (abs >= 1000) return `${sign}Rs.${(abs / 1000).toFixed(1)}K`
  return `${sign}Rs.${abs.toFixed(0)}`
}
