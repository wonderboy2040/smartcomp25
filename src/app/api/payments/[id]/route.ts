import { NextRequest, NextResponse } from 'next/server'
import { getRow, deleteRow, updateRow } from '@/lib/sheets-client'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const payment = await getRow<any>('Payments', id)
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

    const invoice = await getRow<any>('Invoices', payment.invoiceId)
    if (invoice) {
      // Reverse invoice paid/due
      const newPaid = Math.max(0, (Number(invoice.amountPaid) || 0) - (Number(payment.amount) || 0))
      const newDue = (Number(invoice.grandTotal) || 0) - newPaid
      const newStatus = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid'

      await updateRow('Invoices', invoice.id, {
        amountPaid: newPaid,
        amountDue: newDue,
        paymentStatus: newStatus,
      })

      // Restore customer credit
      const customer = await getRow<any>('Customers', invoice.customerId)
      if (customer) {
        const currentCredit = Number(customer.creditBalance) || 0
        await updateRow('Customers', invoice.customerId, {
          creditBalance: currentCredit + Math.min(Number(payment.amount), newDue),
        })
      }
    }

    await deleteRow('Payments', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
