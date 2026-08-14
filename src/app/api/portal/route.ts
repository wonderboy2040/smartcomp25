import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { safeJsonParse } from '@/lib/utils'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/portal?phone=9876543210 — Customer Self-Service portal data
 *
 * Public endpoint (no PIN). Returns everything a customer needs to see:
 *   - their invoices (number, date, total, paid, due)
 *   - warranty status of items sold to them (from ItemSerials)
 *   - their AMC contracts + expiry
 *   - shop contact info
 *
 * Lookup is by registered phone number (10-digit India mobile).
 */

function normalizePhone(raw: unknown): string {
  let p = String(raw ?? '').replace(/\D/g, '')
  if (p.length === 12 && p.startsWith('91')) p = p.slice(2)
  if (p.length === 11 && p.startsWith('0')) p = p.slice(1)
  return p
}

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited — try again in a moment' }, { status: 429 })

    const url = new URL(req.url)
    const phone = normalizePhone(url.searchParams.get('phone'))
    if (phone.length !== 10) {
      return NextResponse.json({ error: 'Enter a valid 10-digit mobile number' }, { status: 400 })
    }

    const [allCustomers, allInvoices, allSerials, allAmcs, shops] = await Promise.all([
      listRows<any>('Customers', { useCache: true }),
      listRows<any>('Invoices', { useCache: true }),
      listRows<any>('ItemSerials', { useCache: true }).catch(() => [] as any[]),
      listRows<any>('AMCContracts', { useCache: true }).catch(() => [] as any[]),
      listRows<any>('Shop', { useCache: true }),
    ])

    const strip = (v: unknown) => normalizePhone(v)

    const customers = allCustomers.filter((c) => strip(c.phone) === phone)
    const invoices = allInvoices
      .filter((inv) => strip(inv.customerPhone) === phone)
      .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())

    // ItemSerials sold rows are keyed by invoiceNumber (no stored phone),
    // so warranty is joined through the customer's invoices.
    const invoiceNumbers = new Set(invoices.map((inv) => String(inv.number || '')))
    const serials = allSerials.filter(
      (s) => String(s.status) === 'sold' && invoiceNumbers.has(String(s.invoiceNumber || '')),
    )

    const amcs = allAmcs.filter((a) => strip(a.customerPhone) === phone)

    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const invoiceSummary = invoices.map((inv) => ({
      id: String(inv.id || ''),
      number: String(inv.number || ''),
      date: inv.date || inv.createdAt || '',
      grandTotal: Number(inv.grandTotal) || 0,
      amountPaid: Number(inv.amountPaid) || 0,
      amountDue: Number(inv.amountDue) || 0,
      paymentStatus: String(inv.paymentStatus || (Number(inv.amountDue) > 0 ? 'unpaid' : 'paid')),
    }))

    const warrantyList = serials.map((s) => {
      const expiry = s.warrantyExpiry ? new Date(s.warrantyExpiry) : null
      let status = 'none'
      if (expiry) {
        status = expiry < now ? 'expired' : expiry < in30Days ? 'expiring' : 'active'
      }
      return {
        serialNumber: String(s.serialNumber || ''),
        itemName: String(s.itemName || ''),
        invoiceNumber: String(s.invoiceNumber || ''),
        soldDate: s.soldDate || s.purchaseDate || '',
        warrantyDays: Number(s.warrantyDays) || 0,
        warrantyExpiry: s.warrantyExpiry || '',
        warrantyStatus: status,
      }
    })

    const amcList = amcs.map((a) => {
      const endDate = a.endDate ? new Date(a.endDate) : null
      let status = 'active'
      if (endDate) {
        if (endDate < now) status = 'expired'
        else if (endDate < in30Days) status = 'expiring'
      }
      return {
        contractNumber: String(a.contractNumber || ''),
        devicesCovered: safeJsonParse<any[]>(a.devicesCoveredJson, []),
        startDate: a.startDate || '',
        endDate: a.endDate || '',
        fee: Number(a.fee) || 0,
        frequency: String(a.frequency || 'monthly'),
        visitsIncluded: Number(a.visitsIncluded) || 0,
        visitsUsed: Number(a.visitsUsed) || 0,
        visitsRemaining: (Number(a.visitsIncluded) || 0) - (Number(a.visitsUsed) || 0),
        nextVisitDate: a.nextVisitDate || '',
        status,
      }
    })

    const shop = shops[0] || {}

    return NextResponse.json({
      customer: customers[0] ? {
        name: String(customers[0].name || 'Customer'),
        phone: phone,
        creditBalance: Number(customers[0].creditBalance) || 0,
      } : null,
      invoices: invoiceSummary,
      totalOutstanding: invoiceSummary.reduce((s, i) => s + i.amountDue, 0),
      warranty: warrantyList,
      amc: amcList,
      shop: {
        name: String(shop.name || 'Smart Computers'),
        phone: String(shop.phone || ''),
        email: String(shop.email || ''),
        address: String(shop.address || ''),
        upiId: String(shop.upiId || ''),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}