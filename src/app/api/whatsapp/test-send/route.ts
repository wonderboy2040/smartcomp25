import { NextRequest, NextResponse } from 'next/server'
import { sendTextMessage, isCloudApiConfigured, normalizePhone } from '@/lib/whatsapp-cloud'

/**
 * Test endpoint: send a single test message to verify Cloud API is working.
 * Useful from the Settings panel "Send Test Message" button.
 *
 * POST /api/whatsapp/test-send
 * { phone: "919876543210", message: "Hello from Smart Computers" }
 */
export async function POST(req: NextRequest) {
  if (!isCloudApiConfigured()) {
    return NextResponse.json(
      { success: false, error: 'WhatsApp Cloud API not configured. Set WA_TOKEN and WA_PHONE_NUMBER_ID.' },
      { status: 400 }
    )
  }
  try {
    const body = await req.json()
    const phone = String(body?.phone || '')
    const message = String(body?.message || 'Test message from Smart Computers Panel')
    if (!phone) return NextResponse.json({ success: false, error: 'Phone required' }, { status: 400 })

    const result = await sendTextMessage(phone, message)
    return NextResponse.json({
      ...result,
      normalizedPhone: normalizePhone(phone),
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 })
  }
}
