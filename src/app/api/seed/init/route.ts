import { NextResponse } from 'next/server'
import { seedData, isConfigured } from '@/lib/sheets-client'

export async function POST() {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }
    const results = await seedData()
    return NextResponse.json({ success: true, results })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
