import { NextRequest, NextResponse } from 'next/server'
import { isCloudApiConfigured, deregisterPhone } from '@/lib/whatsapp-cloud'

/**
 * Deregister the current phone number from Cloud API.
 *
 * POST /api/whatsapp/deregister
 *
 * Use this only if you need to:
 *   - Move the number BACK to WhatsApp Business app
 *   - Re-do the migration from scratch
 *   - Reset the registration state
 *
 * WARNING: After deregister, you won't be able to send/receive messages via
 * Cloud API until you re-register (which requires the migration code flow again).
 */
export async function POST(_req: NextRequest) {
  if (!isCloudApiConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Configure WA_TOKEN and WA_PHONE_NUMBER_ID first' },
      { status: 400 }
    )
  }
  try {
    const result = await deregisterPhone()
    return NextResponse.json({
      ...result,
      message: result.success
        ? 'Number deregistered from Cloud API. You can now re-register it via the migrate flow, or move it back to WhatsApp Business app.'
        : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 })
  }
}
