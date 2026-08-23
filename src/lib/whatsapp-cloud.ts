/**
 * WhatsApp Cloud API client (Meta Official)
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Required env vars (set in Render dashboard):
 *   WA_TOKEN            — Permanent access token from Meta App dashboard
 *   WA_PHONE_NUMBER_ID  — Phone number ID from WhatsApp Business > Phone numbers
 *   WA_BUSINESS_NUMBER  — Your business WhatsApp number (E.164, no +), e.g. 919876543210
 *   WA_VERIFY_TOKEN     — Any random string you choose; same must be set in Meta webhook config
 *   WA_TEMPLATE_NAME    — Approved template name for rate enquiry (default: rate_enquiry)
 *
 * All functions return { success, ... } or throw on network error.
 * Data protection: this module NEVER deletes anything. It only sends messages and reads incoming ones.
 */

const GRAPH_API = 'https://graph.facebook.com/v21.0'
const TOKEN = process.env.WA_TOKEN
const PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID
const BUSINESS_NUMBER = process.env.WA_BUSINESS_NUMBER
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN
const TEMPLATE_NAME = process.env.WA_TEMPLATE_NAME || 'rate_enquiry'

export function isCloudApiConfigured(): boolean {
  return !!(TOKEN && PHONE_NUMBER_ID)
}

export function getCloudApiConfig() {
  return {
    configured: isCloudApiConfigured(),
    businessNumber: BUSINESS_NUMBER || '',
    phoneNumberId: PHONE_NUMBER_ID ? '***' + PHONE_NUMBER_ID.slice(-4) : '',
    templateName: TEMPLATE_NAME,
    verifyTokenSet: !!VERIFY_TOKEN,
  }
}

/**
 * Normalize a phone number to E.164 (digits only, country code prefix).
 * Handles: 919876543210, +919876543210, 9876543210 (assumes India 91 if 10 digits), etc.
 */
export function normalizePhone(raw: string): string {
  const s = String(raw || '').replace(/[^\d]/g, '')
  if (s.length === 10) return '91' + s // assume India
  if (s.length === 12 && s.startsWith('91')) return s
  if (s.length === 11 && s.startsWith('0')) return '91' + s.slice(1)
  return s
}

/**
 * Send a free-text WhatsApp message to a supplier.
 * Works only if the supplier has messaged you in the last 24h (customer service window).
 *
 * @param to - recipient phone (any format, will be normalized)
 * @param text - message body
 */
export async function sendTextMessage(to: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!isCloudApiConfigured()) {
    return { success: false, error: 'WA_TOKEN / WA_PHONE_NUMBER_ID not configured' }
  }
  const phone = normalizePhone(to)
  if (!phone) return { success: false, error: 'Invalid phone number' }

  try {
    const res = await fetch(`${GRAPH_API}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body: text, preview_url: false },
      }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data?.error?.message || `HTTP ${res.status}` }
    }
    return { success: true, messageId: data?.messages?.[0]?.id }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' }
  }
}

/**
 * Send a PDF document to a WhatsApp recipient via the Cloud API.
 *
 * This is the OFFICIAL way to attach a PDF file to a WhatsApp message —
 * the recipient gets the PDF inline in the chat (no manual attachment).
 * Works on BOTH mobile and desktop since the upload happens server-side.
 *
 * Two-step flow (per Meta docs):
 *   1. POST the PDF binary to /app/uploads with type=document → get an `id`.
 *      The `id` stays valid for ~30 minutes, enough to send the message.
 *   2. POST to /messages with type=document + the uploaded id + a caption.
 *
 * Required env: WA_TOKEN + WA_PHONE_NUMBER_ID (same as sendTextMessage).
 *
 * @param to       recipient phone (any format, normalized to E.164)
 * @param pdfBuffer PDF bytes (typically 50-500 KB; max 100 MB per Meta's limit)
 * @param filename  e.g. "Invoice-SCSS-26-27-001.pdf" (must end with .pdf)
 * @param caption   short text shown under the PDF (e.g. "Invoice #SCSS/26-27/001 • Total: Rs.3000")
 */
export async function sendPdfDocument(
  to: string,
  pdfBuffer: Buffer,
  filename: string,
  caption: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!isCloudApiConfigured()) {
    return { success: false, error: 'WA_TOKEN / WA_PHONE_NUMBER_ID not configured' }
  }
  const phone = normalizePhone(to)
  if (!phone) return { success: false, error: 'Invalid phone number' }
  if (!pdfBuffer || pdfBuffer.length < 1000) {
    return { success: false, error: 'PDF buffer is empty or too small' }
  }
  if (!filename.toLowerCase().endsWith('.pdf')) {
    return { success: false, error: 'Filename must end with .pdf' }
  }

  // ─── Step 1: Upload the PDF binary to Meta's storage ───
  // Build a multipart/form-data body manually (no extra deps required).
  const boundary = '----SmartCompBoundary' + Math.random().toString(36).slice(2)
  const safeName = filename.replace(/[^\w.-]+/g, '_').slice(0, 100)

  const parts: Buffer[] = []
  parts.push(Buffer.from(`--${boundary}\r\n`))
  parts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n`))
  parts.push(Buffer.from('Content-Type: application/pdf\r\n\r\n'))
  parts.push(pdfBuffer)
  parts.push(Buffer.from('\r\n'))
  parts.push(Buffer.from(`--${boundary}\r\n`))
  parts.push(Buffer.from('Content-Disposition: form-data; name="type"\r\n\r\n'))
  parts.push(Buffer.from(`\r\n--${boundary}\r\n`))
  parts.push(Buffer.from('Content-Disposition: form-data; name="messaging_product"\r\n\r\n'))
  parts.push(Buffer.from(`whatsapp\r\n--${boundary}--\r\n`))
  // Meta's API expects 'messaging_product' as a regular form field, not inside
  // the JSON. The above arrangement matches the working samples from Meta's docs.
  const formDataBuffer = Buffer.concat(parts)

  let mediaId: string
  try {
    const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formDataBuffer,
      signal: AbortSignal.timeout(60000),
    })
    const uploadData = await uploadRes.json()
    if (!uploadRes.ok || !uploadData?.id) {
      return { success: false, error: uploadData?.error?.message || `Upload failed: HTTP ${uploadRes.status}` }
    }
    mediaId = String(uploadData.id)
  } catch (e: any) {
    return { success: false, error: e?.message || 'PDF upload network error' }
  }

  // ─── Step 2: Send the message referencing the uploaded media id ───
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'document',
        document: {
          id: mediaId,
          filename: safeName,
          caption,
        },
      }),
      signal: AbortSignal.timeout(30000),
    })
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data?.error?.message || `HTTP ${res.status}` }
    }
    return { success: true, messageId: data?.messages?.[0]?.id }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Send-message network error' }
  }
}

/**
 * Send a template-based WhatsApp message (works even outside the 24h window).
 * Use this for FIRST contact with suppliers who haven't replied yet.
 *
 * Template must be approved in Meta Business Manager.
 * Default template name: rate_enquiry (you can change via WA_TEMPLATE_NAME env).
 *
 * Expected template format (create this in Meta Business Manager):
 *   Name: rate_enquiry
 *   Language: en (or en_US)
 *   Category: MARKETING or UTILITY
 *   Header: None
 *   Body: "Hello {{1}}, please provide latest rates for the following items:\n\n{{2}}\n\nReply with rates in format: 1. Item Name: Rs.XXXX (GST: Yes/No)"
 *   Buttons: None
 *
 * @param to - recipient phone
 * @param supplierName - goes into {{1}}
 * @param itemsList - newline-joined item names, goes into {{2}}
 */
export async function sendTemplateMessage(
  to: string,
  supplierName: string,
  itemsList: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!isCloudApiConfigured()) {
    return { success: false, error: 'WA_TOKEN / WA_PHONE_NUMBER_ID not configured' }
  }
  const phone = normalizePhone(to)
  if (!phone) return { success: false, error: 'Invalid phone number' }

  try {
    const res = await fetch(`${GRAPH_API}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'template',
        template: {
          name: TEMPLATE_NAME,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: String(supplierName || 'Sir/Madam') },
                { type: 'text', text: String(itemsList || '') },
              ],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data?.error?.message || `HTTP ${res.status}` }
    }
    return { success: true, messageId: data?.messages?.[0]?.id }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' }
  }
}

/**
 * Deregister a phone number from Cloud API.
 * Use this if you need to re-register / re-migrate a number that was previously
 * linked to WhatsApp Business app.
 *
 * After deregister, the number can be re-registered with Cloud API.
 * Meta docs: https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers#deregister
 */
export async function deregisterPhone(): Promise<{ success: boolean; error?: string }> {
  if (!isCloudApiConfigured()) {
    return { success: false, error: 'WA_TOKEN / WA_PHONE_NUMBER_ID not configured' }
  }
  try {
    const res = await fetch(`${GRAPH_API}/${PHONE_NUMBER_ID}/deregister`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data?.error?.message || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' }
  }
}

/**
 * Initiate WhatsApp Business app → Cloud API migration.
 *
 * When you want to move a number that is currently registered with the WhatsApp
 * Business app to Cloud API, Meta requires a 6-digit migration code. This function
 * triggers Meta to send that code via SMS to the number.
 *
 * Meta's migration flow uses the SAME /deregister endpoint but with a specific
 * body parameter that indicates "migration" mode. The response triggers an SMS
 * with a 6-digit code to the registered number.
 *
 * After receiving the code, the user enters it via submitMigrationCode() which
 * calls the /register endpoint to complete migration.
 *
 * Meta docs: https://developers.facebook.com/docs/whatsapp/cloud-api/migrate-whatsapp-business-app-account
 */
export async function requestMigrationCode(): Promise<{ success: boolean; error?: string }> {
  if (!isCloudApiConfigured()) {
    return { success: false, error: 'WA_TOKEN / WA_PHONE_NUMBER_ID not configured' }
  }
  try {
    // Step 1: Deregister the number from Business app (this triggers Meta to
    // send a 6-digit migration code via SMS to confirm the migration).
    // The migration flow IS the deregister flow — Meta sends a confirmation code
    // before actually deregistering. See Meta docs link above.
    const res = await fetch(`${GRAPH_API}/${PHONE_NUMBER_ID}/deregister`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp' }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Common errors:
      //  - "Phone already deregistered" → number is already on Cloud API, no migration needed
      //  - "Migration code already sent" → user should check SMS
      const errMsg = data?.error?.message || `HTTP ${res.status}`
      if (errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('deregistered')) {
        return {
          success: true,
          error: undefined,
        }
      }
      return { success: false, error: errMsg }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' }
  }
}

/**
 * Complete the migration by submitting the 6-digit code that Meta sent via SMS.
 *
 * After this succeeds, the number is fully migrated to Cloud API and the
 * WhatsApp Business app on that number will stop working.
 */
export async function submitMigrationCode(code: string): Promise<{ success: boolean; error?: string }> {
  if (!isCloudApiConfigured()) {
    return { success: false, error: 'WA_TOKEN / WA_PHONE_NUMBER_ID not configured' }
  }
  if (!/^\d{6}$/.test(String(code || ''))) {
    return { success: false, error: 'Code must be 6 digits' }
  }
  try {
    const res = await fetch(`${GRAPH_API}/${PHONE_NUMBER_ID}/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        code: String(code),
      }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data?.error?.message || `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' }
  }
}

/**
 * Mark a message as "read". Optional — prevents the message from showing as unread
 * in your WhatsApp Business app if you also use the app.
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
  if (!isCloudApiConfigured() || !messageId) return
  try {
    await fetch(`${GRAPH_API}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    // non-fatal
  }
}

/**
 * Verify the Meta webhook challenge (GET request from Meta when you set up the webhook).
 * Returns the challenge string if the verify token matches.
 */
export function verifyWebhook(mode: string | undefined, token: string | undefined, challenge: string | undefined): {
  ok: boolean
  challenge?: string
} {
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return { ok: true, challenge: challenge || '' }
  }
  return { ok: false }
}

/**
 * Extract structured message(s) from an incoming webhook payload.
 * Returns an array of { from, text, timestamp, messageId, type }.
 * Handles both text messages and button replies.
 */
export interface IncomingMessage {
  from: string
  fromName?: string
  text: string
  timestamp: string
  messageId: string
  type: 'text' | 'button' | 'interactive' | 'unknown'
}

export function parseIncomingWebhook(body: any): IncomingMessage[] {
  const messages: IncomingMessage[] = []
  try {
    const entries = body?.entry || []
    for (const entry of entries) {
      const changes = entry?.changes || []
      for (const change of changes) {
        const value = change?.value
        if (!value || !value.messages) continue
        for (const msg of value.messages) {
          const from = String(msg.from || '')
          const fromName = value?.contacts?.[0]?.profile?.name || ''
          const timestamp = String(msg.timestamp || '')
          const messageId = String(msg.id || '')
          const type = String(msg.type || 'unknown')

          let text = ''
          if (type === 'text' && msg.text?.body) {
            text = String(msg.text.body)
          } else if (type === 'button' && msg.button?.text) {
            text = String(msg.button.text)
          } else if (type === 'interactive') {
            const ir = msg.interactive
            if (ir?.button_reply?.id) text = String(ir.button_reply.id)
            else if (ir?.list_reply?.id) text = String(ir.list_reply.id)
            else if (ir?.nfm_reply?.response_json) text = String(ir.nfm_reply.response_json)
            else text = JSON.stringify(ir || {})
          } else {
            text = JSON.stringify(msg)
          }

          if (from && text) {
            messages.push({ from, fromName, text, timestamp, messageId, type: type as any })
          }
        }
      }
    }
  } catch {
    // swallow — webhook parsing must never crash
  }
  return messages
}
