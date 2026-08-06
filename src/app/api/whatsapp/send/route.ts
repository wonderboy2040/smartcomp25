import { NextRequest, NextResponse } from 'next/server'
import { getRow, listRows, isConfigured } from '@/lib/sheets-client'
import { generateWhatsAppLink, buildInvoiceShareMessage, buildPaymentReminderMessage } from '@/lib/whatsapp'


export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }

    // Get shop (listRows returns array; take first). Defensive name coercion.
    const shopRows = await listRows<any>('Shop', { useCache: true })
    const shop = shopRows[0] || { name: 'Smart Computers' }
    const shopName = String(shop?.name || 'Smart Computers')

    if (action === 'shareInvoice' || action === 'shareQuotation') {
      const { id } = body
      const docType = action === 'shareInvoice' ? 'invoice' : 'quotation'
      const sheet = docType === 'invoice' ? 'Invoices' : 'Quotations'
      const record = await getRow<any>(sheet, id)
      if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const phone = String(record.customerPhone || '')
      if (!phone) return NextResponse.json({ error: 'Customer has no phone' }, { status: 400 })

      const message = buildInvoiceShareMessage(
        shopName,
        String(record.customerName || ''),
        docType,
        String(record.number || ''),
        Number(record.grandTotal) || 0,
        docType === 'quotation' && record.validTill ? new Date(record.validTill) : undefined
      )
      const link = generateWhatsAppLink(phone, message)

      return NextResponse.json({ success: true, link, message, phone })
    }

    if (action === 'paymentReminder') {
      const { invoiceId } = body
      const invoice = await getRow<any>('Invoices', invoiceId)
      if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const phone = String(invoice.customerPhone || '')
      if (!phone) return NextResponse.json({ error: 'Customer has no phone' }, { status: 400 })

      const message = buildPaymentReminderMessage(
        shopName,
        String(invoice.customerName || ''),
        String(invoice.number || ''),
        Number(invoice.amountDue) || 0
      )
      const link = generateWhatsAppLink(phone, message)

      return NextResponse.json({ success: true, link, message, phone })
    }

    if (action === 'customMessage') {
      const { phone, message } = body
      if (!phone || !message) return NextResponse.json({ error: 'Phone and message required' }, { status: 400 })
      const link = generateWhatsAppLink(String(phone), String(message))
      return NextResponse.json({ success: true, link })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
