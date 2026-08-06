import { NextRequest, NextResponse } from 'next/server'
import { getRow, listRows, updateRow } from '@/lib/sheets-client'
import { safeTokenCompare } from '@/lib/share-tokens'

/**
 * POST /api/track/pay
 *
 * Public endpoint — creates a Razorpay payment link or UPI deep link
 * for a customer to pay their invoice amount due.
 *
 * Body: { invoiceId: string, token: string }
 * 
 * Validates the share token before creating payment link.
 * Reuses existing Razorpay/UPI logic.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { invoiceId, token } = body
    if (!invoiceId || !token) {
      return NextResponse.json({ error: 'Invoice ID and token required' }, { status: 400 })
    }

    // Find invoice
    const invoice = await getRow<any>('Invoices', String(invoiceId))
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Validate share token
    const storedToken = String(invoice.shareToken || '')
    if (!storedToken || !safeTokenCompare(token, storedToken)) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 403 })
    }

    const amountDue = Number(invoice.amountDue) || 0
    if (amountDue <= 0) {
      return NextResponse.json({ error: 'No amount due — invoice is already paid' }, { status: 400 })
    }

    // Get shop info
    const shopRows = await listRows<any>('Shop', { useCache: true })
    const shop = shopRows[0] || {}

    const KEY_ID = process.env.RAZORPAY_KEY_ID
    const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET

    // If Razorpay not configured, try UPI fallback
    if (!KEY_ID || !KEY_SECRET) {
      if (shop.upiId) {
        const upiLink = `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(shop.name || 'Smart Computers')}&am=${amountDue.toFixed(2)}&cu=INR&tn=${encodeURIComponent(invoice.number || '')}`
        return NextResponse.json({
          success: true,
          method: 'upi',
          shortUrl: upiLink,
          amount: amountDue,
          invoiceNumber: String(invoice.number || ''),
        })
      }
      return NextResponse.json(
        { error: 'Online payment not configured. Please pay at the shop.' },
        { status: 400 }
      )
    }

    // Create Razorpay payment link
    const amountPaise = Math.round(amountDue * 100)
    const authHeader = 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')

    const rpRes = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        accept_partial: false,
        description: `Payment for Invoice ${invoice.number}`,
        customer: {
          name: String(invoice.customerName || 'Customer'),
          contact: String(invoice.customerPhone || ''),
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
      // Fallback to UPI
      if (shop.upiId) {
        const upiLink = `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(shop.name || 'Smart Computers')}&am=${amountDue.toFixed(2)}&cu=INR&tn=${encodeURIComponent(invoice.number || '')}`
        return NextResponse.json({
          success: true,
          method: 'upi',
          shortUrl: upiLink,
          amount: amountDue,
          invoiceNumber: String(invoice.number || ''),
        })
      }
      return NextResponse.json(
        { error: rpData?.error?.description || 'Payment link creation failed' },
        { status: 500 }
      )
    }

    // Store payment link reference on invoice
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
