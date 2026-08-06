import { NextRequest, NextResponse } from 'next/server'
import { listRows, updateRow, createRow } from '@/lib/sheets-client'
import { parseChatExport, matchEnquiryBySupplierName } from '@/lib/chat-parser'

/**
 * POST /api/whatsapp/import-chat
 *
 * Accepts a WhatsApp chat export (.txt file content) and:
 *   1. Parses the export to extract supplier messages
 *   2. Matches to an existing open enquiry by supplier name
 *   3. Parses rates from the supplier's replies
 *   4. Updates the enquiry (or creates a new one if no match found)
 *
 * Body: { content: string (file contents), enquiryId?: string (optional explicit match) }
 * Returns: { success, parsed, matchedEnquiry, action: 'updated' | 'created' }
 *
 * DATA PROTECTION: this endpoint only reads + creates + updates (soft). Never deletes.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const content = String(body?.content || '')
    const explicitEnquiryId = body?.enquiryId ? String(body.enquiryId) : null

    if (!content || content.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'Chat export content is empty or too short' },
        { status: 400 }
      )
    }

    // Load enquiries to match against
    const enquiries = await listRows<any>('Enquiries')

    // Determine original items for rate parsing
    let originalItems: any[] = []
    let matchedEnquiry: any = null

    if (explicitEnquiryId) {
      matchedEnquiry = enquiries.find((e) => String(e.id) === explicitEnquiryId) || null
    } else {
      // First parse without items to get supplier name, then re-parse with matched enquiry's items
      const initial = parseChatExport(content, [])
      matchedEnquiry = matchEnquiryBySupplierName(initial.supplierName, enquiries)
    }

    if (matchedEnquiry) {
      try {
        originalItems = JSON.parse(String(matchedEnquiry.itemsJson || '[]'))
      } catch {
        originalItems = []
      }
    }

    const parsed = parseChatExport(content, originalItems)

    if (!parsed.supplierName && !matchedEnquiry) {
      return NextResponse.json({
        success: false,
        error: 'Could not identify supplier from chat export. Please specify which enquiry to attach this to.',
        parsed,
      }, { status: 400 })
    }

    let action: 'updated' | 'created' = 'updated'
    let enquiryId: string | null = null
    let supplierId = ''
    let supplierName = parsed.supplierName || ''
    let supplierPhone = ''

    if (matchedEnquiry) {
      // Update existing enquiry
      enquiryId = String(matchedEnquiry.id)
      supplierId = String(matchedEnquiry.supplierId || '')
      supplierName = String(matchedEnquiry.supplierName || supplierName)
      supplierPhone = String(matchedEnquiry.supplierPhone || '')

      await updateRow('Enquiries', enquiryId, {
        status: 'responded',
        respondedAt: new Date().toISOString(),
        response: parsed.responseText,
        ratesJson: JSON.stringify(parsed.parsedRates),
      })
    } else {
      // Create a new enquiry record (no matching open enquiry)
      // Try to find supplier by name in Suppliers sheet
      const suppliers = await listRows<any>('Suppliers', { useCache: true })
      const supplier = suppliers.find(
        (s) => String(s.name || '').toLowerCase() === supplierName.toLowerCase()
      )
      if (supplier) {
        supplierId = String(supplier.id)
        supplierPhone = String(supplier.whatsappNumber || supplier.phone || '')
      }

      const created = await createRow('Enquiries', {
        supplierId,
        supplierName,
        supplierPhone,
        itemsJson: '[]',
        message: '(imported from chat export)',
        status: 'responded',
        sentAt: parsed.dateRange.start || new Date().toISOString(),
        respondedAt: new Date().toISOString(),
        response: parsed.responseText,
        ratesJson: JSON.stringify(parsed.parsedRates),
        appliedToItems: false,
        isAuto: false,
      })
      enquiryId = String(created.id || '')
      action = 'created'
    }

    return NextResponse.json({
      success: true,
      action,
      enquiryId,
      matchedEnquiry: matchedEnquiry
        ? { id: matchedEnquiry.id, supplierName: matchedEnquiry.supplierName, sentAt: matchedEnquiry.sentAt }
        : null,
      parsed: {
        supplierName: parsed.supplierName,
        messageCount: parsed.messageCount,
        dateRange: parsed.dateRange,
        parsedRates: parsed.parsedRates,
        responsePreview: parsed.responseText.slice(0, 500),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 })
  }
}
