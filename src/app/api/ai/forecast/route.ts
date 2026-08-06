import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'
import { forecastRevenue, detectAnomalies, generateSmartInsights } from '@/lib/super-intelligence'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const months = parseInt(url.searchParams.get('months') || '3')
    const type = url.searchParams.get('type') || 'all' // forecast, anomalies, insights, all

    if (!isConfigured()) {
      return NextResponse.json({ error: 'Not configured', forecasts: [] }, { status: 400 })
    }

    const [invoices, items, customers, jobs, payments, expenses] = await Promise.all([
      listRows<any>('Invoices').then(r => r.slice(0, 500)),
      listRows<any>('Items'),
      listRows<any>('Customers'),
      listRows<any>('Jobs'),
      listRows<any>('Payments').then(r => r.slice(0, 200)),
      listRows<any>('Expenses').then(r => r.slice(0, 200)).catch(() => []),
    ])

    const result: any = {
      meta: {
        version: '7.0 PRO Forecast Engine',
        generatedAt: new Date().toISOString(),
        monthsAhead: months,
      }
    }

    if (type === 'all' || type === 'forecast') {
      result.forecasts = forecastRevenue(invoices, months)
    }

    if (type === 'all' || type === 'anomalies') {
      result.anomalies = detectAnomalies({ invoices, items, customers, jobs, payments, expenses })
    }

    if (type === 'all' || type === 'insights') {
      result.insights = generateSmartInsights({ invoices, items, customers, jobs, payments, expenses })
    }

    return NextResponse.json(result, {
      headers: {
        'X-Forecast-Engine': 'v7-pro',
        'Cache-Control': 'public, max-age=120',
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Forecast error' }, { status: 500 })
  }
}
