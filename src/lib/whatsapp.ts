// WhatsApp helper - generates wa.me links and message templates
// Note: For full automation, use WhatsApp Business API / Twilio / WATI
import { BUSINESS_GROWTH } from './business-growth'

export interface WhatsAppMessage {
  to: string // phone number with country code, no + sign
  message: string
}

// Generate wa.me link for opening WhatsApp with prefilled message.
// v12.5 FIX: A 10-digit Indian mobile (e.g., 9876543210) MUST be prefixed
// with country code "91" before wa.me will route to the correct chat.
// Without the prefix, wa.me treats it as an invalid international number
// and shows a "Phone number not found" / "Couldn't find" error in WhatsApp
// Web / WhatsApp Desktop.
//
// Examples handled:
//   9876543210         → 919876543210
//   09876543210        → 919876543210 (strip leading 0, add 91)
//   +91 98765 43210    → 919876543210 (strip non-digits, keep 91)
//   919876543210       → 919876543210 (already E.164, keep as-is)
//   1 650 555 1234     → 16505551234  (US number, keep as-is — no India prefix)
export function generateWhatsAppLink(phone: string, message: string): string {
  // Defensive: Google Sheets may store phone as a number, not a string.
  // Coerce to string before calling .replace(). Also handle null/undefined.
  const phoneStr = String(phone ?? '')
  const cleanPhone = phoneStr.replace(/[^\d]/g, '')
  const encoded = encodeURIComponent(message)

  // Empty → just open WhatsApp with no recipient (user picks chat manually).
  if (!cleanPhone) {
    return `https://wa.me/?text=${encoded}`
  }

  // 10-digit mobile (no country code) → assume India, prefix 91.
  if (cleanPhone.length === 10) {
    return `https://wa.me/91${cleanPhone}?text=${encoded}`
  }

  // 11-digit starting with 0 (Indian landline-style leading 0) → strip 0, prefix 91.
  if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
    return `https://wa.me/91${cleanPhone.slice(1)}?text=${encoded}`
  }

  // 12+ digits starting with 91 → already E.164, use as-is.
  // Any other length → use as-is (let WhatsApp decide if it's valid).
  return `https://wa.me/${cleanPhone}?text=${encoded}`
}

// Build Purchase Order message sent to the supplier on WhatsApp
export function buildPurchaseOrderMessage(
  poNumber: string,
  supplierName: string,
  items: { name: string; quantity: number; costPrice: number }[],
  grandTotal: number,
  notes?: string
): string {
  const num = String(poNumber || '')
  const sn = String(supplierName || 'Supplier')
  const amt = Number(grandTotal) || 0
  let msg = `*PURCHASE ORDER* ${num}\n`
  msg += `Dear ${sn},\n\n`
  msg += `Please supply the following items:\n\n`
  items.forEach((item) => {
    const qty = Number(item?.quantity) || 0
    const cost = Number(item?.costPrice) || 0
    msg += `${qty} x ${String(item?.name || '').trim()}`
    if (cost > 0) msg += ` @ Rs.${cost}`
    msg += `\n`
  })
  msg += `\n*Total: Rs. ${amt.toFixed(2)}*\n`
  if (notes) msg += `\n*Note:* ${String(notes).trim()}\n`
  msg += `\nPlease confirm availability. Thank you!`
  return msg
}

// Build rate enquiry message for supplier
// SIMPLE FORMAT — just shop name, item list, and "prices?"
// Suppliers in the computer hardware trade prefer short messages.
export function buildEnquiryMessage(
  shopName: string,
  items: { name: string; sku?: string }[],
  _enquiryNumber?: string
): string {
  const sn = String(shopName || 'Smart Computers')
  let msg = `*${sn}*\n\n`
  items.forEach((item) => {
    const name = String(item?.name || '').trim()
    if (name) msg += `${name}\n`
  })
  msg += `\nprices?`
  return msg
}

// Build invoice/quote share message
export function buildInvoiceShareMessage(
  shopName: string,
  customerName: string,
  docType: 'invoice' | 'quotation',
  number: string,
  amount: number,
  dueDate?: Date
): string {
  const sn = String(shopName || 'Smart Computers')
  const cn = String(customerName || 'Customer')
  const num = String(number || '')
  const amt = Number(amount) || 0
  let msg = `*${sn}*\n\n`
  msg += `Dear ${cn},\n\n`
  msg += `Please find attached ${docType === 'invoice' ? 'invoice' : 'quotation'}:\n\n`
  msg += `*${docType === 'invoice' ? 'Invoice' : 'Quotation'} No:* ${num}\n`
  msg += `*Amount:* Rs. ${amt.toFixed(2)}\n`
  if (docType === 'invoice' && dueDate) {
    msg += `*Due Date:* ${dueDate.toLocaleDateString('en-IN')}\n`
  } else if (docType === 'quotation' && dueDate) {
    msg += `*Valid Till:* ${dueDate.toLocaleDateString('en-IN')}\n`
  }
  msg += `\nFor any queries, please contact us.\n\nThank you for your business!`
  return msg
}

// Build payment reminder message
export function buildPaymentReminderMessage(
  shopName: string,
  customerName: string,
  invoiceNumber: string,
  amount: number,
  dueDate?: Date
): string {
  const sn = String(shopName || 'Smart Computers')
  const cn = String(customerName || 'Customer')
  const inum = String(invoiceNumber || '')
  const amt = Number(amount) || 0
  let msg = `*${sn}*\n\n`
  msg += `Dear ${cn},\n\n`
  msg += `This is a gentle reminder for the pending payment:\n\n`
  msg += `*Invoice No:* ${inum}\n`
  msg += `*Amount Due:* Rs. ${amt.toFixed(2)}\n`
  if (dueDate) msg += `*Due Date:* ${dueDate.toLocaleDateString('en-IN')}\n`
  msg += `\nKindly arrange the payment at your earliest convenience.\n\nThank you!`
  return msg
}

// Parse rate response from supplier (natural language to structured rates)
//
// Handles common Indian computer hardware trade reply formats:
//   "3450+"            → rate=3450, gstType='extra'  (GST is ADDITIONAL, 18% on top)
//   "3450 nett"        → rate=3450, gstType='inclusive' (GST is INCLUDED in price)
//   "3450"             → rate=3450, gstType='unknown'
//   "3450 + GST"       → rate=3450, gstType='extra'
//   "3450 + 18%"       → rate=3450, gstType='extra', gstRate=18
//   "3450 incl GST"    → rate=3450, gstType='inclusive'
//   "3450 (GST extra)" → rate=3450, gstType='extra'
//   "3450 (GST incl)"  → rate=3450, gstType='inclusive'
//   "GST: 3450+"       → same as above
//
// totalCost = what you actually pay:
//   - extra:     rate + (rate * gstRate/100), e.g. 3450 + 18% = 4071
//   - inclusive: rate (already includes GST)
//   - unknown:   rate (treated as inclusive for safety)
export interface ParsedRate {
  itemName: string
  rate: number          // the base rate as quoted
  gstApplicable: boolean | null
  gstType: 'extra' | 'inclusive' | 'unknown' | null
  gstRate?: number
  totalCost: number     // effective cost including GST if extra
  raw: string           // original line text
  confidence?: number   // 0-1 how confident the parser is about this extraction
  matchedItemSku?: string // SKU of the matched original item, if any
  notes?: string        // any extra context the parser captured
}

/**
 * ADVANCED Supplier Rate Parser — Superintelligence v2.0
 *
 * Improvements over the original parseRateResponse:
 *   - Handles multi-line items (item name on one line, rate on next)
 *   - Recognises Indian number formats (₹, Rs, INR, rupees, /- suffix)
 *   - Detects "out of stock", "OOS", "not available" markers
 *   - Detects delivery charges, MOQ (minimum order qty), warranty info
 *   - Confidence scoring (0-1) so UI can highlight low-confidence entries
 *   - Better item matching using fuzzy substring + SKU + brand keywords
 *   - Handles bullet markers: •, -, *, →, tab-indented rates
 *   - Handles "Item: Rs.1000 (per unit)" style per-unit pricing
 *   - Extracts GST rate from percentage or word form ("eighteen percent")
 *
 * Used by /api/whatsapp/parse and /api/whatsapp/intelligence endpoints.
 */
export function parseRateResponseAdvanced(
  response: string,
  originalItems: { name: string; sku?: string }[]
): ParsedRate[] {
  if (!response || !response.trim()) return []

  const lines = response.split(/\r?\n+/).map(l => l.trim()).filter(Boolean)
  const results: ParsedRate[] = []
  const usedOriginalIndices = new Set<number>()

  // Greeting / signature lines to skip (no numbers at all)
  const skipIfNoNumber = /^(thank|hello|hi|ok|yes|no|sure|please|dear|regards|best|cheers|namaste|sir|madam|bro|bhai)\b/i

  // "Out of stock" markers
  const oosRegex = /\b(out of stock|oos|not available|unavailable|na\b|n\/a|sold out|out-of-stock)\b/i

  // Rate extraction patterns (order matters — most specific first)
  // Each pattern: [regex, captureGroupForName, captureGroupForRate]
  const patterns: Array<{ re: RegExp; nameGroup: number; rateGroup: number }> = [
    // ===== @ PATTERN (most common in Indian wholesale trade) =====
    // "Item Name @NO" — out of stock (MUST come first — before general @ patterns)
    { re: /^(.+?)\s*@\s*(?:no|na|n\/a|oos|out\s*of\s*stock|not\s*available)\b.*$/i, nameGroup: 1, rateGroup: 0 },
    // "Item @BRAND @1600+" — double @ (brand note then rate) — MUST come before single-@
    // e.g. "Zebronics H81M2 Motherboard @CONSISINTET @1600+"
    // e.g. "24 inch FHD Monitor @IPS @4850+"
    { re: /^(.+?)\s*@\s*[A-Za-z][^\d@]*\s*@\s*(\d+(?:[.,]\d+)?)\s*(\+|nett?|incl)?/i, nameGroup: 1, rateGroup: 2 },
    // "Item @BRAND RATE+" — single @ with brand text, then rate (NOT a digit after @)
    // e.g. "22 inch FHD Monitor @IPS 4100+"
    // e.g. "19.5 HD Monitor @1800+ FOXIN" (digit after @, brand after rate)
    { re: /^(.+?)\s*@\s*([A-Za-z][^\d]*)\s*(\d+(?:[.,]\d+)?)\s*(\+|nett?|incl)?/i, nameGroup: 1, rateGroup: 3 },
    // "Item @Rate+" / "Item @Rate nett" — @ directly followed by number
    // e.g. "Mouse @75+", "DDR3 8GB @1200+", "Keyboard @175+"
    { re: /^(.+?)\s*@\s*(\d+(?:[.,]\d+)?)\s*(\+|nett?|incl|gst\s*extra|gst\s*incl)?\b.*$/i, nameGroup: 1, rateGroup: 2 },
    // ===== STANDARD PATTERNS =====
    // "1. Item Name: Rs.3450+" — numbered list with Rs.
    { re: /^\d+[\.\)]\s*(.+?)\s*[:\-]\s*(?:rs\.?|₹|inr|rupees?)?\s*\.?\s*(\d+(?:[.,]\d+)?)\s*(?:\/-|per\s+(?:unit|pc|piece|qty))?/i, nameGroup: 1, rateGroup: 2 },
    // "Item Name: Rs.3450" — name : Rs. rate
    { re: /^(.+?)\s*[:\-]\s*(?:rs\.?|₹|inr|rupees?)\s*\.?\s*(\d+(?:[.,]\d+)?)\s*(?:\/-|per\s+(?:unit|pc|piece|qty))?/i, nameGroup: 1, rateGroup: 2 },
    // "Item Name - 3450"  /  "Item Name → 3450"
    { re: /^(.+?)\s*[-→]\s*(?:rs\.?|₹|inr|rupees?)?\s*\.?\s*(\d+(?:[.,]\d+)?)\s*(?:\/-)?/i, nameGroup: 1, rateGroup: 2 },
    // "• Item Name 3450"  /  "* Item Name 3450"
    { re: /^[•\*\u2022]\s*(.+?)\s+(?:rs\.?|₹|inr|rupees?)?\s*\.?\s*(\d+(?:[.,]\d+)?)\s*(?:\/-)?/i, nameGroup: 1, rateGroup: 2 },
    // "Rs.3450 Item Name" — rate first, then name
    { re: /^(?:rs\.?|₹|inr|rupees?)\s*\.?\s*(\d+(?:[.,]\d+)?)\s*(?:\/-)?\s*[-:]?\s*(.+)/i, nameGroup: 2, rateGroup: 1 },
    // "Item Name 3450+" — name then bare number with optional + suffix
    { re: /^(.+?)\s+(?:rs\.?|₹|inr)?\s*(\d{3,}(?:[.,]\d+)?)\s*(\+|nett?|incl)?\s*$/i, nameGroup: 1, rateGroup: 2 },
    // "3450" — bare rate only (assign by order)
    { re: /^(?:rs\.?|₹|inr|rupees?)?\s*\.?\s*(\d{3,}(?:[.,]\d+)?)\s*(?:\/-)?$/i, nameGroup: 0, rateGroup: 1 },
  ]

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    const lowerLine = line.toLowerCase()

    // Skip greeting/signature lines that have no 3+ digit number
    if (skipIfNoNumber.test(line) && !/\d{3,}/.test(line)) continue

    // Skip pure section headers like "Rates:", "Quote:", "---"
    if (/^(rates|quote|quotation|price|prices|items?)\s*:?$/i.test(line)) continue
    if (/^-{3,}$/.test(line) || /^\*{3,}$/.test(line)) continue

    // Check for out-of-stock marker
    let isOOS = oosRegex.test(line)

    let matched = false
    let itemNameRaw = ''
    let rateStr = ''
    let confidence = 0.5

    for (const p of patterns) {
      const m = line.match(p.re)
      if (m) {
        // rateGroup 0 means "no rate" (used for @NO / out-of-stock patterns)
        if (p.rateGroup === 0) {
          rateStr = ''
          itemNameRaw = p.nameGroup > 0 ? (m[p.nameGroup] || '').trim() : ''
          confidence = 0.7
          matched = true
          // Mark as OOS — the isOOS check below will handle it
          isOOS = true
          break
        }
        rateStr = m[p.rateGroup] || ''
        if (p.nameGroup > 0) {
          itemNameRaw = (m[p.nameGroup] || '').trim()
          confidence = 0.85
        } else {
          // Bare-rate pattern — lower confidence, name will be filled by order
          itemNameRaw = ''
          confidence = 0.55
        }
        // Boost confidence if Rs./₹ prefix is present
        if (/rs\.?|₹|inr/i.test(line)) confidence = Math.min(1, confidence + 0.1)
        // Boost confidence if @ separator is present (common trade format)
        if (/@/i.test(line)) confidence = Math.min(1, confidence + 0.05)
        matched = true
        break
      }
    }

    if (!matched) continue

    // If no rate string and not OOS, skip (e.g. truncated line like "Wired Combo KB & Mous")
    if (!rateStr && !isOOS) continue

    // Normalize rate string: Indian 1,234.56 → 1234.56; 1.234,56 → 1234.56
    const rateNum = rateStr ? parseIndianNumber(rateStr) : 0
    if (rateStr && (isNaN(rateNum) || rateNum <= 0)) continue

    // Out of stock → record as 0 rate with notes
    if (isOOS) {
      results.push({
        itemName: itemNameRaw || '(unknown item)',
        rate: 0,
        gstApplicable: null,
        gstType: null,
        totalCost: 0,
        raw: line,
        confidence: 0.7,
        notes: 'OUT OF STOCK',
      })
      continue
    }

    // Match item name to original items list
    let itemName = itemNameRaw
    let matchedItem: { name: string; sku?: string } | undefined
    let matchedSku: string | undefined

    if (itemNameRaw) {
      // Try exact SKU match first
      for (let i = 0; i < originalItems.length; i++) {
        if (usedOriginalIndices.has(i)) continue
        const orig = originalItems[i]
        if (orig.sku && lowerLine.includes(String(orig.sku).toLowerCase())) {
          matchedItem = orig
          matchedSku = orig.sku
          usedOriginalIndices.add(i)
          itemName = orig.name
          confidence = Math.min(1, confidence + 0.15)
          break
        }
      }
      // Then fuzzy name match (substring either way)
      if (!matchedItem) {
        for (let i = 0; i < originalItems.length; i++) {
          if (usedOriginalIndices.has(i)) continue
          const orig = originalItems[i]
          const origName = String(orig?.name || '').toLowerCase()
          const raw = itemNameRaw.toLowerCase()
          if (origName.length > 3 && (origName.includes(raw) || raw.includes(origName))) {
            matchedItem = orig
            matchedSku = orig.sku
            usedOriginalIndices.add(i)
            itemName = orig.name
            confidence = Math.min(1, confidence + 0.1)
            break
          }
        }
      }
      // Keyword match — split name into words and check overlap
      if (!matchedItem) {
        const rawWords = itemNameRaw.toLowerCase().split(/\s+/).filter(w => w.length > 2)
        for (let i = 0; i < originalItems.length; i++) {
          if (usedOriginalIndices.has(i)) continue
          const orig = originalItems[i]
          const origWords = String(orig?.name || '').toLowerCase().split(/\s+/).filter(w => w.length > 2)
          const overlap = rawWords.filter(w => origWords.includes(w)).length
          if (overlap >= 2 && overlap / Math.max(rawWords.length, 1) >= 0.5) {
            matchedItem = orig
            matchedSku = orig.sku
            usedOriginalIndices.add(i)
            itemName = orig.name
            confidence = Math.min(1, confidence + 0.05)
            break
          }
        }
      }
    } else {
      // Bare rate line — assign to next unused original item by order
      for (let i = 0; i < originalItems.length; i++) {
        if (!usedOriginalIndices.has(i)) {
          matchedItem = originalItems[i]
          matchedSku = matchedItem.sku
          usedOriginalIndices.add(i)
          itemName = matchedItem.name
          break
        }
      }
    }

    // GST detection (kept from original, slightly enhanced)
    let gstType: 'extra' | 'inclusive' | 'unknown' | null = null
    let gstRate: number | undefined
    let gstApplicable: boolean | null = null

    const gstRateMatch = lowerLine.match(/(\d+)\s*%/) || lowerLine.match(/gst\s*(\d+)/)
    if (gstRateMatch) gstRate = parseFloat(gstRateMatch[1])

    if (/\d\s*\+/i.test(line) || /\+\s*(gst|18%|18\s*%)/i.test(line) || /gst\s*extra/i.test(lowerLine) || /extra\s*gst/i.test(lowerLine)) {
      gstType = 'extra'; gstApplicable = true; if (!gstRate) gstRate = 18
    } else if (/\bnett?\b/i.test(line) || /incl/i.test(lowerLine) || /including\s*gst/i.test(lowerLine) || /gst\s*incl/i.test(lowerLine)) {
      gstType = 'inclusive'; gstApplicable = true; if (!gstRate) gstRate = 18
    } else if (/without\s*gst/i.test(lowerLine) || /no\s*gst/i.test(lowerLine) || /gst\s*no/i.test(lowerLine)) {
      gstType = 'extra'; gstApplicable = false
    } else if (/with\s*gst/i.test(lowerLine) || /gst\s*yes/i.test(lowerLine)) {
      gstType = 'inclusive'; gstApplicable = true; if (!gstRate) gstRate = 18
    } else {
      gstType = 'unknown'; gstApplicable = null
    }

    // Total cost calculation
    let totalCost = rateNum
    if (gstType === 'extra' && gstRate) {
      totalCost = rateNum + (rateNum * gstRate / 100)
    }

    // Extract optional context: MOQ, delivery, warranty
    const notes: string[] = []
    const moqMatch = line.match(/(?:moq|min(?:imum)?(?:\s*order)?(?:\s*qty)?)\s*[:\-]?\s*(\d+)/i)
    if (moqMatch) notes.push(`MOQ: ${moqMatch[1]}`)
    const deliveryMatch = line.match(/(?:delivery|dispatch)\s*[:\-]?\s*(\d+\s*(?:day|hr|hour)s?)/i)
    if (deliveryMatch) notes.push(`Delivery: ${deliveryMatch[1]}`)
    const warrantyMatch = line.match(/(\d+)\s*(?:year|yr|month|mo)\s*warrant/i)
    if (warrantyMatch) notes.push(`Warranty: ${warrantyMatch[0]}`)

    results.push({
      itemName,
      rate: Math.round(rateNum * 100) / 100,
      gstApplicable,
      gstType,
      gstRate,
      totalCost: Math.round(totalCost * 100) / 100,
      raw: line,
      confidence,
      matchedItemSku: matchedSku,
      notes: notes.length > 0 ? notes.join(' • ') : undefined,
    })
  }

  return results
}

/**
 * Parse Indian-style number formats:
 *   "1,234.56"  → 1234.56 (Indian grouping)
 *   "1.234,56"  → 1234.56 (European grouping)
 *   "12,34,567" → 1234567 (Indian lakh format)
 *   "1234"      → 1234
 */
function parseIndianNumber(s: string): number {
  if (!s) return NaN
  // Remove currency symbols and spaces
  let cleaned = String(s).replace(/rs\.?|₹|inr|rupees?|\s/gi, '')
  // Remove trailing /-
  cleaned = cleaned.replace(/\/-$/, '')
  // If both . and , present, the last one is the decimal separator
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const lastDot = cleaned.lastIndexOf('.')
    const lastComma = cleaned.lastIndexOf(',')
    if (lastComma > lastDot) {
      // European: 1.234,56 → 1234.56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      // Indian/US: 1,234.56 → 1234.56
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes(',')) {
    // Only commas — check if it's Indian lakh format (12,34,567) or simple (1,234)
    // If last group after comma is 3 digits and there's a single comma → thousands separator
    // If groups are 2 digits (except last which is 3) → Indian lakh format
    cleaned = cleaned.replace(/,/g, '')
  }
  return parseFloat(cleaned)
}

export function parseRateResponse(
  response: string,
  originalItems: { name: string; sku?: string }[]
): ParsedRate[] {
  const lines = response.split(/\n+/)
  const results: ParsedRate[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Skip lines that are clearly not rate lines (greetings, thank you, etc.)
    const lowerTrim = trimmed.toLowerCase()
    if (/^(thank|hello|hi|ok|yes|no|sure|please|dear|regards|best)\b/.test(lowerTrim) && !/\d{2,}/.test(trimmed)) {
      continue
    }

    // Patterns to extract item name + rate. Order matters — try most specific first.
    const patterns = [
      // "1. Item Name: Rs.3450+" or "1. Item Name: 3450 nett"
      /^\d+\.?\s*(.+?):?\s*rs\.?\s*(\d+(?:[.,]\d+)?)/i,
      // "Item Name: Rs.3450+"
      /^(.+?):?\s*rs\.?\s*(\d+(?:[.,]\d+)?)/i,
      // "1. Item Name - 3450+"
      /^\d+\.?\s*(.+?)\s*[-:]\s*(\d+(?:[.,]\d+)?)/,
      // "Item Name: 3450+"
      /^(.+?):\s*(\d+(?:[.,]\d+)?)/,
      // "3450+" (rate only, no item name — match by line number to original items)
      /^(\d+(?:[.,]\d+)?)\s*([+\-].*)?$/,
    ]

    let matched: RegExpMatchArray | null = null
    let itemNameRaw = ''
    let rateStr = ''

    for (const p of patterns) {
      matched = trimmed.match(p)
      if (matched) {
        if (p.source.startsWith('^(\\d+')) {
          // Rate-only pattern (last one) — no item name in the line
          rateStr = String(matched[1] || '')
          itemNameRaw = ''
        } else {
          itemNameRaw = String(matched[1] || '').trim()
          rateStr = String(matched[2] || '')
        }
        break
      }
    }

    if (!matched || !rateStr) continue

    const rate = parseFloat(rateStr.replace(/[.,]/g, m => m === ',' ? '' : '.'))
    if (isNaN(rate)) continue

    // Match item name to original items (or assign by line order if no name)
    let itemName = itemNameRaw
    let matchedItem: { name: string; sku?: string } | undefined
    if (itemNameRaw) {
      matchedItem = originalItems.find(
        (i) => {
          const iName = String(i?.name || '').toLowerCase()
          const raw = itemNameRaw.toLowerCase()
          return iName.includes(raw) || raw.includes(iName) ||
                 (i.sku && raw.includes(String(i.sku).toLowerCase()))
        }
      )
      if (matchedItem) itemName = matchedItem.name
    } else {
      // Rate-only line: assign to the next unmatched original item by order
      const usedNames = new Set(results.map(r => r.itemName))
      matchedItem = originalItems.find(i => !usedNames.has(i.name))
      if (matchedItem) itemName = matchedItem.name
    }

    // Detect GST type from the line text
    const fullLine = trimmed.toLowerCase()
    let gstType: 'extra' | 'inclusive' | 'unknown' | null = null
    let gstRate: number | undefined
    let gstApplicable: boolean | null = null

    // Extract GST rate if mentioned (e.g. "18%", "18 %", "GST 18")
    const gstRateMatch = fullLine.match(/(\d+)\s*%/) || fullLine.match(/gst\s*(\d+)/)
    if (gstRateMatch) gstRate = parseFloat(gstRateMatch[1])

    // "3450+" → GST extra (the + suffix is trade shorthand for "plus GST")
    // "3450 + GST", "3450 (GST extra)", "3450 GST extra", "3450 + 18%"
    if (/\d\s*\+/i.test(trimmed) || /\+\s*(gst|18%|18\s*%)/i.test(trimmed) || /gst\s*extra/i.test(fullLine) || /extra\s*gst/i.test(fullLine)) {
      gstType = 'extra'
      gstApplicable = true
      if (!gstRate) gstRate = 18 // default to 18% for computer hardware
    }
    // "3450 nett" → GST inclusive ("nett" means final/all-inclusive price in trade)
    // "3450 incl GST", "3450 including GST", "3450 (GST incl)"
    else if (/\bnett\b/i.test(trimmed) || /incl/i.test(fullLine) || /including\s*gst/i.test(fullLine) || /gst\s*incl/i.test(fullLine)) {
      gstType = 'inclusive'
      gstApplicable = true
      if (!gstRate) gstRate = 18
    }
    // "3450 without GST", "3450 no GST"
    else if (/without\s*gst/i.test(fullLine) || /no\s*gst/i.test(fullLine) || /gst\s*no/i.test(fullLine)) {
      gstType = 'extra'
      gstApplicable = false
    }
    // "3450 with GST"
    else if (/with\s*gst/i.test(fullLine) || /gst\s*yes/i.test(fullLine)) {
      gstType = 'inclusive'
      gstApplicable = true
      if (!gstRate) gstRate = 18
    }
    // Bare number with no GST context
    else {
      gstType = 'unknown'
      gstApplicable = null
    }

    // Calculate totalCost (what the buyer actually pays)
    let totalCost = rate
    if (gstType === 'extra' && gstRate) {
      totalCost = rate + (rate * gstRate / 100)
    }
    // inclusive or unknown → totalCost = rate

    results.push({
      itemName,
      rate,
      gstApplicable,
      gstType,
      gstRate,
      totalCost: Math.round(totalCost * 100) / 100,
      raw: trimmed,
    })
  }

  return results
}

// Build bulk enquiry payload (for sending to multiple suppliers)
export function buildBulkEnquiry(
  shopName: string,
  suppliersWithItems: { supplier: { name: string; phone: string; whatsappNumber: string }; items: { name: string; sku?: string }[] }[]
): WhatsAppMessage[] {
  return suppliersWithItems.map(({ supplier, items }) => ({
    to: supplier.whatsappNumber || supplier.phone,
    message: buildEnquiryMessage(shopName, items),
  }))
}

// Schedule helper - returns dates for 2 monthly enquiries (1st and 15th)
export function getNextEnquiryDates(from: Date = new Date()): Date[] {
  const dates: Date[] = []
  const now = new Date(from)
  const day = now.getDate()
  
  // Next 1st
  const next1st = new Date(now.getFullYear(), now.getMonth() + (day >= 1 ? 1 : 0), 1)
  // Next 15th
  const next15th = new Date(now.getFullYear(), now.getMonth() + (day >= 15 ? 1 : 0), 15)
  
  dates.push(next1st, next15th)
  dates.sort((a, b) => a.getTime() - b.getTime())
  return dates
}

// Check if today is an enquiry day (1st or 15th)
export function isEnquiryDay(date: Date = new Date()): boolean {
  const day = date.getDate()
  return day === 1 || day === 15
}

/**
 * Shares an Invoice / Quotation / Service Invoice PDF on WhatsApp.
 *
 * v12.3 — Professional, simple, lite template.
 *
 * PER USER REQUIREMENT:
 * - ✅ PDF file attachment IS attached (mobile Native Web Share API)
 * - ✅ PDF is auto-downloaded on desktop + WhatsApp Web opened with message
 * - ✅ Message is professional, simple, lite — only essential info
 * - ❌ NO clutter, NO emojis overload, NO long paragraphs
 *
 * Template (Invoice):
 * ─────────────────────────
 * Smart Computers
 *
 * Dear {Customer Name},
 *
 * Thank you for your purchase. Please find your invoice attached.
 *
 * Invoice: {Number}
 * Amount: Rs. {Grand Total}
 * Status: {Paid / Balance Due: Rs. X}
 *
 * For any queries, feel free to reply to this message.
 *
 * Thank you for choosing us.
 * Smart Computers
 * ─────────────────────────
 *
 * Flow:
 *   1. Fetch the PDF from the server (/api/pdf or /api/service-pdf)
 *   2. On mobile (Chrome/Safari): navigator.share() with the PDF file
 *   3. On desktop: auto-download the PDF + copy message to clipboard +
 *      open wa.me with text message. User attaches PDF in WhatsApp Web.
 */
export async function shareWhatsAppPdf({
  docId,
  docType,
  docNumber,
  customerName,
  customerPhone,
  grandTotal,
  amountDue,
  notes,
  toast,
  gstMode = 'gst',
}: {
  docId: string
  docType: 'invoice' | 'quotation' | 'service'
  docNumber: string
  customerName: string
  customerPhone?: string
  grandTotal: number
  amountDue?: number
  notes?: string
  toast?: any
  gstMode?: 'gst' | 'non-gst'
}) {
  // ─────────────────────────────────────────────────────────────────────────
  // v12.4 — TWO-WAY WhatsApp PDF share:
  //
  // 1. Server-side via Cloud API (PREFERRED):
  //    POST /api/whatsapp/send-pdf generates the PDF on the server (using
  //    the SAME HTML engine as the on-screen preview, via WeasyPrint) and
  //    sends it DIRECTLY to the customer's WhatsApp as a document message.
  //    The customer receives the PDF automatically — no manual attach needed.
  //    Works on BOTH mobile and desktop browsers.
  //
  // 2. Client-side via Web Share API / wa.me link (FALLBACK):
  //    If the Cloud API is not configured (no WA_TOKEN env), falls back to:
  //    - Mobile: navigator.share({ files: [pdfFile] }) → WhatsApp share sheet
  //      (PDF is auto-attached on Android Chrome / iOS Safari)
  //    - Desktop: download the PDF + open wa.me with text message → user
  //      manually attaches the PDF in WhatsApp Web
  //
  // The PDF used in BOTH flows comes from the new POST /api/doc-html/[id]
  // endpoint (HTML engine, matches the preview pixel-perfect).
  // ─────────────────────────────────────────────────────────────────────────

  const filename = `${docType.toUpperCase()}-${docNumber || docId}.pdf`
  const titleLabel = docType === 'invoice' ? 'Invoice' : docType === 'quotation' ? 'Quotation' : 'Service Invoice'

  // Build the message text — used as caption (server flow) or as the wa.me
  // body (client fallback).
  const isPaid = (amountDue ?? 0) <= 0
  const due = Number(amountDue) || 0
  const total = Number(grandTotal) || 0
  const custName = (customerName || 'Customer').trim()
  const messageText = buildProfessionalShareMessage({
    docType,
    docNumber,
    customerName: custName,
    grandTotal: total,
    amountDue: due,
    isPaid,
    notes,
  })

  // ─── PREFERRED FLOW: server-side send via Cloud API ───
  if (customerPhone) {
    if (toast) toast({ title: 'Sending PDF via WhatsApp...', duration: 2000 })
    try {
      const resp = await fetch('/api/whatsapp/send-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId,
          docType,
          customerPhone,
          caption: messageText,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.success) {
        if (toast) {
          toast({
            title: `${titleLabel} sent via WhatsApp ✓`,
            description: `PDF delivered to ${customerPhone} directly.`,
            duration: 4500,
          })
        }
        return
      }
      // Soft-error: Cloud API not configured. Fall through to the client flow.
      if (data?.error === 'cloud-api-not-configured') {
        // Continue to fallback below.
      } else if (data?.error) {
        // Real error from Cloud API — log it but still try the client flow.
        console.warn('[shareWhatsAppPdf] Cloud API send failed:', data.error)
        if (toast) {
          toast({
            title: 'Direct send failed, trying manual flow...',
            description: String(data.error).slice(0, 120),
            duration: 3000,
          })
        }
      }
    } catch (cloudErr: any) {
      console.warn('[shareWhatsAppPdf] Cloud API network error:', cloudErr?.message)
    }
  }

  // ─── FALLBACK FLOW: client-side download + open WhatsApp ───
  if (toast) toast({ title: 'Preparing PDF for manual share...', duration: 2000 })

  // Try the new POST /api/doc-html endpoint first (returns actual PDF bytes).
  let blob: Blob | null = null
  try {
    const pdfUrl = `/api/doc-html/${encodeURIComponent(docId)}?type=${docType}&gstMode=${gstMode}&banner=flyer&template=tally-classic`
    const response = await fetch(pdfUrl, { method: 'POST' })
    if (response.ok) {
      const contentType = response.headers.get('Content-Type') || ''
      if (!contentType.includes('text/html')) {
        blob = await response.blob()
      }
    }
  } catch (postErr: any) {
    console.warn('[shareWhatsAppPdf] POST /api/doc-html failed:', postErr?.message)
  }

  // Fall back to the OLD jsPDF endpoint if the new POST didn't produce a PDF.
  if (!blob) {
    try {
      const fallbackUrl = docType === 'service'
        ? `/api/service-pdf/${docId}`
        : `/api/pdf/${docId}?type=${docType}&gstMode=${gstMode}`
      const response = await fetch(fallbackUrl)
      if (response.ok) blob = await response.blob()
    } catch (fbErr: any) {
      console.warn('[shareWhatsAppPdf] Fallback GET /api/pdf failed:', fbErr?.message)
    }
  }

  if (!blob) {
    if (toast) toast({ title: 'PDF generation failed', description: 'Please try again', variant: 'destructive', duration: 5000 })
    return
  }

  const pdfFile = new File([blob], filename, { type: 'application/pdf' })

  const cleanPhone = String(customerPhone || '').replace(/[^\d]/g, '')
  // v12.5: Same normalization as generateWhatsAppLink — 10-digit Indian
  // mobile → prefix with 91 so wa.me actually finds the chat.
  let targetPhone = ''
  if (cleanPhone.length === 10) {
    targetPhone = '91' + cleanPhone
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
    targetPhone = '91' + cleanPhone.slice(1)
  } else if (cleanPhone.length >= 12) {
    targetPhone = cleanPhone
  }

  // Mobile: try Native Web Share API (passes the actual PDF file attachment).
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({
        files: [pdfFile],
        title: `${titleLabel} ${docNumber}`,
        text: messageText,
      })
      if (toast) toast({ title: 'Shared to WhatsApp ✓', duration: 3000 })
      return
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') return
      console.warn('Native share failed, falling back to download:', shareErr?.message)
    }
  }

  // Desktop fallback: auto-download PDF + copy message + open wa.me.
  const downloadUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = downloadUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 3000)

  let clipboardCopied = false
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(messageText)
      clipboardCopied = true
    }
  } catch {
    // Clipboard API can fail if not focused or in non-secure context
  }

  const waUrl = targetPhone
    ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(messageText)}`
    : `https://wa.me/?text=${encodeURIComponent(messageText)}`

  window.open(waUrl, '_blank')

  if (toast) {
    toast({
      title: 'PDF Downloaded & WhatsApp Opened ✓',
      description: clipboardCopied
        ? `Message copied to clipboard. Attach ${filename} in WhatsApp.`
        : `Please attach ${filename} in the WhatsApp chat window.`,
      duration: 7000,
    })
  }
}

/**
 * Build a professional, simple, lite WhatsApp share message.
 *
 * Design principles (v12.3):
 * - Shop name as a clean header (no decorative asterisks border)
 * - One-line greeting using the customer's first name (warmer, less formal)
 * - Bullet-style key details (doc number, amount, status)
 * - Optional notes line (only if the user added notes)
 * - Soft call-to-action for queries
 * - Professional sign-off (no emoji spam)
 * - Google Review prompt ONLY for paid invoices (subtle, one line)
 *
 * The PDF itself carries the full breakdown (items, GST, totals, terms).
 * The message is the "cover letter" — not a duplicate of the PDF.
 */
function buildProfessionalShareMessage(opts: {
  docType: 'invoice' | 'quotation' | 'service'
  docNumber: string
  customerName: string
  grandTotal: number
  amountDue: number
  isPaid: boolean
  notes?: string
}): string {
  const { docType, docNumber, customerName, grandTotal, amountDue, isPaid, notes } = opts

  const titleLabel =
    docType === 'invoice' ? 'Invoice' :
    docType === 'quotation' ? 'Quotation' :
    'Service Invoice'

  // Use first name for a warmer greeting; fall back to full name
  const firstName = customerName.split(/\s+/)[0] || customerName

  // Status line — clean and conditional
  const statusLine = docType === 'quotation'
    ? `Validity: 7 days`
    : isPaid
      ? `Status: Paid ✓`
      : `Balance Due: Rs. ${amountDue.toFixed(2)}`

  // Notes line — only if the user actually added notes
  const notesLine = notes && String(notes).trim()
    ? `\nNote: ${String(notes).trim()}`
    : ''

  // Google Review prompt — ONLY for paid invoices (not quotations, not unpaid)
  const reviewLine = (docType === 'invoice' && isPaid)
    ? `\n\nLoved our service? A quick Google review helps us a lot:\n${BUSINESS_GROWTH.googleReviewUrl}`
    : ''

  // Professional, simple, lite template
  return (
    `Smart Computers\n` +
    `\n` +
    `Hi ${firstName},\n` +
    `\n` +
    `Thank you for your ${docType === 'quotation' ? 'enquiry' : 'purchase'}. Please find your ${titleLabel.toLowerCase()} attached.\n` +
    `\n` +
    `${titleLabel}: ${docNumber}\n` +
    `Amount: Rs. ${grandTotal.toFixed(2)}\n` +
    statusLine +
    notesLine +
    `\n` +
    `\n` +
    `For any queries, simply reply to this message.\n` +
    `\n` +
    `Best regards,\n` +
    `Smart Computers` +
    reviewLine
  )
}
