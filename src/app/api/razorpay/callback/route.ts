/**
 * Razorpay Payment Callback Handler
 * Handles successful payments from Razorpay payment links
 * Auto-updates invoice and customer outstanding
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, createRow, listRows } from '@/lib/sheets-client'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const razorpay_payment_id = url.searchParams.get('razorpay_payment_id')
    const razorpay_payment_link_id = url.searchParams.get('razorpay_payment_link_id')
    const razorpay_payment_link_reference_id = url.searchParams.get('razorpay_payment_link_reference_id')
    const razorpay_payment_link_status = url.searchParams.get('razorpay_payment_link_status')

    // Redirect to success/failure page
    if (razorpay_payment_link_status === 'paid') {
      // Payment successful - update invoice in background
      if (razorpay_payment_link_reference_id) {
        // Process payment asynchronously
        processPayment(
          razorpay_payment_link_reference_id,
          razorpay_payment_id || '',
          razorpay_payment_link_id || ''
        ).catch(console.error)
      }

      // Redirect to success page
      return NextResponse.redirect(
        new URL(`/payment-success?ref=${razorpay_payment_link_reference_id}`, req.url)
      )
    }

    // Payment failed or cancelled
    return NextResponse.redirect(
      new URL(`/payment-failed?ref=${razorpay_payment_link_reference_id}`, req.url)
    )
  } catch (e: any) {
    console.error('[Razorpay Callback] Error:', e)
    return NextResponse.redirect(new URL('/payment-failed', req.url))
  }
}

/**
 * Process payment in background
 */
async function processPayment(
  invoiceId: string,
  paymentId: string,
  paymentLinkId: string
): Promise<void> {
  try {
    // Get invoice
    const invoice = await getRow<any>('Invoices', invoiceId)
    if (!invoice) {
      console.error('[Razorpay] Invoice not found:', invoiceId)
      return
    }

    const amountDue = Number(invoice.amountDue) || 0
    if (amountDue <= 0) {
      console.log('[Razorpay] Invoice already paid:', invoiceId)
      return
    }

    // Create payment record
    await createRow('Payments', {
      invoiceId,
      invoiceNumber: invoice.number,
      customerName: invoice.customerName,
      amount: amountDue,
      type: 'Online',
      date: new Date().toISOString(),
      notes: `Online payment via Razorpay (Payment ID: ${paymentId})`,
      reference: paymentId,
      paymentLinkId,
    })

    // Update invoice
    const newPaid = (Number(invoice.amountPaid) || 0) + amountDue
    const newDue = Math.max(0, (Number(invoice.grandTotal) || 0) - newPaid)
    const newStatus = newDue <= 0 ? 'paid' : 'partial'

    await updateRow('Invoices', invoiceId, {
      amountPaid: newPaid,
      amountDue: newDue,
      paymentStatus: newStatus,
      lastPaymentDate: new Date().toISOString(),
      paymentMethod: 'Online',
    })

    // Update customer credit balance
    if (invoice.customerId) {
      const customer = await getRow<any>('Customers', invoice.customerId)
      if (customer) {
        const currentCredit = Number(customer.creditBalance) || 0
        const newCredit = Math.max(0, currentCredit - amountDue)
        await updateRow('Customers', invoice.customerId, {
          creditBalance: newCredit,
        })
      }
    }

    console.log('[Razorpay] Payment processed successfully:', {
      invoiceId,
      amount: amountDue,
      paymentId,
    })
  } catch (e: any) {
    console.error('[Razorpay] Failed to process payment:', e)
  }
}
