'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import {
  FileText, FileCheck2, Loader2, AlertCircle, Download, CreditCard,
  Phone, Mail, MapPin, MessageSquare, CheckCircle2, Store, Calendar,
  Receipt, ArrowRight, ShieldCheck, ExternalLink, IndianRupee, Clock, Star,
} from 'lucide-react'

export default function DocViewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-800">
          <Loader2 className="w-10 h-10 animate-spin text-white" />
        </div>
      }
    >
      <DocViewInner />
    </Suspense>
  )
}

function DocViewInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = String(params?.id || '')
  const type = searchParams.get('type') || 'invoice'
  const token = searchParams.get('token') || ''

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [payResult, setPayResult] = useState<any>(null)

  useEffect(() => {
    if (!id || !token) {
      setError('Invalid document link')
      setLoading(false)
      return
    }
    fetch(`/api/track/doc?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}&token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Failed to load')
        setData(d)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, type, token])

  const handlePayNow = async () => {
    setPaying(true)
    setPayResult(null)
    try {
      const r = await fetch('/api/track/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: id, token }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Payment failed')
      setPayResult(d)
      // Auto-redirect to payment link
      if (d.shortUrl) {
        window.open(d.shortUrl, '_blank')
      }
    } catch (e: any) {
      setPayResult({ error: e.message })
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-800">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-white mx-auto mb-3" />
          <p className="text-sm text-indigo-200">Loading document...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-600 to-red-800 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Document Error</h1>
          <p className="text-sm text-slate-600">{error}</p>
          <p className="text-xs text-slate-500 mt-3">Please contact the shop for assistance.</p>
        </div>
      </div>
    )
  }

  const doc = data?.doc
  const shop = data?.shop
  const isInvoice = doc?.type === 'invoice'
  const DocIcon = isInvoice ? FileText : FileCheck2
  const statusColor =
    doc?.paymentStatus === 'paid'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : doc?.paymentStatus === 'partial'
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-red-700 bg-red-50 border-red-200'
  const statusLabel =
    doc?.paymentStatus === 'paid'
      ? 'Paid'
      : doc?.paymentStatus === 'partial'
        ? 'Partially Paid'
        : 'Unpaid'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div
        className="text-white p-5 shadow-lg"
        style={{
          background: isInvoice
            ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
            : 'linear-gradient(135deg, #0891b2, #0e7490)',
        }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <Store className="w-5 h-5" />
            <h1 className="text-lg font-bold">{shop?.name || 'Smart Computers'}</h1>
          </div>
          <p className="text-xs opacity-80">
            {isInvoice ? 'Invoice' : 'Quotation'} · Customer Portal
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Document Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <DocIcon className="w-5 h-5 text-indigo-600" />
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">
                  {isInvoice ? 'INVOICE' : 'QUOTATION'}
                </p>
              </div>
              <p className="font-mono text-lg font-bold text-slate-900">{doc?.number}</p>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {doc?.date
                    ? new Date(doc.date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                    : ''}
                </span>
              </div>
            </div>
            {isInvoice && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${statusColor}`}>
                {doc?.paymentStatus === 'paid' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
                <span className="text-xs font-semibold">{statusLabel}</span>
              </div>
            )}
          </div>

          {/* Customer info */}
          <div className="p-3 bg-slate-50 rounded-xl">
            <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">Bill To</p>
            <p className="font-semibold text-slate-900">{doc?.customerName}</p>
            {doc?.customerPhone && (
              <p className="text-xs text-slate-500 mt-0.5">{doc.customerPhone}</p>
            )}
            {doc?.customerGstin && (
              <p className="text-xs text-slate-500 mt-0.5">GSTIN: {doc.customerGstin}</p>
            )}
          </div>

          {/* Validity for quotation */}
          {!isInvoice && doc?.validTill && (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>
                Valid until{' '}
                <strong>
                  {new Date(doc.validTill).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-600" />
              Items ({doc?.items?.length || 0})
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5 text-center">Qty</th>
                  <th className="px-4 py-2.5 text-right">Rate</th>
                  {doc?.items?.some((i: any) => i.gstApplicable) && (
                    <th className="px-4 py-2.5 text-right">GST</th>
                  )}
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {doc?.items?.map((item: any, i: number) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-2.5 text-center text-slate-600">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      ₹{Number(item.rate).toLocaleString('en-IN')}
                    </td>
                    {doc.items.some((i: any) => i.gstApplicable) && (
                      <td className="px-4 py-2.5 text-right text-slate-500 text-xs">
                        {item.gstApplicable ? `${item.gstRate}%` : '-'}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-900">
                      ₹{Number(item.total).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t border-slate-200 p-4 space-y-1.5 bg-slate-50/50">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-700">₹{Number(doc?.subtotal || 0).toLocaleString('en-IN')}</span>
            </div>
            {Number(doc?.totalGst) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">GST</span>
                <span className="text-slate-700">₹{Number(doc.totalGst).toLocaleString('en-IN')}</span>
              </div>
            )}
            {Number(doc?.courierCharges) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Courier Charges</span>
                <span className="text-slate-700">₹{Number(doc.courierCharges).toLocaleString('en-IN')}</span>
              </div>
            )}
            {Number(doc?.otherCharges) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Other Charges</span>
                <span className="text-slate-700">₹{Number(doc.otherCharges).toLocaleString('en-IN')}</span>
              </div>
            )}
            {Number(doc?.discount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Discount</span>
                <span className="text-emerald-600">-₹{Number(doc.discount).toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-300">
              <span className="text-slate-900">Grand Total</span>
              <span className="text-slate-900">₹{Number(doc?.grandTotal || 0).toLocaleString('en-IN')}</span>
            </div>

            {/* Payment info for invoices */}
            {isInvoice && (
              <>
                {Number(doc?.amountPaid) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-600">Amount Paid</span>
                    <span className="text-emerald-600 font-medium">
                      ₹{Number(doc.amountPaid).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
                {Number(doc?.amountDue) > 0 && (
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-red-600">Amount Due</span>
                    <span className="text-red-600">
                      ₹{Number(doc.amountDue).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Pay Now Button — only for invoices with amount due */}
        {isInvoice && Number(doc?.amountDue) > 0 && (
          <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl shadow-sm border border-emerald-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <IndianRupee className="w-5 h-5 text-emerald-600" />
              <p className="text-sm font-bold text-emerald-900">Pay Online</p>
            </div>
            <p className="text-xs text-emerald-700 mb-3">
              Pay ₹{Number(doc.amountDue).toLocaleString('en-IN')} securely via UPI or
              online payment.
            </p>

            {payResult?.shortUrl ? (
              <div className="space-y-2">
                <a
                  href={payResult.shortUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-emerald-200"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Payment Link ({payResult.method === 'upi' ? 'UPI' : 'Razorpay'})
                </a>
                <p className="text-[10px] text-emerald-600 text-center">
                  Payment link opened in new tab. Complete payment there.
                </p>
              </div>
            ) : payResult?.error ? (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 mb-3">
                {payResult.error}
              </div>
            ) : (
              <button
                onClick={handlePayNow}
                disabled={paying}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-emerald-200"
              >
                {paying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating payment link...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    Pay ₹{Number(doc.amountDue).toLocaleString('en-IN')} Now
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Fully paid badge */}
        {isInvoice && doc?.paymentStatus === 'paid' && (
          <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl shadow-sm border border-emerald-200 p-5 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
            <p className="text-lg font-bold text-emerald-700">Fully Paid</p>
            <p className="text-xs text-emerald-600 mt-1">Thank you for your payment!</p>
          </div>
        )}

        {/* Notes */}
        {doc?.notes && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-900 mb-1">Notes</p>
            <p className="text-sm text-slate-600 whitespace-pre-line">{doc.notes}</p>
          </div>
        )}

        {/* Download PDF */}
        <a
          href={`/api/doc-html/${id}?type=${type}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 bg-white border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          View / Download PDF
        </a>

        {/* Google Review CTA — only show for paid invoices */}
        {isInvoice && doc?.paymentStatus === 'paid' && (
          <a
            href="https://share.google/ZUvRUX4eYuUHJdaA4"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl text-sm font-bold hover:from-amber-600 hover:to-orange-600 transition-colors shadow-lg shadow-amber-200"
          >
            <Star className="w-4 h-4" />
            Rate us on Google — 30 seconds ⭐
          </a>
        )}

        {/* Shop Contact */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-3">Contact Shop</p>
          <div className="space-y-2">
            {shop?.phone && (
              <a
                href={`tel:${shop.phone}`}
                className="flex items-center gap-2 text-sm text-slate-700 hover:text-blue-600"
              >
                <Phone className="w-4 h-4 text-blue-500" /> {shop.phone}
              </a>
            )}
            {shop?.email && (
              <a
                href={`mailto:${shop.email}`}
                className="flex items-center gap-2 text-sm text-slate-700 hover:text-blue-600"
              >
                <Mail className="w-4 h-4 text-blue-500" /> {shop.email}
              </a>
            )}
            {shop?.address && (
              <div className="flex items-start gap-2 text-sm text-slate-700">
                <MapPin className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" /> {shop.address}
              </div>
            )}
          </div>
          {shop?.phone && (
            <a
              href={`https://wa.me/${shop.phone.replace(/\D/g, '').length === 10 ? '91' : ''}${shop.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <MessageSquare className="w-4 h-4" /> Chat on WhatsApp
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pb-4 space-y-1.5">
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
            <ShieldCheck className="w-3 h-3" />
            <span>Secure document link · Data protected</span>
          </div>
          <p className="text-[10px] text-slate-400">
            Powered by {shop?.name || 'Smart Computers'} · {doc?.number}
          </p>
        </div>
      </div>
    </div>
  )
}
