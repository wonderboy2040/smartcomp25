import { NextRequest, NextResponse } from 'next/server'
import { parseRateResponse, parseRateResponseAdvanced } from '@/lib/whatsapp'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { response, items = [], advanced = true } = body
    if (!response) return NextResponse.json({ error: 'Response required' }, { status: 400 })
    // Use the advanced parser by default — it handles more formats and
    // provides confidence scores + richer notes (MOQ, delivery, warranty).
    const parsed = advanced
      ? parseRateResponseAdvanced(response, items)
      : parseRateResponse(response, items)
    return NextResponse.json({ success: true, parsed })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

