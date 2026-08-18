import { NextRequest, NextResponse } from 'next/server'
import { getRow, listRows, updateRow } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * Normalize an Indian phone number to E.164 format (10 digits → 91XXXXXXXXXX)
 * as required by Razorpay's `customer.contact` field. Without this, Razorpay
 * rejects the request with 400 "The contact parameter does not match the
 * format 919999999999" and the customer sees "Payment link creation failed".
 */
function toE164IndianPhone(raw: string): string {
  let digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 12 && digits.startsWith('91')) return digits
  if (digits.length === 10) return '91' + digits
  // Already 12+ digits starting with 91, or any unknown length — best-effort return.
  return digits
}

/**
 * POST /api/portal/pay — Customer Self-Service payment
 * Body: { invoiceId: string, phone: string }
 *
 * Creates a Razorpay payment link (or UPI deep-link fallback) for the
 * invoice's due amount. The phone number must match the invoice's customer
 * phone — the same guard the tracking page uses with its token, but keyed on
 * the phone the customer verifies the portal with.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited — try again in a moment' }, { status: 429 })

    const body = await req.json().catch(() => null)
    const invoiceId = String(body?.invoiceId || '')
    let phone = String(body?.phone || '').replace(/\D/g, '')
    if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2)
    if (phone.length === 11 && phone.startsWith('0')) phone = phone.slice(1)

    if (!invoiceId || phone.length !== 10) {
      return NextResponse.json({ error: 'Invoice ID and valid 10-digit phone required' }, { status: 400 })
    }

    const invoice = await getRow<any>('Invoices', invoiceId)
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const invoicePhone = String(invoice.customerPhone || '').replace(/\D/g, '')
    const normalizedInvoicePhone = invoicePhone.length === 12 && invoicePhone.startsWith('91') ? invoicePhone.slice(2) : invoicePhone
    if (normalizedInvoicePhone !== phone) {
      return NextResponse.json({ error: 'This invoice does not belong to this phone number' }, { status: 403 })
    }

    const amountDue = Number(invoice.amountDue) || 0
    if (amountDue <= 0) {
      return NextResponse.json({ error: 'No amount due — invoice is already paid' }, { status: 400 })
    }

    const shopRows = await listRows<any>('Shop', { useCache: true })
    const shop = shopRows[0] || {}
    const KEY_ID = process.env.RAZORPAY_KEY_ID
    const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET

    const buildUpiFallback = () =>
      `upi://pay?pa=${encodeURIComponent(shop.upiId || '')}&pn=${encodeURIComponent(shop.name || 'Smart Computers')}&am=${amountDue.toFixed(2)}&cu=INR&tn=${encodeURIComponent(invoice.number || '')}`

    // If Razorpay not configured, try UPI fallback
    if (!KEY_ID || !KEY_SECRET) {
      if (shop.upiId) {
        return NextResponse.json({ success: true, method: 'upi', shortUrl: buildUpiFallback(), amount: amountDue, invoiceNumber: String(invoice.number || '') })
      }
      return NextResponse.json({ error: 'Online payment not configured. Please pay at the shop.' }, { status: 400 })
    }

    // Create Razorpay payment link
    const amountPaise = Math.round(amountDue * 100)
    const authHeader = 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')

    const rpRes = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        accept_partial: false,
        description: `Payment for Invoice ${invoice.number}`,
        customer: {
          name: String(invoice.customerName || 'Customer'),
          contact: toE164IndianPhone(String(invoice.customerPhone || '')),
        },
        notify: { sms: true, email: false },
        reminder_enable: true,
        notes: {
          invoice_id: String(invoice.id || ''),
          invoice_number: String(invoice.number || ''),
          source: 'customer_portal',
        },
        callback_url: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/razorpay/webhook`,
        callback_method: 'get',
      }),
    })

    const rpData = await rpRes.json()
    if (!rpRes.ok) {
      if (shop.upiId) {
        return NextResponse.json({ success: true, method: 'upi', shortUrl: buildUpiFallback(), amount: amountDue, invoiceNumber: String(invoice.number || '') })
      }
      return NextResponse.json({ error: rpData?.error?.description || 'Payment link creation failed' }, { status: 500 })
    }

    await updateRow('Invoices', String(invoice.id), {
      notes: String(invoice.notes || '') + `\n[Customer Payment Link: ${rpData.id}]`,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      method: 'razorpay',
      shortUrl: rpData.short_url,
      paymentLinkId: rpData.id,
      amount: amountDue,
      invoiceNumber: String(invoice.number || ''),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Payment failed' }, { status: 500 })
  }
}