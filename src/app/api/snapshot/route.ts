import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'
import { BUSINESS_GROWTH } from '@/lib/business-growth'

/**
 * GET /api/snapshot
 * Daily Business Snapshot — today's KPIs in one consolidated response.
 *
 * Used by:
 *   - Daily auto-WhatsApp digest (cron)
 *   - "Superintelligence" growth panel
 *   - Dashboard quick-glance widget
 *
 * Computes:
 *   - Today's sales (count, value, profit)
 *   - Today's payments received (UPI/cash)
 *   - Today's new customers
 *   - Today's service jobs (new, completed, delivered)
 *   - Low-stock alerts count
 *   - Overdue invoices count + value
 *   - Top-selling item today
 */
export async function GET(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }

    const url = new URL(req.url)
    const format = url.searchParams.get('format') || 'json' // 'json' | 'whatsapp'

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000

    const [shopRows, invoices, items, jobs, payments] = await Promise.all([
      listRows<any>('Shop').catch(() => []),
      listRows<any>('Invoices').catch(() => []),
      listRows<any>('Items').catch(() => []),
      listRows<any>('Jobs').catch(() => []),
      listRows<any>('Payments').catch(() => []),
    ])

    const shop = shopRows[0] || {}
    const shopName = shop.name || 'Smart Computers'

    // Today's invoices
    const todayInvoices = invoices.filter((inv) => {
      const t = new Date(inv.date || inv.createdAt || 0).getTime()
      return t >= startOfToday && t < endOfToday
    })
    const todaySalesValue = todayInvoices.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0)
    const todayProfit = todayInvoices.reduce((s, i) => s + (Number(i.profit) || 0), 0)

    // Today's payments received
    const todayPayments = payments.filter((p) => {
      const t = new Date(p.date || p.createdAt || 0).getTime()
      return t >= startOfToday && t < endOfToday
    })
    const todayPaymentsTotal = todayPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const todayUPI = todayPayments.filter((p) => String(p.mode || '').toLowerCase() === 'upi').reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const todayCash = todayPaymentsTotal - todayUPI

    // New customers today (rough: distinct customerIds in today's invoices)
    const todayCustomerIds = new Set(todayInvoices.map((i) => String(i.customerId || '')))

    // Today's jobs
    const todayJobs = jobs.filter((j) => {
      const t = new Date(j.createdAt || j.date || 0).getTime()
      return t >= startOfToday && t < endOfToday
    })
    const todayCompleted = jobs.filter((j) => {
      const t = new Date(j.completedDate || 0).getTime()
      return t >= startOfToday && t < endOfToday
    })

    // Low-stock items
    const lowStock = items.filter((i) => Number(i.quantity) <= Number(i.minQuantity || 0)).length

    // Overdue invoices (>30 days unpaid)
    const overdue = invoices.filter((inv) => {
      const status = String(inv.paymentStatus || '').toLowerCase()
      if (status === 'paid') return false
      const t = new Date(inv.date || inv.createdAt || 0).getTime()
      const ageDays = Math.floor((now.getTime() - t) / (1000 * 60 * 60 * 24))
      return ageDays > 30
    })
    const overdueValue = overdue.reduce((s, i) => s + (Number(i.amountDue) || 0), 0)

    // Top selling item today
    const itemSalesMap = new Map<string, { name: string; qty: number; revenue: number }>()
    for (const inv of todayInvoices) {
      try {
        const itemsArr = typeof inv.itemsJson === 'string' ? JSON.parse(inv.itemsJson) : (inv.itemsJson || [])
        for (const it of itemsArr) {
          const key = it.name || 'Unknown'
          const cur = itemSalesMap.get(key) || { name: key, qty: 0, revenue: 0 }
          cur.qty += Number(it.quantity) || 0
          cur.revenue += Number(it.total) || 0
          itemSalesMap.set(key, cur)
        }
      } catch {}
    }
    const topItem = Array.from(itemSalesMap.values()).sort((a, b) => b.qty - a.qty)[0] || null

    const snapshot = {
      date: now.toISOString(),
      shopName,
      shopPhone: shop.phone || '',
      googleReviewUrl: BUSINESS_GROWTH.googleReviewUrl,
      sales: {
        count: todayInvoices.length,
        value: Number(todaySalesValue.toFixed(2)),
        profit: Number(todayProfit.toFixed(2)),
      },
      payments: {
        total: Number(todayPaymentsTotal.toFixed(2)),
        upi: Number(todayUPI.toFixed(2)),
        cash: Number(todayCash.toFixed(2)),
      },
      customers: {
        newToday: todayCustomerIds.size,
      },
      jobs: {
        newToday: todayJobs.length,
        completedToday: todayCompleted.length,
        pending: jobs.filter((j) => !['Completed', 'Delivered', 'Cancelled'].includes(j.status)).length,
      },
      stock: {
        lowStockCount: lowStock,
      },
      overdue: {
        count: overdue.length,
        value: Number(overdueValue.toFixed(2)),
      },
      topItem: topItem ? { name: topItem.name, qty: topItem.qty, revenue: Number(topItem.revenue.toFixed(2)) } : null,
    }

    if (format === 'whatsapp') {
      const msg = buildSnapshotMessage(snapshot)
      return NextResponse.json({ snapshot, whatsappMessage: msg })
    }

    return NextResponse.json({ snapshot })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

function buildSnapshotMessage(s: any): string {
  const date = new Date(s.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    `📊 *DAILY BUSINESS SNAPSHOT*\n` +
    `${s.shopName} • ${date}\n` +
    `━━━━━━━━━━━━━━━\n\n` +
    `🛒 *SALES TODAY*\n` +
    `• Invoices: ${s.sales.count}\n` +
    `• Revenue: Rs. ${s.sales.value.toFixed(2)}\n` +
    `• Profit: Rs. ${s.sales.profit.toFixed(2)}\n\n` +
    `💰 *PAYMENTS RECEIVED*\n` +
    `• Total: Rs. ${s.payments.total.toFixed(2)}\n` +
    `• UPI: Rs. ${s.payments.upi.toFixed(2)} | Cash: Rs. ${s.payments.cash.toFixed(2)}\n\n` +
    `👥 New Customers: ${s.customers.newToday}\n\n` +
    `🔧 *SERVICE JOBS*\n` +
    `• New today: ${s.jobs.newToday}\n` +
    `• Completed today: ${s.jobs.completedToday}\n` +
    `• Pending: ${s.jobs.pending}\n\n` +
    (s.topItem
      ? `⭐ Top Item: ${s.topItem.name} (${s.topItem.qty} sold, Rs. ${s.topItem.revenue.toFixed(2)})\n\n`
      : '') +
    `⚠️ *ALERTS*\n` +
    `• Low stock items: ${s.stock.lowStockCount}\n` +
    `• Overdue invoices (>30d): ${s.overdue.count} • Rs. ${s.overdue.value.toFixed(2)}\n\n` +
    `⭐ Review us: ${s.googleReviewUrl}\n\n` +
    `— Auto-generated by SmartComp Superintelligence 🤖`
  )
}
