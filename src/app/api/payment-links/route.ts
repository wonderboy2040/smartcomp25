import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow } from '@/lib/sheets-client'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * Payment Link Generation API
 * Creates Razorpay payment links for invoices
 * Auto-updates invoice status via webhook
 */

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const body = await req.json()
    const { invoiceId } = body

    if (!invoiceId) return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })

    // Get invoice details
    const invoice = await getRow<any>('Invoices', invoiceId)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const amountDue = Number(invoice.amountDue) || 0
    if (amountDue <= 0) {
      return NextResponse.json({ error: 'Invoice already fully paid' }, { status: 400 })
    }

    // Check if Razorpay is configured
    const razorpayKey = process.env.RAZORPAY_KEY_ID
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET

    if (!razorpayKey || !razorpaySecret) {
      return NextResponse.json({
        error: 'Razorpay not configured',
        message: 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables',
      }, { status: 400 })
    }

    // Create Razorpay payment link
    const auth = Buffer.from(`${razorpayKey}:${razorpaySecret}`).toString('base64')

    const razorpayPayload = {
      amount: Math.round(amountDue * 100), // Convert to paise
      currency: 'INR',
      description: `Payment for Invoice ${invoice.number}`,
      customer: {
        name: invoice.customerName || 'Customer',
        contact: invoice.customerPhone || '',
      },
      notify: {
        sms: true,
        email: false,
      },
      reminder_enable: true,
      callback_url: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/razorpay/callback`,
      callback_method: 'get',
      reference_id: invoiceId,
    }

    const response = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(razorpayPayload),
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({
        error: 'Failed to create payment link',
        details: error,
      }, { status: response.status })
    }

    const paymentLink = await response.json()

    // Update invoice with payment link
    await updateRow('Invoices', invoiceId, {
      paymentLinkId: paymentLink.id,
      paymentLinkUrl: paymentLink.short_url,
      paymentLinkCreatedAt: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      paymentLink: {
        id: paymentLink.id,
        shortUrl: paymentLink.short_url,
        amount: amountDue,
        status: paymentLink.status,
      },
    }, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

/**
 * Check payment link status
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const paymentLinkId = url.searchParams.get('id')

    if (!paymentLinkId) return NextResponse.json({ error: 'Payment link ID required' }, { status: 400 })

    const razorpayKey = process.env.RAZORPAY_KEY_ID
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET

    if (!razorpayKey || !razorpaySecret) {
      return NextResponse.json({ error: 'Razorpay not configured' }, { status: 400 })
    }

    const auth = Buffer.from(`${razorpayKey}:${razorpaySecret}`).toString('base64')

    const response = await fetch(`https://api.razorpay.com/v1/payment_links/${paymentLinkId}`, {
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch payment link status' }, { status: response.status })
    }

    const paymentLink = await response.json()

    return NextResponse.json({
      id: paymentLink.id,
      status: paymentLink.status,
      amount: paymentLink.amount / 100,
      amountPaid: paymentLink.amount_paid / 100,
      shortUrl: paymentLink.short_url,
      createdAt: paymentLink.created_at,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
