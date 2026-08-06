import { NextRequest, NextResponse } from 'next/server'
import { getRow, listRows, updateRow } from '@/lib/sheets-client'
import { computeInvoice, type LineItem } from '@/lib/calc'
import { safeJsonParse } from '@/lib/utils'
import { generateShareToken, safeTokenCompare } from '@/lib/share-tokens'

/**
 * GET /api/track/doc?id=xxx&type=invoice&token=abc123
 *
 * Public endpoint (no PIN) — returns invoice or quotation data for customer viewing.
 * Secured by share token stored on the document row.
 *
 * Returns safe fields only — NO cost prices, NO profit, NO internal IDs.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const type = url.searchParams.get('type') || 'invoice'
    const token = url.searchParams.get('token')

    if (!id || !token) {
      return NextResponse.json({ error: 'Invalid document link' }, { status: 400 })
    }

    if (type !== 'invoice' && type !== 'quotation') {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
    }

    // Get shop info
    const shopRows = await listRows<any>('Shop', { useCache: true })
    const shop = shopRows[0] || {}

    if (type === 'invoice') {
      const invoice = await getRow<any>('Invoices', id)
      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      }

      // Validate share token
      let storedToken = String(invoice.shareToken || '')
      if (!storedToken) {
        // Auto-generate token on first access and store it
        storedToken = generateShareToken()
        await updateRow('Invoices', id, { shareToken: storedToken }).catch(() => {})
      }
      if (!safeTokenCompare(token, storedToken)) {
        return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 })
      }

      // Parse items and compute (for display only — no cost prices)
      const items = safeJsonParse<any[]>(invoice.itemsJson, []) as LineItem[]
      const calc = computeInvoice(items, {
        courierCharges: Number(invoice.courierCharges) || 0,
        otherCharges: Number(invoice.otherCharges) || 0,
        discount: Number(invoice.discount) || 0,
      })

      // Return SAFE data — strip cost prices and profit info
      const safeItems = calc.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        rate: item.rate,
        gstRate: item.gstRate || 0,
        gstApplicable: item.gstApplicable,
        gstAmount: item.gstAmount || 0,
        total: item.total,
      }))

      return NextResponse.json({
        doc: {
          id,
          type: 'invoice',
          number: String(invoice.number || ''),
          date: invoice.date || invoice.createdAt || '',
          customerName: String(invoice.customerName || ''),
          customerPhone: String(invoice.customerPhone || ''),
          customerGstin: String(invoice.customerGstin || ''),
          items: safeItems,
          subtotal: calc.subtotal,
          cgst: calc.cgstAmount,
          sgst: calc.sgstAmount,
          igst: 0,
          totalGst: calc.gstAmount,
          courierCharges: calc.courierCharges,
          otherCharges: calc.otherCharges,
          discount: calc.discount,
          grandTotal: calc.grandTotal,
          amountPaid: Number(invoice.amountPaid) || 0,
          amountDue: Number(invoice.amountDue) || 0,
          paymentStatus: String(invoice.paymentStatus || 'unpaid'),
          paymentType: String(invoice.paymentType || ''),
          notes: String(invoice.notes || ''),
        },
        shop: {
          name: String(shop.name || 'Smart Computers'),
          phone: String(shop.phone || ''),
          email: String(shop.email || ''),
          address: String(shop.address || ''),
          gstNumber: String(shop.gstNumber || ''),
          upiId: String(shop.upiId || ''),
        },
      })
    }

    // Quotation
    const quotation = await getRow<any>('Quotations', id)
    if (!quotation) {
      return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
    }

    let storedToken = String(quotation.shareToken || '')
    if (!storedToken) {
      storedToken = generateShareToken()
      await updateRow('Quotations', id, { shareToken: storedToken }).catch(() => {})
    }
    if (!safeTokenCompare(token, storedToken)) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 })
    }

    const items = safeJsonParse<any[]>(quotation.itemsJson, []) as LineItem[]
    const calc = computeInvoice(items, {
      courierCharges: Number(quotation.courierCharges) || 0,
      otherCharges: Number(quotation.otherCharges) || 0,
      discount: Number(quotation.discount) || 0,
    })

    const safeItems = calc.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      rate: item.rate,
      gstRate: item.gstRate || 0,
      gstApplicable: item.gstApplicable,
      gstAmount: item.gstAmount || 0,
      total: item.total,
    }))

    return NextResponse.json({
      doc: {
        id,
        type: 'quotation',
        number: String(quotation.number || ''),
        date: quotation.date || quotation.createdAt || '',
        validTill: quotation.validTill || '',
        customerName: String(quotation.customerName || ''),
        customerPhone: String(quotation.customerPhone || ''),
        customerGstin: String(quotation.customerGstin || ''),
        items: safeItems,
        subtotal: calc.subtotal,
        cgst: calc.cgstAmount,
        sgst: calc.sgstAmount,
        igst: 0,
        totalGst: calc.gstAmount,
        courierCharges: calc.courierCharges,
        otherCharges: calc.otherCharges,
        discount: calc.discount,
        grandTotal: calc.grandTotal,
        notes: String(quotation.notes || ''),
      },
      shop: {
        name: String(shop.name || 'Smart Computers'),
        phone: String(shop.phone || ''),
        email: String(shop.email || ''),
        address: String(shop.address || ''),
        gstNumber: String(shop.gstNumber || ''),
        upiId: String(shop.upiId || ''),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load document' }, { status: 500 })
  }
}
