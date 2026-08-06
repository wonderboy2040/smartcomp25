import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhook, parseIncomingWebhook, markMessageAsRead } from '@/lib/whatsapp-cloud'
import { listRows, updateRow, createRow } from '@/lib/sheets-client'
import { parseRateResponseAdvanced } from '@/lib/whatsapp'

/**
 * WhatsApp Cloud API Webhook endpoint.
 *
 * SECURITY: Verifies the X-Hub-Signature-256 HMAC header that Meta sends with
 * every webhook POST. This prevents attackers from POSTing fake messages even
 * if they know the webhook URL — they'd also need the App Secret from Meta dashboard.
 *
 * Set WA_APP_SECRET env var (from Meta App dashboard → App Settings → App Secret)
 * to enable HMAC verification. If WA_APP_SECRET is not set, verification is skipped
 * (with a console warning) so the app still works for testing.
 *
 * Two responsibilities:
 *   1. GET  — Meta webhook verification (challenge response)
 *   2. POST — Incoming messages from suppliers, auto-matched to enquiries
 *
 * Webhook URL to register in Meta:  https://your-domain.com/api/whatsapp/webhook
 * Verify token (set WA_VERIFY_TOKEN env): any random string, e.g. "smartcomp_wh_2026"
 */

// Verify Meta webhook HMAC signature (sha256 of body using App Secret)
async function verifyMetaSignature(req: NextRequest, rawBody: string): Promise<boolean> {
  const APP_SECRET = process.env.WA_APP_SECRET
  // SECURITY: in production, require the secret to be set. Without HMAC
  // verification, anyone can POST fake inbound messages and poison the
  // Enquiries sheet with arbitrary "rates" attached to real suppliers.
  if (!APP_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Webhook] WA_APP_SECRET not set in production — rejecting webhook')
      return false
    }
    console.warn('[Webhook] WA_APP_SECRET not set (dev mode) — skipping HMAC verification')
    return true
  }
  const signature = req.headers.get('x-hub-signature-256')
  if (!signature) return false
  // signature format: "sha256=abc123..."
  if (!signature.startsWith('sha256=')) return false
  const expected = signature.slice(7)
  // Compute HMAC-SHA256
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  // Constant-time compare
  if (computed.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

// ===== GET: Webhook verification =====
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode') || undefined
  const token = url.searchParams.get('hub.verify_token') || undefined
  const challenge = url.searchParams.get('hub.challenge') || undefined

  const result = verifyWebhook(mode, token, challenge)
  if (result.ok && result.challenge !== undefined) {
    // Meta expects the challenge as the plain response body
    return new NextResponse(result.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ===== POST: Incoming message handler =====
export async function POST(req: NextRequest) {
  try {
    // SECURITY: Verify Meta HMAC signature before processing
    const rawBody = await req.text()
    const sigOk = await verifyMetaSignature(req, rawBody)
    if (!sigOk) {
      console.warn('[Webhook] Invalid HMAC signature — rejected')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }
    let body
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const messages = parseIncomingWebhook(body)

    if (messages.length === 0) {
      // Could be a status update (sent/delivered/read) — acknowledge silently
      return NextResponse.json({ success: true, handled: 0 })
    }

    // Load suppliers once for matching by phone number
    const suppliers = await listRows<any>('Suppliers', { useCache: true })
    const suppliersByPhone = new Map<string, any>()
    for (const s of suppliers) {
      const phones = [s.whatsappNumber, s.phone].filter(Boolean).map(String)
      for (const p of phones) {
        const norm = normalizePhoneLocal(p)
        if (norm) suppliersByPhone.set(norm, s)
      }
    }

    // Load open enquiries to match against
    const enquiries = await listRows<any>('Enquiries')
    const openEnquiries = enquiries.filter(
      (e) => String(e.status) === 'sent' && !(e.appliedToItems === true || e.appliedToItems === 'true')
    )

    let handled = 0
    for (const msg of messages) {
      const normFrom = normalizePhoneLocal(msg.from)
      if (!normFrom) continue

      // 1. Find matching supplier by phone
      const supplier = suppliersByPhone.get(normFrom)
      if (!supplier) {
        // Unknown sender — still log a record so nothing is lost (data protection)
        await createRow('Enquiries', {
          supplierId: '',
          supplierName: msg.fromName || `Unknown (${msg.from})`,
          supplierPhone: msg.from,
          itemsJson: '[]',
          message: '(incoming, no matching supplier)',
          status: 'responded',
          sentAt: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
          respondedAt: new Date().toISOString(),
          response: msg.text,
          ratesJson: '[]',
          appliedToItems: false,
          isAuto: false,
        }).catch(() => {})
        continue
      }

      // 2. Find the most recent open enquiry for this supplier
      const matching = openEnquiries
        .filter((e) => String(e.supplierId) === String(supplier.id))
        .sort((a, b) => new Date(b.sentAt || b.createdAt || 0).getTime() - new Date(a.sentAt || a.createdAt || 0).getTime())[0]

      if (!matching) {
        // No open enquiry, but supplier replied — create a fresh "responded" record
        const rates = parseRateResponseAdvanced(msg.text, [])
        await createRow('Enquiries', {
          supplierId: String(supplier.id),
          supplierName: String(supplier.name),
          supplierPhone: String(supplier.whatsappNumber || supplier.phone || ''),
          itemsJson: '[]',
          message: '(unsolicited reply)',
          status: 'responded',
          sentAt: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
          respondedAt: new Date().toISOString(),
          response: msg.text,
          ratesJson: JSON.stringify(rates),
          appliedToItems: false,
          isAuto: false,
        }).catch(() => {})
        handled++
        continue
      }

      // 3. Parse rates from the reply
      let items: any[] = []
      try {
        items = JSON.parse(String(matching.itemsJson || '[]'))
      } catch {
        items = []
      }
      const rates = parseRateResponseAdvanced(msg.text, items)

      // 4. Update the matching enquiry with the response + parsed rates
      await updateRow('Enquiries', String(matching.id), {
        status: 'responded',
        respondedAt: new Date().toISOString(),
        response: msg.text,
        ratesJson: JSON.stringify(rates),
      }).catch(() => {})

      // 5. Mark the incoming message as read (optional, keeps Business app clean)
      await markMessageAsRead(msg.messageId).catch(() => {})

      handled++
    }

    return NextResponse.json({ success: true, handled })
  } catch (e: any) {
    // Always return 200 to Meta so they don't retry endlessly; log the error
    console.error('Webhook POST error:', e?.message)
    return NextResponse.json({ success: false, error: e?.message }, { status: 200 })
  }
}

// local helper (avoids importing the ESM normalizePhone for type issues)
function normalizePhoneLocal(raw: string): string {
  const s = String(raw || '').replace(/[^\d]/g, '')
  if (s.length === 10) return '91' + s
  if (s.length === 12 && s.startsWith('91')) return s
  if (s.length === 11 && s.startsWith('0')) return '91' + s.slice(1)
  return s
}
