import { NextRequest, NextResponse } from 'next/server'
import { getDashboardStats, isConfigured } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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
        pendingInvoices: [], recentInvoices: [], recentPayments: [], recentEnquiries: [], lowStockList: [],
        recentJobs: [],
      })
    }
    const data = await getDashboardStats()
    return NextResponse.json(data, {
      headers: {
        'X-RateLimit-Remaining': check.remaining.toString(),
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
