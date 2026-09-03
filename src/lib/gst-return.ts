/**
 * GSTR-1 return builder.
 *
 * Turns saved invoices into the sections a GSTR-1 filing needs:
 *   - B2B   : sales to GSTIN-registered buyers, invoice-wise, rate-wise
 *   - B2CS  : sales to unregistered buyers, aggregated by rate + place of supply
 *   - HSN   : HSN/SAC-wise summary of quantity, taxable value and tax
 *   - DOCS  : issued-document series summary (first/last invoice number, count)
 *
 * IMPORTANT — this produces a *working file for review*, not a blind filing.
 * The official GSTR-1 JSON schema published by GSTN changes between versions
 * and has fields this app does not capture (e.g. reverse charge, export /
 * SEZ flags, amendments, credit notes). Always reconcile the totals against
 * your books before uploading. See `warnings` on the result.
 *
 * Intra vs inter state is decided by comparing the state code (first 2 digits)
 * of the shop GSTIN and the buyer GSTIN — that is what actually determines
 * CGST+SGST vs IGST, regardless of how the invoice was originally split.
 */

export interface GstrRateLine {
  rate: number
  taxableValue: number
  cgst: number
  sgst: number
  igst: number
}

export interface GstrB2BInvoice {
  gstin: string
  receiverName: string
  invoiceNumber: string
  date: string
  invoiceValue: number
  placeOfSupply: string
  lines: GstrRateLine[]
}

export interface GstrHsnLine {
  hsnCode: string
  description: string
  uqc: string
  quantity: number
  rate: number
  taxableValue: number
  cgst: number
  sgst: number
  igst: number
  totalValue: number
}

export interface Gstr1Result {
  period: string
  periodLabel: string
  shopGstin: string
  shopStateCode: string
  b2b: GstrB2BInvoice[]
  b2cs: (GstrRateLine & { placeOfSupply: string })[]
  hsn: GstrHsnLine[]
  docs: { from: string; to: string; totalCount: number; cancelled: number }
  summary: {
    invoiceCount: number
    b2bCount: number
    b2csCount: number
    totalTaxableValue: number
    totalCgst: number
    totalSgst: number
    totalIgst: number
    totalTax: number
    totalInvoiceValue: number
  }
  warnings: string[]
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/** State code = first 2 digits of a GSTIN. Returns '' if not derivable. */
export function stateCodeOf(gstin: string): string {
  const clean = String(gstin || '').trim().toUpperCase()
  return /^\d{2}/.test(clean) ? clean.slice(0, 2) : ''
}

/** Structural GSTIN check (15 chars, state code + PAN + entity + Z + checksum char). */
export function isValidGstinFormat(gstin: string): boolean {
  const clean = String(gstin || '').trim().toUpperCase()
  return /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z\d]$/.test(clean)
}

interface ParsedLine {
  hsnCode: string
  name: string
  quantity: number
  rate: number
  taxableValue: number
  gstAmount: number
}

/** Invoice rows store computed lines as a JSON string in `itemsJson`. */
function parseInvoiceLines(inv: any): ParsedLine[] {
  let raw: any[] = []
  try {
    const parsed = typeof inv.itemsJson === 'string' ? JSON.parse(inv.itemsJson) : inv.items
    if (Array.isArray(parsed)) raw = parsed
  } catch {
    raw = []
  }

  return raw.map((li) => {
    const quantity = Number(li.quantity) || 0
    const gstRate = li.gstApplicable === false ? 0 : Number(li.gstRate) || 0
    // `amount` is the post-discount taxable base written by computeInvoice().
    const taxableValue =
      li.amount !== undefined ? Number(li.amount) || 0 : quantity * (Number(li.rate) || 0)
    const gstAmount =
      li.gstAmount !== undefined ? Number(li.gstAmount) || 0 : (taxableValue * gstRate) / 100

    return {
      hsnCode: String(li.hsnCode || '').trim(),
      name: String(li.name || ''),
      quantity,
      rate: gstRate,
      taxableValue,
      gstAmount,
    }
  })
}

/** Merge rate-wise lines, splitting tax into CGST/SGST or IGST. */
function toRateLines(lines: ParsedLine[], interState: boolean): GstrRateLine[] {
  const byRate = new Map<number, GstrRateLine>()
  for (const l of lines) {
    const existing = byRate.get(l.rate) || {
      rate: l.rate,
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    }
    existing.taxableValue += l.taxableValue
    if (interState) {
      existing.igst += l.gstAmount
    } else {
      existing.cgst += l.gstAmount / 2
      existing.sgst += l.gstAmount / 2
    }
    byRate.set(l.rate, existing)
  }
  return [...byRate.values()]
    .map((r) => ({
      rate: r.rate,
      taxableValue: round2(r.taxableValue),
      cgst: round2(r.cgst),
      sgst: round2(r.sgst),
      igst: round2(r.igst),
    }))
    .sort((a, b) => b.rate - a.rate)
}

/**
 * Build a GSTR-1 view for one month.
 *
 * @param invoices raw invoice rows from the Invoices collection
 * @param shop     shop row (needs `gstNumber` for the state code)
 * @param period   'YYYY-MM'
 */
export function buildGstr1(invoices: any[], shop: any, period: string): Gstr1Result {
  const warnings: string[] = []
  const shopGstin = String(shop?.gstNumber || '').trim().toUpperCase()
  const shopStateCode = stateCodeOf(shopGstin)

  if (!shopGstin) {
    warnings.push('Shop GSTIN is not set in Settings — every sale is treated as intra-state.')
  } else if (!isValidGstinFormat(shopGstin)) {
    warnings.push(`Shop GSTIN "${shopGstin}" does not look like a valid 15-character GSTIN.`)
  }

  const [yearStr, monthStr] = period.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)

  const inPeriod = invoices.filter((inv) => {
    if (inv.deleted === true) return false
    const d = new Date(inv.date || inv.createdAt || 0)
    if (Number.isNaN(d.getTime())) return false
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })

  const b2b: GstrB2BInvoice[] = []
  const b2csAcc = new Map<string, GstrRateLine & { placeOfSupply: string }>()
  const hsnAcc = new Map<string, GstrHsnLine>()

  let totalTaxable = 0
  let totalCgst = 0
  let totalSgst = 0
  let totalIgst = 0
  let totalInvoiceValue = 0
  let missingHsn = 0
  let cancelled = 0

  for (const inv of inPeriod) {
    if (String(inv.status || '').toLowerCase() === 'cancelled') {
      cancelled++
      continue
    }

    const buyerGstin = String(inv.customerGstin || '').trim().toUpperCase()
    const buyerStateCode = stateCodeOf(buyerGstin)
    // No buyer GSTIN → unregistered buyer, treated as a local (intra-state) supply.
    const interState = Boolean(shopStateCode && buyerStateCode && buyerStateCode !== shopStateCode)
    const placeOfSupply = buyerStateCode || shopStateCode || ''

    const lines = parseInvoiceLines(inv)
    if (!lines.length) {
      warnings.push(`Invoice ${inv.number || inv.id} has no readable line items — skipped.`)
      continue
    }

    const rateLines = toRateLines(lines, interState)
    const invoiceValue = Number(inv.grandTotal) || 0

    for (const rl of rateLines) {
      totalTaxable += rl.taxableValue
      totalCgst += rl.cgst
      totalSgst += rl.sgst
      totalIgst += rl.igst
    }
    totalInvoiceValue += invoiceValue

    if (buyerGstin) {
      if (!isValidGstinFormat(buyerGstin)) {
        warnings.push(
          `Invoice ${inv.number || inv.id}: buyer GSTIN "${buyerGstin}" looks malformed — B2B entries are rejected by the portal if the GSTIN is invalid.`
        )
      }
      b2b.push({
        gstin: buyerGstin,
        receiverName: String(inv.customerName || ''),
        invoiceNumber: String(inv.number || ''),
        date: new Date(inv.date || inv.createdAt).toISOString().slice(0, 10),
        invoiceValue: round2(invoiceValue),
        placeOfSupply,
        lines: rateLines,
      })
    } else {
      for (const rl of rateLines) {
        const key = `${placeOfSupply}|${rl.rate}`
        const acc = b2csAcc.get(key) || {
          rate: rl.rate,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          placeOfSupply,
        }
        acc.taxableValue += rl.taxableValue
        acc.cgst += rl.cgst
        acc.sgst += rl.sgst
        acc.igst += rl.igst
        b2csAcc.set(key, acc)
      }
    }

    // HSN summary spans both B2B and B2C.
    for (const l of lines) {
      if (!l.hsnCode) missingHsn++
      const key = `${l.hsnCode || 'NA'}|${l.rate}`
      const acc = hsnAcc.get(key) || {
        hsnCode: l.hsnCode || '',
        description: l.name,
        uqc: 'PCS',
        quantity: 0,
        rate: l.rate,
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalValue: 0,
      }
      acc.quantity += l.quantity
      acc.taxableValue += l.taxableValue
      if (interState) acc.igst += l.gstAmount
      else {
        acc.cgst += l.gstAmount / 2
        acc.sgst += l.gstAmount / 2
      }
      acc.totalValue += l.taxableValue + l.gstAmount
      hsnAcc.set(key, acc)
    }
  }

  if (missingHsn > 0) {
    warnings.push(
      `${missingHsn} line item(s) have no HSN/SAC code. HSN summary is mandatory — set HSN codes on those items in Stock.`
    )
  }
  if (cancelled > 0) {
    warnings.push(`${cancelled} cancelled invoice(s) excluded. File them as credit notes if already reported.`)
  }

  const numbers = inPeriod
    .map((i) => String(i.number || ''))
    .filter(Boolean)
    .sort()

  const b2csList = [...b2csAcc.values()].map((r) => ({
    ...r,
    taxableValue: round2(r.taxableValue),
    cgst: round2(r.cgst),
    sgst: round2(r.sgst),
    igst: round2(r.igst),
  }))

  const hsnList = [...hsnAcc.values()]
    .map((h) => ({
      ...h,
      quantity: round2(h.quantity),
      taxableValue: round2(h.taxableValue),
      cgst: round2(h.cgst),
      sgst: round2(h.sgst),
      igst: round2(h.igst),
      totalValue: round2(h.totalValue),
    }))
    .sort((a, b) => b.taxableValue - a.taxableValue)

  const periodLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  })

  return {
    period,
    periodLabel,
    shopGstin,
    shopStateCode,
    b2b,
    b2cs: b2csList,
    hsn: hsnList,
    docs: {
      from: numbers[0] || '',
      to: numbers[numbers.length - 1] || '',
      totalCount: inPeriod.length,
      cancelled,
    },
    summary: {
      invoiceCount: inPeriod.length - cancelled,
      b2bCount: b2b.length,
      b2csCount: b2csList.length,
      totalTaxableValue: round2(totalTaxable),
      totalCgst: round2(totalCgst),
      totalSgst: round2(totalSgst),
      totalIgst: round2(totalIgst),
      totalTax: round2(totalCgst + totalSgst + totalIgst),
      totalInvoiceValue: round2(totalInvoiceValue),
    },
    warnings,
  }
}

/** CSV escape: quote when the value contains a comma, quote or newline. */
function csvCell(v: any): string {
  const s = v === null || v === undefined ? '' : String(v)
  const escaped = s.replace(/"/g, '""')
  return /[",\n]/.test(s) ? `"${escaped}"` : escaped
}

/** Flatten the return into a multi-section CSV a CA can open in Excel. */
export function gstr1ToCsv(r: Gstr1Result): string {
  const rows: string[] = []
  const push = (cells: any[]) => rows.push(cells.map(csvCell).join(','))

  push([`GSTR-1 Summary — ${r.periodLabel}`])
  push([`GSTIN`, r.shopGstin || 'NOT SET'])
  push([])

  push(['SECTION', 'B2B — Registered buyers'])
  push(['GSTIN', 'Receiver', 'Invoice No', 'Date', 'Invoice Value', 'Place of Supply', 'Rate %', 'Taxable Value', 'CGST', 'SGST', 'IGST'])
  for (const inv of r.b2b) {
    for (const l of inv.lines) {
      push([inv.gstin, inv.receiverName, inv.invoiceNumber, inv.date, inv.invoiceValue, inv.placeOfSupply, l.rate, l.taxableValue, l.cgst, l.sgst, l.igst])
    }
  }
  push([])

  push(['SECTION', 'B2CS — Unregistered buyers (aggregated)'])
  push(['Place of Supply', 'Rate %', 'Taxable Value', 'CGST', 'SGST', 'IGST'])
  for (const l of r.b2cs) {
    push([l.placeOfSupply, l.rate, l.taxableValue, l.cgst, l.sgst, l.igst])
  }
  push([])

  push(['SECTION', 'HSN Summary'])
  push(['HSN/SAC', 'Description', 'UQC', 'Quantity', 'Rate %', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Value'])
  for (const h of r.hsn) {
    push([h.hsnCode, h.description, h.uqc, h.quantity, h.rate, h.taxableValue, h.cgst, h.sgst, h.igst, h.totalValue])
  }
  push([])

  push(['SECTION', 'Totals'])
  push(['Invoices', r.summary.invoiceCount])
  push(['Taxable Value', r.summary.totalTaxableValue])
  push(['CGST', r.summary.totalCgst])
  push(['SGST', r.summary.totalSgst])
  push(['IGST', r.summary.totalIgst])
  push(['Total Tax', r.summary.totalTax])
  push(['Invoice Value', r.summary.totalInvoiceValue])

  if (r.warnings.length) {
    push([])
    push(['SECTION', 'Warnings — review before filing'])
    for (const w of r.warnings) push([w])
  }

  return rows.join('\n')
}

// ============================================================================
// GSTR-2B Reconciliation Helper
// ============================================================================

export interface Gst2BReconResult {
  month: string
  matched: { count: number; totalTax: number }
  inBooksNotIn2B: { count: number; totalTax: number; items: { supplierName: string; invoiceNumber: string; taxAmount: number }[] }
  in2BNotInBooks: { count: number; totalTax: number; items: { supplierGstin: string; invoiceNumber: string; taxAmount: number }[] }
  itcAvailable: number
  itcAtRisk: number
  matchRate: number
}

/**
 * Reconcile purchase bills in books against GSTR-2B data.
 *
 * @param booksPurchases — PurchaseOrders (filtered to month)
 * @param gstr2b — array of { supplierGstin, invoiceNumber, taxableValue, taxAmount }
 */
export function reconcileGstr2B(
  booksPurchases: any[],
  gstr2b: { supplierGstin: string; invoiceNumber: string; taxableValue: number; taxAmount: number }[],
  month: string,
): Gst2BReconResult {
  const booksByInv = new Map<string, { supplierName: string; taxAmount: number; po: any }>()
  for (const po of booksPurchases) {
    const invNum = String(po?.invoiceNumber || po?.poNumber || po?.id || '')
    if (!invNum) continue
    let tax = 0
    try {
      const items = JSON.parse(po?.itemsJson || '[]')
      for (const item of items) {
        tax += Number(item?.gstAmount || (Number(item?.amount || 0) * Number(item?.gstRate || 0) / 100))
      }
    } catch {}
    booksByInv.set(invNum, { supplierName: String(po?.supplierName || ''), taxAmount: tax, po })
  }

  const gstr2bByInv = new Map<string, { supplierGstin: string; taxAmount: number }>()
  for (const g of gstr2b) {
    gstr2bByInv.set(String(g.invoiceNumber || ''), { supplierGstin: String(g.supplierGstin || ''), taxAmount: Number(g.taxAmount || 0) })
  }

  const matchedItems: { count: number; totalTax: number } = { count: 0, totalTax: 0 }
  const inBooksNotIn2BItems: { supplierName: string; invoiceNumber: string; taxAmount: number }[] = []
  const in2BNotInBooksItems: { supplierGstin: string; invoiceNumber: string; taxAmount: number }[] = []

  // Match books → 2B
  let booksTaxNotMatched = 0
  for (const [invNum, book] of booksByInv.entries()) {
    const g = gstr2bByInv.get(invNum)
    if (g && Math.abs(g.taxAmount - book.taxAmount) < 1) {
      matchedItems.count++
      matchedItems.totalTax += g.taxAmount
    } else {
      inBooksNotIn2BItems.push({
        supplierName: book.supplierName,
        invoiceNumber: invNum,
        taxAmount: book.taxAmount,
      })
      booksTaxNotMatched += book.taxAmount
    }
  }

  // 2B entries not in books
  let unbookedTax = 0
  for (const [invNum, g] of gstr2bByInv.entries()) {
    if (!booksByInv.has(invNum)) {
      in2BNotInBooksItems.push({
        supplierGstin: g.supplierGstin,
        invoiceNumber: invNum,
        taxAmount: g.taxAmount,
      })
      unbookedTax += g.taxAmount
    }
  }

  const totalBooksTax = Array.from(booksByInv.values()).reduce((s, b) => s + b.taxAmount, 0)
  const total2BTax = Array.from(gstr2bByInv.values()).reduce((s, g) => s + g.taxAmount, 0)
  const matchRate = totalBooksTax > 0 ? matchedItems.totalTax / totalBooksTax : 0

  return {
    month,
    matched: matchedItems,
    inBooksNotIn2B: {
      count: inBooksNotIn2BItems.length,
      totalTax: Math.round(booksTaxNotMatched * 100) / 100,
      items: inBooksNotIn2BItems.slice(0, 50),
    },
    in2BNotInBooks: {
      count: in2BNotInBooksItems.length,
      totalTax: Math.round(unbookedTax * 100) / 100,
      items: in2BNotInBooksItems.slice(0, 50),
    },
    itcAvailable: Math.round(matchedItems.totalTax * 100) / 100,
    itcAtRisk: Math.round(booksTaxNotMatched * 100) / 100,
    matchRate: Math.round(matchRate * 100) / 100,
  }
}
