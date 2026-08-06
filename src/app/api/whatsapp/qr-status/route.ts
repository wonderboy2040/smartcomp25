import { NextResponse } from 'next/server'
import { getState } from '@/lib/whatsapp-baileys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/whatsapp/qr-status
 * Returns the current WhatsApp connection state (via Baileys).
 *
 * States:
 *   - disconnected  → no connection
 *   - connecting    → starting up (connecting to WhatsApp servers)
 *   - waiting_qr    → QR generated, waiting for phone scan
 *   - connected     → phone linked, ready to capture messages
 *   - error         → connection failed
 *
 * Also returns `lastEvent` for debugging connection issues.
 */

export async function GET() {
  try {
    const state = getState()
    return NextResponse.json({
      status: state.state,
      qrCode: state.qrCode,
      qrRetry: state.qrRetry,
      phoneNumber: state.phoneNumber,
      connectedAt: state.connectedAt,
      error: state.error,
      lastEvent: state.lastEvent,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
