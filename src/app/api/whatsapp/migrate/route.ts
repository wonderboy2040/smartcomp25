import { NextRequest, NextResponse } from 'next/server'
import { isCloudApiConfigured, requestMigrationCode, submitMigrationCode } from '@/lib/whatsapp-cloud'

/**
 * WhatsApp Business App -> Cloud API Migration endpoint.
 *
 * POST /api/whatsapp/migrate
 *   Body: { action: 'request' }                    -> triggers Meta to SMS 6-digit code to the number
 *   Body: { action: 'submit', code: '123456' }     -> submits the code to complete migration
 *
 * After successful 'submit', the WhatsApp Business app on that number will stop
 * working and Cloud API takes over. Suppliers will continue receiving messages
 * from the same number — no disruption for them.
 */
export async function POST(req: NextRequest) {
  if (!isCloudApiConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Configure WA_TOKEN and WA_PHONE_NUMBER_ID first' },
      { status: 400 }
    )
  }
  try {
    const body = await req.json()
    const action = String(body?.action || '')

    if (action === 'request') {
      const result = await requestMigrationCode()
      return NextResponse.json({
        ...result,
        message: result.success
          ? 'Migration code sent via SMS to your WhatsApp Business number. Check your SMS, then come back and enter the 6-digit code.'
          : undefined,
      })
    }

    if (action === 'submit') {
      const code = String(body?.code || '').trim()
      if (!/^\d{6}$/.test(code)) {
        return NextResponse.json({ success: false, error: 'Enter a valid 6-digit code' }, { status: 400 })
      }
      const result = await submitMigrationCode(code)
      return NextResponse.json({
        ...result,
        message: result.success
          ? 'Migration complete! Your WhatsApp Business number is now on Cloud API. The Business app on this number will stop working. You can now send enquiries automatically from the panel.'
          : undefined,
      })
    }

    return NextResponse.json({ success: false, error: 'Unknown action. Use "request" or "submit".' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 })
  }
}
