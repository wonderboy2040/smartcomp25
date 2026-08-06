import { NextRequest, NextResponse } from 'next/server'
import { getRow, listRows, updateRow } from '@/lib/sheets-client'

/**
 * POST /api/razorpay/create-link
 * Body: { invoiceId: "xxx" }
 *
 * Creates a Razorpay payment link for the invoice's due amount.
 * Returns: { success, shortUrl, paymentLinkId, amount }
 *
 * Requires env vars:
 *   RAZORPAY_KEY_ID
 *   RAZORPAY_KEY_SECRET
 *
 * If not configured, returns a UPI deep link as fallback (no Razorpay needed).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { invoiceId } = body

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })
    }

    const invoice = await getRow<any>('Invoices', String(invoiceId))
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const amountDue = Number(invoice.amountDue) || 0
    if (amountDue <= 0) {
      return NextResponse.json({ error: 'No amount due on this invoice' }, { status: 400 })
    }

    // Get shop info for UPI fallback
    const shopRows = await listRows<any>('Shop')
    const shop = shopRows[0] || {}

    const KEY_ID = process.env.RAZORPAY_KEY_ID
    const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET

    // If Razorpay not configured, return UPI deep link fallback
    if (!KEY_ID || !KEY_SECRET) {
      if (shop.upiId) {
        const upiLink = `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(shop.name || 'Smart Computers')}&am=${amountDue.toFixed(2)}&cu=INR&tn=${encodeURIComponent(invoice.number || '')}`
        return NextResponse.json({
          success: true,
          method: 'upi',
          shortUrl: upiLink,
          amount: amountDue,
          message: 'Razorpay not configured. UPI link generated as fallback.',
        })
      }
      return NextResponse.json({
        error: 'Neither Razorpay nor UPI ID configured. Set RAZORPAY_KEY_ID/SECRET or add UPI ID in Settings.',
      }, { status: 400 })
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
        notify: {
          sms: true,
          email: !!shop.email,
        },
        reminder_enable: true,
        notes: {
          invoice_id: String(invoice.id || ''),
          invoice_number: String(invoice.number || ''),
        },
        callback_url: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/razorpay/webhook`,
        callback_method: 'get',
      }),
    })

    const rpData = await rpRes.json()
    if (!rpRes.ok) {
      // Fallback to UPI if Razorpay fails
      if (shop.upiId) {
        const upiLink = `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(shop.name || 'Smart Computers')}&am=${amountDue.toFixed(2)}&cu=INR&tn=${encodeURIComponent(invoice.number || '')}`
        return NextResponse.json({
          success: true,
          method: 'upi',
          shortUrl: upiLink,
          amount: amountDue,
          message: 'Razorpay failed, UPI link generated as fallback.',
        })
      }
      return NextResponse.json({ error: rpData?.error?.description || 'Razorpay failed' }, { status: 500 })
    }

    // Store payment link ID on invoice for webhook matching
    await updateRow('Invoices', String(invoice.id), {
      notes: String(invoice.notes || '') + `\n[Razorpay Link: ${rpData.id}]`,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      method: 'razorpay',
      shortUrl: rpData.short_url,
      paymentLinkId: rpData.id,
      amount: amountDue,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
