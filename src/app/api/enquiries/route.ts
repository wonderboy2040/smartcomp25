import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow } from '@/lib/sheets-client'

import { buildEnquiryMessage, generateWhatsAppLink } from '@/lib/whatsapp'
import { isCloudApiConfigured, sendTemplateMessage, sendTextMessage, normalizePhone } from '@/lib/whatsapp-cloud'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const supplierId = url.searchParams.get('supplierId')
    const status = url.searchParams.get('status')

    // PERFORMANCE: Load enquiries and suppliers in parallel
    const [allEnquiries, suppliers] = await Promise.all([
      listRows<any>('Enquiries'),
      listRows<any>('Suppliers', { useCache: true }),
    ])
    
    let enquiries = allEnquiries
    if (supplierId) enquiries = enquiries.filter((e) => e.supplierId === supplierId)
    if (status) enquiries = enquiries.filter((e) => e.status === status)

    enquiries.sort((a, b) => new Date(b.sentAt || b.createdAt).getTime() - new Date(a.sentAt || a.createdAt).getTime())
    enquiries = enquiries.slice(0, 200)

    const supplierMap = new Map(suppliers.map((s) => [s.id, s]))

    const result = enquiries.map((e) => ({
      ...e,
      appliedToItems: e.appliedToItems === true || e.appliedToItems === 'true',
      isAuto: e.isAuto === true || e.isAuto === 'true',
      // Always provide a non-null supplier object so the UI never crashes on .name/.phone
      supplier: supplierMap.get(e.supplierId) || {
        id: String(e.supplierId || ''),
        name: String(e.supplierName || 'Unknown Supplier'),
        phone: String(e.supplierPhone || ''),
        whatsappNumber: String(e.supplierPhone || ''),
      },
      // Defensive string coercion for status (Sheets may return number/blank)
      status: String(e.status || 'sent'),
      itemsJson: String(e.itemsJson || '[]'),
      message: String(e.message || ''),
      response: String(e.response || ''),
      ratesJson: String(e.ratesJson || '[]'),
    }))

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited — too many writes, wait a moment' }, { status: 429 })

    const body = await req.json()
    const { supplierIds, itemIds, allItems = false, isAuto = false } = body

    if (!Array.isArray(supplierIds) || supplierIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one supplier' }, { status: 400 })
    }

    // Get shop (listRows returns array; take first)
    const shopRows = await listRows<any>('Shop', { useCache: true })
    const shop = shopRows[0] || { name: 'Smart Computers' }

    // Get items
    let items: any[] = []
    if (allItems) {
      items = await listRows<any>('Items')
    } else if (Array.isArray(itemIds) && itemIds.length > 0) {
      const allItemsList = await listRows<any>('Items')
      items = allItemsList.filter((i) => itemIds.includes(i.id))
    } else {
      return NextResponse.json({ error: 'Select items or choose all items' }, { status: 400 })
    }

    if (items.length === 0) return NextResponse.json({ error: 'No items to enquire' }, { status: 400 })

    // Get suppliers
    const allSuppliers = await listRows<any>('Suppliers')
    const suppliers = allSuppliers.filter((s) => supplierIds.includes(s.id))

    const results: any[] = []
    const cloudApiOn = isCloudApiConfigured()
    const itemsListText = items.map((i, idx) => `${idx + 1}. ${String(i?.name || '')}${i?.sku ? ` (SKU: ${i.sku})` : ''}`).join('\n')

    for (const supplier of suppliers) {
      // Defensive: phone may be stored as number in Sheets. Coerce to string.
      const rawPhone = supplier.whatsappNumber || supplier.phone || ''
      const phone = String(rawPhone)
      const supplierName = String(supplier.name || 'Unknown Supplier')
      const message = buildEnquiryMessage(
        String(shop?.name || 'Smart Computers'),
        items.map((i) => ({ name: String(i?.name || ''), sku: String(i?.sku || '') }))
      )
      const link = generateWhatsAppLink(phone, message)

      const enquiry = await createRow('Enquiries', {
        supplierId: String(supplier.id || ''),
        supplierName,
        supplierPhone: phone,
        itemsJson: JSON.stringify(items.map((i) => ({ id: String(i?.id || ''), name: String(i?.name || ''), sku: String(i?.sku || '') }))),
        message,
        status: 'sent',
        sentAt: new Date().toISOString(),
        respondedAt: '',
        response: '',
        ratesJson: '[]',
        appliedToItems: false,
        isAuto,
      })

      let autoSent = false
      let sendStatus: 'sent' | 'failed' | 'skipped' = 'skipped'
      let sendError: string | undefined

      if (cloudApiOn) {
        // Auto-send via WhatsApp Cloud API.
        // Strategy: try template message first (works outside 24h window).
        // If that fails, fall back to free-text (works if supplier messaged in last 24h).
        const normalized = normalizePhone(phone)
        if (!normalized) {
          sendStatus = 'failed'
          sendError = 'Invalid phone number'
        } else {
          const tmpl = await sendTemplateMessage(phone, supplierName, itemsListText)
          if (tmpl.success) {
            autoSent = true
            sendStatus = 'sent'
          } else {
            // Try free-text as fallback (in case template isn't approved yet, or 24h window is open)
            const txt = await sendTextMessage(phone, message)
            if (txt.success) {
              autoSent = true
              sendStatus = 'sent'
            } else {
              sendStatus = 'failed'
              sendError = tmpl.error || txt.error || 'Send failed'
            }
          }
        }
      }

      results.push({
        enquiryId: enquiry.id,
        supplierId: String(supplier.id || ''),
        supplierName,
        phone,
        whatsappLink: link, // always include as fallback view
        message,
        autoSent,
        sendStatus,
        sendError,
      })
    }

    return NextResponse.json({ success: true, results, cloudApiOn })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
