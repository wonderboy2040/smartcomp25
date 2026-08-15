import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/gst-reconciliation?month=YYYY-MM&type=2b
 *
 * GST-2A/2B Reconciliation:
 *   - 2A/2B is the auto-populated GST portal data showing what suppliers have
 *     filed against your GSTIN (input tax credit available).
 *   - This route compares your PurchaseOrders (received) against a manually
 *     entered 2B data set (stored in 'GstReconciliations' collection).
 *
 * Since we can't auto-fetch 2B from the GST portal (requires OTP + API keys),
 * the flow is:
 *   1. User downloads GSTR-2B from portal → uploads/pastes supplier GSTIN + invoice + tax
 *   2. This route matches each 2B entry against POs in Firestore
 *   3. Returns: matched, unmatched (in books but not in 2B), extra (in 2B but not in books)
 *
 * For simplicity, this v1 implementation matches by supplier GSTIN + amount.
 */

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`
    const month = url.searchParams.get('month') || defaultMonth
    const reconType = url.searchParams.get('type') || '2b'

    const [purchaseOrders, suppliers, reconEntries] = await Promise.all([
      listRows<any>('PurchaseOrders').catch(() => []),
      listRows<any>('Suppliers').catch(() => []),
      listRows<any>('GstReconciliations').catch(() => []),
    ])

    // Filter POs for the month that are received (have GST input)
    const monthPOs = purchaseOrders.filter((po) => {
      const d = String(po.date || po.receivedAt || po.createdAt || '')
      return d.startsWith(month) && String(po.status) === 'received'
    })

    // Filter reconciliation entries for the month
    const monthRecon = reconEntries.filter((r) => String(r.month) === month && String(r.type) === reconType)

    // Build supplier GSTIN map
    const supplierGstinMap = new Map<string, string>()
    for (const s of suppliers) {
      if (s.gstNumber) supplierGstinMap.set(String(s.id), String(s.gstNumber))
    }

    // Match logic: match by supplier GSTIN + amount (within 1% tolerance)
    const matched: any[] = []
    const unmatchedInBooks: any[] = []
    const extraIn2B: any[] = []

    const usedReconIds = new Set<string>()

    for (const po of monthPOs) {
      const poGstin = supplierGstinMap.get(String(po.supplierId)) || ''
      const poAmount = Number(po.grandTotal) || 0
      const poGst = poAmount * 0.18 // estimate 18% GST (simplified)

      const match = monthRecon.find((r) => {
        if (usedReconIds.has(String(r.id))) return false
        const rGstin = String(r.supplierGstin || '')
        const rTaxable = Number(r.taxableAmount) || 0
        const rTax = Number(r.taxAmount) || 0
        // Match by GSTIN (if available) + amount within 2% tolerance
        const gstinMatch = !poGstin || !rGstin || poGstin === rGstin
        const amountMatch = Math.abs(poAmount - rTaxable) <= poAmount * 0.02
        return gstinMatch && amountMatch
      })

      if (match) {
        usedReconIds.add(String(match.id))
        matched.push({
          poNumber: String(po.poNumber || ''),
          poId: String(po.id || ''),
          supplierName: String(po.supplierName || ''),
          supplierGstin: poGstin,
          poAmount,
          estimatedGst: poGst,
          reconTaxable: Number(match.taxableAmount) || 0,
          reconTax: Number(match.taxAmount) || 0,
          reconInvoiceNumber: String(match.invoiceNumber || ''),
          status: 'matched',
          variance: poAmount - (Number(match.taxableAmount) || 0),
        })
      } else {
        unmatchedInBooks.push({
          poNumber: String(po.poNumber || ''),
          poId: String(po.id || ''),
          supplierName: String(po.supplierName || ''),
          supplierGstin: poGstin,
          poAmount,
          estimatedGst: poGst,
          status: 'in_books_not_in_2b',
        })
      }
    }

    // 2B entries not matched to any PO
    for (const r of monthRecon) {
      if (!usedReconIds.has(String(r.id))) {
        extraIn2B.push({
          reconInvoiceNumber: String(r.invoiceNumber || ''),
          supplierGstin: String(r.supplierGstin || ''),
          supplierName: String(r.supplierName || ''),
          reconTaxable: Number(r.taxableAmount) || 0,
          reconTax: Number(r.taxAmount) || 0,
          status: 'in_2b_not_in_books',
        })
      }
    }

    const totalMatchedTax = matched.reduce((s, m) => s + m.estimatedGst, 0)
    const totalUnmatchedTax = unmatchedInBooks.reduce((s, m) => s + m.estimatedGst, 0)
    const totalExtraTax = extraIn2B.reduce((s, m) => s + m.reconTax, 0)

    return NextResponse.json({
      month,
      type: reconType,
      summary: {
        totalInBooks: monthPOs.length,
        totalIn2B: monthRecon.length,
        matched: matched.length,
        unmatchedInBooks: unmatchedInBooks.length,
        extraIn2B: extraIn2B.length,
        totalMatchedTax,
        totalUnmatchedTax,
        totalExtraTax,
        itcAvailable: totalMatchedTax,
        itcAtRisk: totalUnmatchedTax,
      },
      matched,
      unmatchedInBooks,
      extraIn2B,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    // Save 2B entries (from manual entry or paste)
    const body = await req.json()
    const { month, type, entries } = body

    if (!month || !Array.isArray(entries)) {
      return NextResponse.json({ error: 'month and entries[] are required' }, { status: 400 })
    }

    // Lazy import to avoid circular dep
    const { createRow, listRows, deleteRow } = await import('@/lib/sheets-client')

    // Delete existing entries for this month+type (replace)
    const existing = await listRows<any>('GstReconciliations')
    for (const e of existing) {
      if (String(e.month) === month && String(e.type) === (type || '2b')) {
        await deleteRow('GstReconciliations', String(e.id)).catch(() => {})
      }
    }

    let saved = 0
    for (const entry of entries) {
      await createRow('GstReconciliations', {
        month: String(month),
        type: String(type || '2b'),
        supplierGstin: String(entry.supplierGstin || ''),
        supplierName: String(entry.supplierName || ''),
        invoiceNumber: String(entry.invoiceNumber || ''),
        invoiceDate: String(entry.invoiceDate || ''),
        taxableAmount: Number(entry.taxableAmount) || 0,
        taxAmount: Number(entry.taxAmount) || 0,
        igst: Number(entry.igst) || 0,
        cgst: Number(entry.cgst) || 0,
        sgst: Number(entry.sgst) || 0,
      }).catch(() => {})
      saved++
    }

    return NextResponse.json({ success: true, saved })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
