import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, updateRow } from '@/lib/sheets-client'

/**
 * POST /api/razorpay/webhook
 * Razorpay sends payment.captured webhook when customer pays.
 * We verify the signature, then auto-create a Payment record and mark invoice as paid.
 *
 * Webhook is whitelisted in middleware (no PIN) — secured by RAZORPAY_WEBHOOK_SECRET
 * signature verification.
 *
 * If RAZORPAY_WEBHOOK_SECRET is not set, we skip verification (testing mode).
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const body = JSON.parse(rawBody)

    const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET
    // SECURITY: require the secret to be set in production. Without signature
    // verification, anyone can POST a fake payment.captured event and mark
    // their own invoices as paid. Previously this silently skipped verification
    // when the env var was missing — fine for local dev, dangerous in prod.
    if (!WEBHOOK_SECRET) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET not set in production — rejecting webhook')
        return NextResponse.json(
          { error: 'Webhook secret not configured' },
          { status: 503 }
        )
      }
      console.warn('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET not set (dev mode) — skipping verification')
    } else {
      const signature = req.headers.get('x-razorpay-signature') || ''
      const enc = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(WEBHOOK_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
      const computed = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      if (computed.length !== signature.length || computed !== signature) {
        console.warn('[Razorpay Webhook] Invalid signature — rejected')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
      }
    }

    // Process webhook event
    const event = body?.event || ''
    const payload = body?.payload?.payment?.entity || {}

    if (event === 'payment.captured' && payload.status === 'captured') {
      const amount = (Number(payload.amount) || 0) / 100 // Razorpay uses paise
      const notes = payload.notes || {}
      const invoiceId = String(notes.invoice_id || '')
      const invoiceNumber = String(notes.invoice_number || '')

      if (invoiceId) {
        // Find the invoice
        const invoices = await listRows<any>('Invoices')
        const invoice = invoices.find((inv) => String(inv.id) === invoiceId)
        if (invoice) {
          // IDEMPOTENCY: check if this payment was already recorded (Razorpay retries)
          const existingPayments = await listRows<any>('Payments')
          const alreadyRecorded = existingPayments.find((p) => String(p.reference || '') === String(payload.id || ''))
          if (alreadyRecorded) {
            console.log(`[Razorpay Webhook] Payment ${payload.id} already recorded — skipping`)
            return NextResponse.json({ success: true, duplicate: true })
          }

          // Create payment record
          await createRow('Payments', {
            invoiceId: String(invoice.id),
            invoiceNumber: String(invoice.number || ''),
            customerName: String(invoice.customerName || ''),
            amount,
            type: 'UPI',
            date: new Date().toISOString(),
            notes: `Razorpay payment - ${payload.id || ''}`,
            reference: String(payload.id || ''),
          })

          // Update invoice payment status
          const currentPaid = Number(invoice.amountPaid) || 0
          const grandTotal = Number(invoice.grandTotal) || 0
          const newPaid = currentPaid + amount
          const newDue = Math.max(0, grandTotal - newPaid)
          const newStatus = newDue <= 0 ? 'paid' : 'partial'

          await updateRow('Invoices', String(invoice.id), {
            amountPaid: newPaid,
            amountDue: newDue,
            paymentStatus: newStatus,
          })

          // Update customer credit balance
          if (invoice.customerId) {
            const customer = await listRows<any>('Customers')
            const c = customer.find((c) => String(c.id) === String(invoice.customerId))
            if (c) {
              const currentCredit = Number(c.creditBalance) || 0
              await updateRow('Customers', String(c.id), {
                creditBalance: Math.max(0, currentCredit - amount),
              }).catch(() => {})
            }
          }

          console.log(`[Razorpay Webhook] Payment captured: Rs.${amount} for ${invoiceNumber}`)
        }
      }
    }

    // Always return 200 to Razorpay
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[Razorpay Webhook] Error:', e?.message)
    return NextResponse.json({ success: true }) // still 200 to prevent retries
  }
}
