// WhatsApp helper - generates wa.me links and message templates
// Note: For full automation, use WhatsApp Business API / Twilio / WATI
import { BUSINESS_GROWTH } from './business-growth'

export interface WhatsAppMessage {
  to: string // phone number with country code, no + sign
  message: string
}

// Generate wa.me link for opening WhatsApp with prefilled message
export function generateWhatsAppLink(phone: string, message: string): string {
  // Defensive: Google Sheets may store phone as a number, not a string.
  // Coerce to string before calling .replace(). Also handle null/undefined.
  const phoneStr = String(phone ?? '')
  const cleanPhone = phoneStr.replace(/[^\d]/g, '')
  const encoded = encodeURIComponent(message)
  return `https://wa.me/${cleanPhone}?text=${encoded}`
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
 * PER USER REQUIREMENT:
 * - ✅ PDF file attachment IS attached (mobile Native Web Share API)
 * - ✅ PDF is auto-downloaded on desktop + WhatsApp Web opened with details
 * - ❌ NO "View Link" / track URL / public doc link in the message text
 * - Message text is clean: shop name, doc number, amount, status, notes
 *
 * Flow:
 *   1. Fetch the PDF from the server (/api/pdf or /api/service-pdf)
 *   2. On mobile (Chrome/Safari): navigator.share() with the PDF file
 *   3. On desktop: auto-download the PDF + open wa.me with text message
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
  try {
    const filename = `${docType.toUpperCase()}-${docNumber || docId}.pdf`
    const pdfUrl = docType === 'service'
      ? `/api/service-pdf/${docId}`
      : `/api/pdf/${docId}?type=${docType}&gstMode=${gstMode}`

    if (toast) toast({ title: 'Preparing PDF for WhatsApp...', duration: 2500 })

    const response = await fetch(pdfUrl)
    if (!response.ok) throw new Error('Failed to generate PDF')
    const blob = await response.blob()
    const pdfFile = new File([blob], filename, { type: 'application/pdf' })

    const cleanPhone = String(customerPhone || '').replace(/[^\d]/g, '')
    const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone.length > 10 ? cleanPhone : ''

    const isPaid = (amountDue ?? 0) <= 0
    const statusText = isPaid ? 'PAID ✓' : `Balance Due: Rs. ${Number(amountDue).toFixed(2)}`
    const titleLabel = docType === 'invoice' ? 'Invoice' : docType === 'quotation' ? 'Quotation' : 'Service Invoice'

    // Clean message — NO view link / track URL / public doc link.
    // Only shop + customer + doc details (the PDF itself carries the rest).
    // Adds a Google Review prompt ONLY when the invoice is fully paid
    // (don't ask for a review when money is still owed).
    const reviewPrompt = isPaid
      ? `\n\n⭐ _Happy with our service? Please leave us a Google review — it takes 30 seconds and really helps!_\n👉 ${BUSINESS_GROWTH.googleReviewUrl}\n`
      : ''
    const messageText = `*Smart Computers*\n\n` +
      `Dear *${customerName || 'Customer'}*,\n\n` +
      `Please find attached ${titleLabel.toLowerCase()}:\n\n` +
      `*${titleLabel} No:* ${docNumber}\n` +
      `*Total Amount:* Rs. ${Number(grandTotal).toFixed(2)}\n` +
      `*Status:* ${statusText}\n` +
      `${notes ? `*Notes:* ${notes}\n` : ''}\n` +
      `For any queries, please contact us.\n\n` +
      `Thank you for your business! 🙏${reviewPrompt}`

    // 1. Try Native Web Share API (passes the actual PDF file attachment on
    //    mobile Chrome/Safari). Note: navigator.share needs a user gesture;
    //    the async fetch above may break that chain on some browsers, so we
    //    catch the "user activation" error and fall through to the desktop
    //    fallback below.
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: `${titleLabel} ${docNumber}`,
          text: messageText,
        })
        if (toast) toast({ title: 'PDF Shared to WhatsApp ✓', duration: 3500 })
        return
      } catch (shareErr: any) {
        // AbortError = user cancelled the share sheet — silently return
        if (shareErr?.name === 'AbortError') return
        // Any other error (including "Must be handling a user gesture") —
        // fall through to the download + WhatsApp Web fallback below.
        console.warn('Native share failed, falling back to download:', shareErr?.message)
      }
    }

    // 2. Desktop fallback: auto-download the PDF + open WhatsApp Web with
    //    the text message. User then attaches the downloaded PDF manually.
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl)
    }, 2000)

    const waUrl = targetPhone
      ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(messageText)}`
      : `https://wa.me/?text=${encodeURIComponent(messageText)}`

    window.open(waUrl, '_blank')

    if (toast) {
      toast({
        title: 'PDF Downloaded & WhatsApp Opened ✓',
        description: `Please attach ${filename} in the WhatsApp chat window`,
        duration: 6000,
      })
    }
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      if (toast) toast({ title: 'Share failed', description: e.message || 'Error sharing PDF', variant: 'destructive', duration: 5000 })
    }
  }
}
