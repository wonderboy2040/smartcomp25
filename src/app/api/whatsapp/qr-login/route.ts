import { NextResponse } from 'next/server'
import { startWhatsAppConnection, getState } from '@/lib/whatsapp-baileys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60s for QR generation

/**
 * POST /api/whatsapp/qr-login
 *
 * Starts a REAL WhatsApp Web connection using Baileys.
 * Returns a genuine QR code (as data URL image) that the phone app
 * recognises when scanning via:
 *   WhatsApp → Settings → Linked Devices → Link a Device
 *
 * NOTE: Baileys needs a persistent Node.js process (next dev / next start /
 * Electron). It will NOT work on Vercel serverless (connection freezes).
 * Deploy on VPS / Render / Railway / Electron for production.
 */
export async function POST() {
  try {
    const current = getState()

    // If already connected, return success
    if (current.state === 'connected') {
      return NextResponse.json({
        status: 'connected',
        phoneNumber: current.phoneNumber,
        connectedAt: current.connectedAt,
        message: 'Already connected to WhatsApp',
      })
    }

    // Start connection — this generates a real QR code
    await startWhatsAppConnection()

    // Wait for QR to be generated (Baileys needs time to connect to WhatsApp servers)
    // Poll state for up to 25 seconds waiting for QR
    let attempts = 0
    const maxAttempts = 50 // 50 * 500ms = 25 seconds
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 500))
      const s = getState()

      if (s.state === 'connected') {
        return NextResponse.json({
          status: 'connected',
          phoneNumber: s.phoneNumber,
          connectedAt: s.connectedAt,
        })
      }

      if (s.state === 'waiting_qr' && s.qrCode) {
        return NextResponse.json({
          status: 'waiting_qr',
          qrCode: s.qrCode,
          qrRetry: s.qrRetry,
          message: 'Scan QR with WhatsApp → Settings → Linked Devices → Link a Device',
        })
      }

      if (s.state === 'error') {
        return NextResponse.json({
          status: 'error',
          error: s.error || 'Connection failed',
          lastEvent: s.lastEvent,
          hint: getErrorHint(s.error, s.lastEvent),
        }, { status: 500 })
      }

      attempts++
    }

    // Timeout — QR not generated in 25 seconds
    const finalState = getState()
    return NextResponse.json({
      status: 'timeout',
      error: 'QR code generation timed out. WhatsApp servers may be slow or unreachable.',
      lastEvent: finalState.lastEvent,
      hint: 'Make sure you are running the app locally (next dev) or on a VPS — NOT on Vercel serverless. Baileys needs a persistent Node.js process.',
    }, { status: 504 })
  } catch (e: any) {
    return NextResponse.json({
      error: e?.message || 'Failed to start WhatsApp connection',
      hint: 'If running on Vercel/Netlify serverless, Baileys will not work. Deploy on a VPS or run locally.',
    }, { status: 500 })
  }
}

function getErrorHint(error: string | null, lastEvent: string | null): string {
  if (error?.includes('ETIMEDOUT') || error?.includes('ECONNREFUSED')) {
    return 'Cannot reach WhatsApp servers. Check your internet connection and firewall settings.'
  }
  if (error?.includes('logged out') || error?.includes('401')) {
    return 'You were logged out. Click "Generate WhatsApp QR" again to get a new QR code.'
  }
  if (lastEvent === 'init_error') {
    return 'Failed to initialize Baileys. Make sure you are running locally (npm run dev) or on a VPS — not on serverless hosting.'
  }
  return 'Try again. If the issue persists, ensure the app is running locally or on a VPS (not Vercel serverless).'
}
