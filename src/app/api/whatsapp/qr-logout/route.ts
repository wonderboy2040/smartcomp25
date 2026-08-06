import { NextResponse } from 'next/server'
import { disconnectWhatsApp } from '@/lib/whatsapp-baileys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/whatsapp/qr-logout
 * Disconnects from WhatsApp and clears the Baileys session.
 */
export async function POST() {
  try {
    await disconnectWhatsApp()
    return NextResponse.json({ success: true, message: 'Logged out from WhatsApp' })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
