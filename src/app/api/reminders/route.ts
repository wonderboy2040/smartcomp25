import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'

/**
 * GET /api/reminders
 * Returns invoices that are unpaid/partial and older than the given threshold.
 *
 * Query params:
 *   - days: how many days overdue to filter (default: 0 = all unpaid)
 *   - status: 'all' | 'unpaid' | 'partial' (default: all)
 *
 * Each result includes a pre-built wa.me link with the reminder message.
 */
export async function GET(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }

    const url = new URL(req.url)
    const daysThreshold = Number(url.searchParams.get('days') || 0)
    const statusFilter = url.searchParams.get('status') || 'all'

    const shopRows = await listRows<any>('Shop').catch(() => [])
    const shop = shopRows[0] || {}
    const shopName = shop.name || 'Smart Computers'
    const upiId = shop.upiId || ''

    const allInvoices = await listRows<any>('Invoices')
    const now = Date.now()
    const cutoff = now - daysThreshold * 24 * 60 * 60 * 1000

    const overdue = allInvoices.filter((inv) => {
      const status = String(inv.paymentStatus || '').toLowerCase()
      const isUnpaid = status !== 'paid'
      if (!isUnpaid) return false
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (daysThreshold > 0) {
        const invDate = new Date(inv.date || inv.createdAt || Date.now()).getTime()
        return invDate < cutoff
      }
      return true
    })

    const reminders = overdue.map((inv) => {
      const amountDue = Number(inv.amountDue) || 0
      const number = String(inv.number || '')
      const customerName = String(inv.customerName || inv.customer?.name || 'Customer')
      const customerPhone = String(inv.customerPhone || inv.customer?.phone || inv.phone || inv.mobile || '')
      const invDate = new Date(inv.date || inv.createdAt || Date.now())
      const ageDays = Math.floor((now - invDate.getTime()) / (1000 * 60 * 60 * 24))

      const cleanPhone = customerPhone.replace(/[^\d]/g, '')
      const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone.length > 10 ? cleanPhone : ''

      const message =
        `*${shopName}*\n\n` +
        `Dear *${customerName}*,\n\n` +
        `This is a friendly reminder for your pending payment:\n\n` +
        `*Invoice No:* ${number}\n` +
        `*Amount Due:* Rs. ${amountDue.toFixed(2)}\n` +
        `*Invoice Date:* ${invDate.toLocaleDateString('en-IN')}\n` +
        `*Days Overdue:* ${ageDays}\n` +
        (upiId ? `\n📲 *Pay via UPI:* ${upiId}\n` : '') +
        `\nKindly arrange the payment at your earliest convenience.\n\n` +
        `Thank you! 🙏`

      const waUrl = targetPhone
        ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`

      return {
        id: inv.id,
        number,
        customerName,
        customerPhone,
        amountDue,
        date: invDate.toISOString(),
        ageDays,
        paymentStatus: inv.paymentStatus,
        waUrl,
        message,
      }
    })

    // Sort by oldest first
    reminders.sort((a, b) => b.ageDays - a.ageDays)

    return NextResponse.json({
      reminders,
      total: reminders.length,
      totalDue: reminders.reduce((s, r) => s + r.amountDue, 0),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
