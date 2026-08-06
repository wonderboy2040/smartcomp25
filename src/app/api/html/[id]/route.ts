import { NextRequest, NextResponse } from 'next/server'
import { getRow, listRows } from '@/lib/sheets-client'
import { computeInvoice, formatCurrency, numberToWords, type LineItem } from '@/lib/calc'
import { safeJsonParse } from '@/lib/utils'
import QRCode from 'qrcode'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const type = url.searchParams.get('type') || 'invoice'

    const shopRows = await listRows<any>('Shop').catch(() => [])
    const shop = shopRows[0] || { name: 'Smart Computers', termsInvoice: '', termsQuotation: '' }

    let doc: any = null

    if (type === 'invoice') {
      const invoice = await getRow<any>('Invoices', id)
      if (!invoice) return new NextResponse('Invoice not found', { status: 404 })
      const items = safeJsonParse<any[]>(invoice.itemsJson, []) as LineItem[]
      const calc = computeInvoice(items, {
        courierCharges: Number(invoice.courierCharges) || 0,
        otherCharges: Number(invoice.otherCharges) || 0,
        discount: Number(invoice.discount) || 0,
      })
      doc = {
        number: invoice.number,
        date: invoice.date || invoice.createdAt,
        docType: 'invoice',
        title: 'TAX INVOICE',
        calc,
        customerName: invoice.customerName || 'Walk-in',
        customerPhone: invoice.customerPhone || '',
        customerGstin: invoice.customerGstin || '',
        amountPaid: Number(invoice.amountPaid) || 0,
        amountDue: Number(invoice.amountDue) || 0,
        paymentType: invoice.paymentType || 'cash',
        paymentStatus: invoice.paymentStatus || 'unpaid',
        notes: invoice.notes || '',
        terms: shop.termsInvoice || '1. Goods once sold will not be taken back.\n2. Warranty as per manufacturer policies.',
      }
    } else if (type === 'quotation') {
      const q = await getRow<any>('Quotations', id)
      if (!q) return new NextResponse('Quotation not found', { status: 404 })
      const items = safeJsonParse<any[]>(q.itemsJson, []) as LineItem[]
      const calc = computeInvoice(items, {
        courierCharges: Number(q.courierCharges) || 0,
        otherCharges: Number(q.otherCharges) || 0,
        discount: Number(q.discount) || 0,
      })
      doc = {
        number: q.number,
        date: q.date || q.createdAt,
        validTill: q.validTill,
        docType: 'quotation',
        title: 'QUOTATION',
        calc,
        customerName: q.customerName || 'Walk-in',
        customerPhone: q.customerPhone || '',
        customerGstin: q.customerGstin || '',
        notes: q.notes || '',
        terms: shop.termsQuotation || '1. Quotation valid for 7 days.\n2. Prices subject to market changes.',
      }
    } else if (type === 'service') {
      const job = await getRow<any>('Jobs', id)
      if (!job) return new NextResponse('Job not found', { status: 404 })
      const partsUsed = safeJsonParse<any[]>(job.partsUsedJson, [])
      const items: LineItem[] = partsUsed.map((p) => ({
        itemId: p.itemId,
        name: p.name || 'Part/Component',
        quantity: Number(p.quantity) || 1,
        rate: Number(p.sellingPrice) || Number(p.price) || 0,
        gstApplicable: false,
        gstRate: 0,
      }))
      if (Number(job.serviceCharge) > 0) {
        items.push({
          name: `Service Labor: ${job.deviceType || 'Repair'}`,
          quantity: 1,
          rate: Number(job.serviceCharge),
          gstApplicable: false,
          gstRate: 0,
        })
      }
      const calc = computeInvoice(items, {})
      doc = {
        number: `JOB-${job.jobId || job.id}`,
        date: job.completedDate || job.createdAt,
        docType: 'service',
        title: 'SERVICE INVOICE',
        calc,
        customerName: job.customerName || 'Walk-in',
        customerPhone: job.customerMobile || '',
        amountPaid: Number(job.paidAmount) || 0,
        amountDue: Math.max(0, calc.grandTotal - (Number(job.paidAmount) || 0)),
        paymentType: job.paymentMode || 'cash',
        notes: job.diagnosisNotes || job.notes || '',
        terms: '1. Warranty as per labor and parts supplied.',
      }
    }

    if (!doc) return new NextResponse('Invalid document', { status: 400 })

    let upiQr = ''
    if (shop.upiId) {
      try {
        const qrAmount = doc.amountDue > 0 ? doc.amountDue : doc.calc.grandTotal
        const upiStr = `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(shop.name)}&am=${qrAmount.toFixed(2)}&cu=INR`
        upiQr = await QRCode.toDataURL(upiStr, { margin: 1, width: 140 })
      } catch {}
    }

    const itemsRowsHtml = doc.calc.items
      .map(
        (item: any, idx: number) => `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f8fafc;'}">
        <td style="padding: 6px; text-align: center;">${idx + 1}</td>
        <td style="padding: 6px; font-weight: 600;">${item.name}</td>
        <td style="padding: 6px; text-align: center;">${item.hsnCode || '-'}</td>
        <td style="padding: 6px; text-align: right; font-weight: 700;">${item.quantity}</td>
        <td style="padding: 6px; text-align: right;">Rs.${item.rate.toFixed(2)}</td>
        <td style="padding: 6px; text-align: right;">Rs.${item.amount.toFixed(2)}</td>
        <td style="padding: 6px; text-align: right;">${item.gstAmount > 0 ? `Rs.${item.gstAmount.toFixed(2)}` : '-'}</td>
        <td style="padding: 6px; text-align: right; font-weight: 700;">Rs.${item.total.toFixed(2)}</td>
      </tr>`
      )
      .join('')

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${doc.title} - ${doc.number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #0f172a; padding: 16px; font-size: 11px; line-height: 1.4; }
    .toolbar { max-width: 210mm; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 6px; }
    .btn { background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer; text-decoration: none; font-size: 12px; }
    .btn:hover { background: #1d4ed8; }
    .a4-page { max-width: 210mm; min-height: 297mm; margin: 0 auto; background: #ffffff; padding: 32px; border: 1px solid #cbd5e1; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); display: flex; flex-direction: column; justify-content: space-between; }
    .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
    .shop-title { font-size: 20px; font-weight: 900; color: #1e3a8a; text-transform: uppercase; line-height: 1.2; margin-bottom: 4px; }
    .badge { background: #1e3a8a; color: #fff; font-weight: 900; padding: 4px 12px; border-radius: 4px; font-size: 13px; text-transform: uppercase; display: inline-block; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .card { border: 1px solid #e2e8f0; background: #f8fafc; padding: 12px; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10.5px; }
    th { background: #1e3a8a; color: #ffffff; padding: 8px 6px; text-transform: uppercase; font-size: 10px; }
    .totals-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 4px; font-size: 11px; }
    .grand-total { font-size: 15px; font-weight: 800; color: #1e3a8a; border-top: 1px solid #cbd5e1; padding-top: 6px; margin-top: 6px; display: flex; justify-content: space-between; }
    .signature-block { text-align: center; width: 220px; margin-left: auto; margin-bottom: 16px; }
    .signature-line { border-bottom: 1px solid #000; margin-top: 32px; margin-bottom: 4px; }
    .footer-ad { background: #eff6ff; border: 1px solid #93c5fd; padding: 10px 14px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }
    @media print {
      body { background: #ffffff !important; padding: 0 !important; }
      .toolbar { display: none !important; }
      .a4-page { border: none !important; box-shadow: none !important; width: 100% !important; max-width: none !important; padding: 0 !important; }
      @page { size: A4 portrait; margin: 8mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div><strong>${doc.number}</strong> • ${doc.customerName}</div>
    <button onclick="window.print()" class="btn">⚡ Print A4</button>
  </div>

  <div class="a4-page">
    <div>
      <div class="header">
        <div>
          <div class="shop-title">${shop.name || 'Smart Computers'}</div>
          <div>${shop.address || ''}</div>
          <div>Ph: <strong>${shop.phone || ''}</strong> ${shop.email ? '| Email: ' + shop.email : ''}</div>
          ${shop.gstNumber ? `<div style="margin-top: 2px;"><strong>GSTIN: ${shop.gstNumber}</strong></div>` : ''}
        </div>
        <div style="text-align: right;">
          <div class="badge">${doc.title}</div>
          <div style="margin-top: 8px;">Doc #: <strong>${doc.number}</strong></div>
          <div>Date: <strong>${new Date(doc.date).toLocaleDateString('en-IN')}</strong></div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div style="font-weight: bold; color: #64748b; font-size: 10px; text-transform: uppercase; margin-bottom: 2px;">Bill To</div>
          <div style="font-size: 13px; font-weight: bold; color: #0f172a;">${doc.customerName}</div>
          ${doc.customerPhone ? `<div>Ph: ${doc.customerPhone}</div>` : ''}
          ${doc.customerGstin ? `<div style="font-weight: bold;">GSTIN: ${doc.customerGstin}</div>` : ''}
        </div>
        <div class="card">
          <div style="font-weight: bold; color: #64748b; font-size: 10px; text-transform: uppercase; margin-bottom: 2px;">Payment Status</div>
          <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; color: ${doc.paymentStatus === 'paid' ? '#16a34a' : '#dc2626'};">
            ${doc.paymentStatus || 'UNPAID'}
          </div>
          ${doc.amountDue > 0 ? `<div style="font-weight: bold; color: #dc2626; margin-top: 4px;">Balance Due: ${formatCurrency(doc.amountDue)}</div>` : ''}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 30px; text-align: center;">#</th>
            <th style="text-align: left;">Item Description</th>
            <th style="text-align: center; width: 70px;">HSN/SAC</th>
            <th style="text-align: right; width: 50px;">Qty</th>
            <th style="text-align: right; width: 80px;">Rate</th>
            <th style="text-align: right; width: 80px;">Taxable</th>
            <th style="text-align: right; width: 80px;">GST</th>
            <th style="text-align: right; width: 90px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
        </tbody>
      </table>

      <div class="grid-2" style="grid-template-columns: 7fr 5fr;">
        <div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 4px; margin-bottom: 12px;">
            <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Amount in Words</div>
            <div style="font-weight: bold; color: #0f172a;">${numberToWords(doc.calc.grandTotal)}</div>
          </div>

          ${
            upiQr
              ? `<div style="display: flex; gap: 12px; align-items: center; border: 1px solid #e2e8f0; padding: 8px; border-radius: 4px;">
                  <img src="${upiQr}" style="width: 60px; height: 60px; border: 1px solid #cbd5e1; border-radius: 4px;" />
                  <div>
                    <div style="font-weight: bold; font-size: 11px;">Scan & Pay via UPI</div>
                    <div>${shop.upiId}</div>
                    <div style="font-size: 10px; color: #64748b;">${shop.bankName || ''} A/C ${shop.bankAccount || ''}</div>
                  </div>
                </div>`
              : ''
          }

          ${doc.notes ? `<div style="margin-top: 8px;"><strong>Notes:</strong> ${doc.notes}</div>` : ''}
          ${doc.terms ? `<div style="margin-top: 8px; font-size: 10px; color: #64748b;"><strong>Terms:</strong><br>${doc.terms.replace(/\n/g, '<br>')}</div>` : ''}
        </div>

        <div class="totals-box">
          <div style="display: flex; justify-content: space-between;"><span>Subtotal:</span><span>Rs.${doc.calc.subtotal.toFixed(2)}</span></div>
          ${doc.calc.gstAmount > 0 ? `<div style="display: flex; justify-content: space-between;"><span>GST Total:</span><span>Rs.${doc.calc.gstAmount.toFixed(2)}</span></div>` : ''}
          ${doc.calc.courierCharges > 0 ? `<div style="display: flex; justify-content: space-between;"><span>Courier:</span><span>Rs.${doc.calc.courierCharges.toFixed(2)}</span></div>` : ''}
          ${doc.calc.discount > 0 ? `<div style="display: flex; justify-content: space-between; color: #16a34a;"><span>Discount:</span><span>- Rs.${doc.calc.discount.toFixed(2)}</span></div>` : ''}
          
          <div class="grand-total">
            <span>Grand Total:</span>
            <span>${formatCurrency(doc.calc.grandTotal)}</span>
          </div>

          ${doc.amountPaid > 0 ? `<div style="display: flex; justify-content: space-between; color: #16a34a; margin-top: 4px;"><span>Paid:</span><span>Rs.${doc.amountPaid.toFixed(2)}</span></div>` : ''}
          ${doc.amountDue > 0 ? `<div style="display: flex; justify-content: space-between; color: #dc2626; font-weight: bold;"><span>Due:</span><span>Rs.${doc.amountDue.toFixed(2)}</span></div>` : ''}
        </div>
      </div>
    </div>

    <div>
      <div class="signature-block">
        <div style="font-weight: bold; font-size: 11px; color: #0f172a;">For ${shop.name || 'Smart Computers'}:</div>
        <div class="signature-line"></div>
        <div style="font-size: 10px; color: #64748b;">Authorized Signatory</div>
      </div>

      <div class="footer-ad">
        <div>
          <div style="font-weight: bold; color: #1e3a8a;">Computers • Laptops • Printers • Accessories</div>
          <div style="font-size: 10px; color: #475569;">Wholesale & Retail IT Sales & Repair Center</div>
        </div>
        <div style="font-weight: bold;">
          ${shop.phone ? `Ph: ${shop.phone}` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`

    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (e: any) {
    return new NextResponse(`Error: ${e?.message}`, { status: 500 })
  }
}
