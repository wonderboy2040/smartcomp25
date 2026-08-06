import { NextRequest, NextResponse } from 'next/server'
import { isConfigured, getShop, saveShop } from '@/lib/sheets-client'

export async function GET() {
  try {
    if (!isConfigured()) {
      return NextResponse.json({
        name: 'Smart Computers',
        invoicePrefix: 'INV',
        quotationPrefix: 'QTN',
      })
    }
    const shop = await getShop()
    return NextResponse.json(shop || {
      name: 'Smart Computers',
      invoicePrefix: 'INV',
      quotationPrefix: 'QTN',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }
    const body = await req.json()
    const shop = await saveShop(body)
    return NextResponse.json(shop)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
