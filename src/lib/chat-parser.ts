/**
 * WhatsApp Chat Export Parser
 *
 * WhatsApp Business app's "Export Chat" feature produces a .txt file in this format:
 *
 *   [12/31/25, 3:45:30 PM] Supplier Name: Hello, rates for today:
 *   [12/31/25, 3:45:35 PM] Supplier Name: 1. SSD 512GB: Rs.3500 (GST: Yes)
 *   [12/31/25, 3:45:36 PM] Supplier Name: 2. RAM 8GB: Rs.2200
 *   [12/31/25, 3:50:00 PM] You: Thanks, will check
 *
 * On iOS the format is slightly different (uses 24h time and different bracket style):
 *   [31/12/2025, 15:45:30] Supplier Name: Hello
 *
 * This parser:
 *   1. Splits the export into individual messages
 *   2. Identifies the supplier (the contact whose chat is being exported) — they're the "other" party
 *   3. Extracts only their messages (not "You:" messages)
 *   4. Joins them into a single response text
 *   5. Runs the rate parser on the response
 *
 * Returns: { supplierName, supplierPhone?, responseText, parsedRates }
 */

import { parseRateResponseAdvanced, ParsedRate } from './whatsapp'

export interface ParsedChatExport {
  supplierName: string | null
  supplierPhone: string | null
  responseText: string
  parsedRates: ParsedRate[]
  messageCount: number
  dateRange: { start: string | null; end: string | null }
  originalItems: { name: string; sku?: string }[]
}

// Regex to match WhatsApp chat export message headers
// Matches: [12/31/25, 3:45:30 PM] Sender Name: message
//       or: [31/12/2025, 15:45:30] Sender Name: message
//       or: 12/31/25, 3:45:30 PM - Sender Name: message  (older Android format)
const MSG_LINE_REGEX =
  /^(?:\[)?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})[, ]+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)(?:[\],])\s*[-:]\s*([^:]+?):\s*(.*)$/i

export function parseChatExport(
  fileContent: string,
  originalItems: { name: string; sku?: string }[] = []
): ParsedChatExport {
  const text = String(fileContent || '')
  const lines = text.split(/\r?\n/)

  const messages: { date: string; sender: string; body: string }[] = []
  let currentMsg: { date: string; sender: string; body: string } | null = null

  for (const line of lines) {
    const match = line.match(MSG_LINE_REGEX)
    if (match) {
      // New message starts
      if (currentMsg) messages.push(currentMsg)
      currentMsg = {
        date: `${match[1]} ${match[2]}`,
        sender: match[3].trim(),
        body: match[4] || '',
      }
    } else if (currentMsg) {
      // Continuation of previous message (multi-line)
      currentMsg.body += '\n' + line
    }
  }
  if (currentMsg) messages.push(currentMsg)

  // Identify the supplier — they're the sender who is NOT "You" / "Me" / the shop owner
  // We pick the most common non-self sender
  const selfAliases = ['you', 'me', '~', 'you:', 'me:']
  const senderCounts = new Map<string, number>()
  for (const m of messages) {
    const s = m.sender.toLowerCase().trim()
    if (selfAliases.includes(s)) continue
    senderCounts.set(m.sender, (senderCounts.get(m.sender) || 0) + 1)
  }
  let supplierName: string | null = null
  let maxCount = 0
  for (const [name, count] of senderCounts.entries()) {
    if (count > maxCount) {
      maxCount = count
      supplierName = name
    }
  }

  // Collect only supplier's messages
  const supplierMessages = messages.filter(
    (m) => supplierName && m.sender === supplierName
  )

  // Build response text — join all supplier messages
  const responseText = supplierMessages.map((m) => m.body).join('\n')

  // Parse rates from the response (advanced parser handles @ patterns, ₹, OOS, MOQ)
  const parsedRates = parseRateResponseAdvanced(responseText, originalItems)

  // Date range
  const dateRange = {
    start: messages.length > 0 ? messages[0].date : null,
    end: messages.length > 0 ? messages[messages.length - 1].date : null,
  }

  return {
    supplierName,
    supplierPhone: null, // WhatsApp export doesn't include phone numbers
    responseText,
    parsedRates,
    messageCount: supplierMessages.length,
    dateRange,
    originalItems,
  }
}

/**
 * Match a parsed chat export to an existing enquiry in the Enquiries sheet.
 * Strategy: match by supplier name (fuzzy contains). Returns the best matching enquiry.
 */
export function matchEnquiryBySupplierName(
  supplierName: string | null,
  enquiries: any[]
): any | null {
  if (!supplierName || enquiries.length === 0) return null

  const name = supplierName.toLowerCase().trim()
  // Exact match first
  let best: any = null
  let bestScore = 0
  for (const e of enquiries) {
    const eName = String(e?.supplierName || e?.supplier?.name || '').toLowerCase().trim()
    if (!eName) continue
    let score = 0
    if (eName === name) score = 100
    else if (eName.includes(name) || name.includes(eName)) score = 80
    else if (eName.split(' ').some((w: string) => w.length > 2 && name.includes(w))) score = 50
    if (score > bestScore) {
      bestScore = score
      best = e
    }
  }
  return bestScore >= 50 ? best : null
}
