import { NextRequest, NextResponse } from 'next/server'
import { getDashboardStats, listRows, isConfigured } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Enhanced Dashboard API with:
 * - Sales trends (last 7 days)
 * - Top customers
 * - Low-margin products
 * - Profit analysis
 */

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    }

    if (!isConfigured()) {
      return NextResponse.json({
        stats: {
          totalItems: 0, lowStockCount: 0, totalCustomers: 0, totalSuppliers: 0,
          stockValueCost: 0, stockValueSelling: 0, monthSales: 0, monthProfit: 0,
          monthCashSales: 0, monthCreditSales: 0, totalOutstanding: 0,
          monthQuotationValue: 0, totalQuotations: 0, todayPaymentTotal: 0, pendingEnquiries: 0,
          totalJobs: 0, pendingJobs: 0, completedJobs: 0, deliveredJobs: 0,
          highPriorityJobs: 0, todayJobs: 0, monthJobs: 0,
          todayServiceTotal: 0, todayServiceUPI: 0, todayServiceCash: 0,
          monthServiceTotal: 0, monthServiceUPI: 0, monthServiceCash: 0,
        },
        pendingInvoices: [], recentInvoices: [], recentPayments: [], recentEnquiries: [],
        lowStockList: [], recentJobs: [], salesTrend: [], topCustomers: [], lowMarginProducts: [],
      })
    }

    // Get base dashboard data
    const data = await getDashboardStats()

    // Fetch additional data for enhancements
    const [invoices, customers, items] = await Promise.all([
      listRows<any>('Invoices'),
      listRows<any>('Customers'),
      listRows<any>('Items'),
    ])

    // === SALES TREND: Last 7 days ===
    const salesTrend: Array<{
      date: string
      dayName: string
      sales: number
      profit: number
      invoices: number
    }> = []
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]

      const dayInvoices = invoices.filter((inv: any) => {
        const invDate = new Date(inv.date || inv.createdAt).toISOString().split('T')[0]
        return invDate === dateStr
      })

      const daySales = dayInvoices.reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0)
      const dayProfit = dayInvoices.reduce((sum, inv) => sum + (Number(inv.profit) || 0), 0)

      salesTrend.push({
        date: dateStr,
        dayName: date.toLocaleDateString('en-IN', { weekday: 'short' }),
        sales: Math.round(daySales),
        profit: Math.round(dayProfit),
        invoices: dayInvoices.length,
      })
    }

    // === TOP CUSTOMERS: By total purchase value ===
    const customerPurchases = new Map<string, { customer: any; totalValue: number; invoiceCount: number; lastPurchase: string }>()

    for (const inv of invoices) {
      const custId = inv.customerId
      if (!custId) continue

      const existing = customerPurchases.get(custId) || {
        customer: customers.find(c => c.id === custId) || { id: custId, name: inv.customerName },
        totalValue: 0,
        invoiceCount: 0,
        lastPurchase: inv.date || inv.createdAt,
      }

      existing.totalValue += Number(inv.grandTotal) || 0
      existing.invoiceCount += 1
      if (new Date(inv.date || inv.createdAt) > new Date(existing.lastPurchase)) {
        existing.lastPurchase = inv.date || inv.createdAt
      }

      customerPurchases.set(custId, existing)
    }

    const topCustomers = Array.from(customerPurchases.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5)
      .map(c => ({
        id: c.customer.id,
        name: c.customer.name || 'Unknown',
        phone: c.customer.phone || '',
        totalValue: Math.round(c.totalValue),
        invoiceCount: c.invoiceCount,
        lastPurchase: c.lastPurchase,
        avgOrderValue: Math.round(c.totalValue / c.invoiceCount),
      }))

    // === LOW-MARGIN PRODUCTS: Profit margin < 15% ===
    const lowMarginProducts = items
      .filter((item: any) => {
        const cost = Number(item.costPrice) || 0
        const selling = Number(item.sellingPrice) || 0
        if (cost === 0 || selling === 0) return false
        const margin = ((selling - cost) / selling) * 100
        return margin < 15 && margin >= 0 // Exclude negative margins (selling below cost)
      })
      .map((item: any) => {
        const cost = Number(item.costPrice) || 0
        const selling = Number(item.sellingPrice) || 0
        const margin = ((selling - cost) / selling) * 100
        return {
          id: item.id,
          name: item.name,
          sku: item.sku || '',
          costPrice: cost,
          sellingPrice: selling,
          profitMargin: Math.round(margin * 10) / 10, // Round to 1 decimal
          quantity: Number(item.quantity) || 0,
          category: item.category || 'General',
        }
      })
      .sort((a, b) => a.profitMargin - b.profitMargin)
      .slice(0, 10)

    return NextResponse.json({
      ...data,
      salesTrend,
      topCustomers,
      lowMarginProducts,
    }, {
      headers: {
        'X-RateLimit-Remaining': check.remaining.toString(),
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
