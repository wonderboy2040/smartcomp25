import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, getRow, updateRow } from '@/lib/sheets-client'

import { writeLimiter, getClientIp } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const invoiceId = url.searchParams.get('invoiceId')
    const type = url.searchParams.get('type')
    const limit = parseInt(url.searchParams.get('limit') || '200')

    // PERFORMANCE: Load payments and invoices in parallel
    const [allPayments, invoices] = await Promise.all([
      listRows<any>('Payments'),
      listRows<any>('Invoices', { useCache: true }),
    ])
    
    let payments = allPayments
    if (invoiceId) payments = payments.filter((p) => p.invoiceId === invoiceId)
    if (type) payments = payments.filter((p) => p.type === type)

    payments.sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime())
    payments = payments.slice(0, limit)

    const result = payments.map((p) => {
      const invoice = invoices.find((i) => i.id === p.invoiceId)
      return {
        ...p,
        amount: Number(p.amount) || 0,
        invoice: invoice
          ? {
              id: invoice.id,
              number: invoice.number,
              customer: {
                id: invoice.customerId,
                name: invoice.customerName,
                phone: invoice.customerPhone,
              },
            }
          : { id: p.invoiceId, number: p.invoiceNumber, customer: { name: p.customerName } },
      }
    })

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // v11.2: rate-limit payment writes too
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited — too many writes, wait a moment' }, { status: 429 })

    const body = await req.json()
    const { invoiceId, amount, type, date, notes, reference } = body

    if (!invoiceId) return NextResponse.json({ error: 'Invoice required' }, { status: 400 })
    const amt = Number(amount) || 0
    if (amt <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })

    const invoice = await getRow<any>('Invoices', invoiceId)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 400 })

    // v11.2: over-payment guard — never let a payment exceed the balance due.
    const currentDue = Math.max(0, Number(invoice.amountDue) || 0)
    if (amt > currentDue) {
      return NextResponse.json({
        error: `Payment exceeds balance due`,
        balanceDue: currentDue,
        message: `Invoice balance is only Rs.${currentDue.toFixed(2)}`,
      }, { status: 400 })
    }
    if (currentDue <= 0) {
      return NextResponse.json({ error: 'Invoice is already fully paid' }, { status: 400 })
    }

    // Create payment
    const payment = await createRow('Payments', {
      invoiceId,
      invoiceNumber: invoice.number,
      customerName: invoice.customerName,
      amount: amt,
      type: type || 'Cash',
      date: date || new Date().toISOString(),
      notes: notes || '',
      reference: reference || '',
    })

    // Update invoice
    const newPaid = (Number(invoice.amountPaid) || 0) + amt
    const newDue = Math.max(0, (Number(invoice.grandTotal) || 0) - newPaid)
    const newStatus = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid'

    await updateRow('Invoices', invoiceId, {
      amountPaid: newPaid,
      amountDue: newDue,
      paymentStatus: newStatus,
    })

    // Update customer credit balance — only reduce by what was actually due
    const customer = await getRow<any>('Customers', invoice.customerId)
    if (customer) {
      const currentCredit = Number(customer.creditBalance) || 0
      const decrement = Math.min(amt, currentCredit, currentDue)
      if (decrement > 0) {
        await updateRow('Customers', invoice.customerId, {
          creditBalance: currentCredit - decrement,
        })
      }
    }

    return NextResponse.json(payment, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
