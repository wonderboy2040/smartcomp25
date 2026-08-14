'use client'

import { useState, useCallback } from 'react'
import { Store, Phone, Mail, MapPin, MessageSquare, Loader2, FileText, Shield, FileSignature, Search, Receipt, QrCode, Lock } from 'lucide-react'

/**
 * Customer Self-Service Portal — /portal
 *
 * Customer enters the mobile number registered with the shop and gets:
 *   - all their invoices with outstanding balance + pay online (Razorpay/UPI)
 *   - warranty status of items bought (from sold serials)
 *   - their AMC contracts + expiry
 *
 * No login needed — the phone number is the key (same model as the job
 * tracking page's share links, but covering the whole account).
 */

const PHONE_STORAGE_KEY = 'smartcomp_portal_phone'

function normalizeInput(v: string): string {
  return v.replace(/\D/g, '').slice(0, 10)
}

export default function PortalPage() {
  const [phone, setPhone] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [payingInvoice, setPayingInvoice] = useState('')
  const [payError, setPayError] = useState('')

  const lookup = useCallback(async (p: string) => {
    if (p.length !== 10) {
      setError('Enter a valid 10-digit mobile number')
      return
    }
    setLoading(true)
    setError('')
    setPayError('')
    try {
      const res = await fetch(`/api/portal?phone=${encodeURIComponent(p)}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load your account')
      setData(d)
      try { localStorage.setItem(PHONE_STORAGE_KEY, p) } catch {}
    } catch (e: any) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    lookup(normalizeInput(phone))
  }

  const handlePay = async (invoiceId: string) => {
    setPayingInvoice(invoiceId)
    setPayError('')
    try {
      const res = await fetch('/api/portal/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, phone: normalizeInput(phone) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Payment link failed')
      if (d.method === 'upi' && d.shortUrl) {
        window.location.href = d.shortUrl
      } else if (d.shortUrl) {
        window.open(d.shortUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (e: any) {
      setPayError(e.message)
    } finally {
      setPayingInvoice('')
    }
  }

  const handleLogout = () => {
    setData(null)
    setPhone('')
    try { localStorage.removeItem(PHONE_STORAGE_KEY) } catch {}
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-violet-700 text-white p-5 shadow-lg">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5" />
              <h1 className="text-lg font-bold">{data?.shop?.name || 'Smart Computers'}</h1>
            </div>
            <p className="text-xs text-indigo-200 flex items-center gap-1">
              <Lock className="w-3 h-3" /> My Account
            </p>
          </div>
          <p className="text-xs text-indigo-200 mt-1">
            Invoices • Payments • Warranty • AMC
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* ============ PHONE ENTRY ============ */}
        {!data && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mt-2">
            <div className="text-center mb-5">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-3">
                <Receipt className="w-8 h-8 text-indigo-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Welcome to your account</h2>
              <p className="text-sm text-slate-500 mt-1">
                View your invoices, pay online, check warranty &amp; AMC status.
                Enter the mobile number you registered with us.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(normalizeInput(e.target.value))}
                  placeholder="10-digit mobile number"
                  className="w-full text-base font-semibold tracking-wider text-center pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
                />
              </div>
              {error && <p className="text-xs text-red-600 text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading || phone.length !== 10}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-indigo-200"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {loading ? 'Loading your account…' : 'View My Account'}
              </button>
            </form>
            <p className="text-[10px] text-slate-400 text-center mt-4">
              Your details stay private — only this shop can see them.
            </p>
          </div>
        )}

        {/* ============ ACCOUNT VIEW ============ */}
        {data && (
          <>
            {/* Customer header */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Customer</p>
                  <p className="text-lg font-bold text-slate-900 truncate">
                    {data.customer?.name || `+91 ${data.customer?.phone || phone}`}
                  </p>
                  <p className="text-xs text-slate-500">+91 {data.customer?.phone || phone}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-[11px] text-slate-400 hover:text-slate-700 font-medium whitespace-nowrap"
                >
                  Not you? Switch
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className={`rounded-xl p-3 ${data.totalOutstanding > 0 ? 'bg-red-50 border border-red-100' : 'bg-emerald-50 border border-emerald-100'}`}>
                  <p className="text-[10px] uppercase font-medium text-slate-500">Total Outstanding</p>
                  <p className={`text-xl font-bold ${data.totalOutstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    ₹{Number(data.totalOutstanding || 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="rounded-xl p-3 bg-slate-50 border border-slate-100">
                  <p className="text-[10px] uppercase font-medium text-slate-500">Invoices</p>
                  <p className="text-xl font-bold text-slate-900">{data.invoices?.length || 0}</p>
                </div>
              </div>
            </div>

            {payError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
                {payError}
              </div>
            )}

            {/* Invoices */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" /> Your Invoices
              </p>
              {(!data.invoices || data.invoices.length === 0) ? (
                <p className="text-sm text-slate-400 text-center py-4">No invoices found for this number.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.invoices.map((inv: any) => {
                    const due = Number(inv.amountDue) || 0
                    const paid = Number(inv.amountPaid) || 0
                    const isPaid = due <= 0
                    return (
                      <div key={inv.id} className="border border-slate-100 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-slate-900">{inv.number}</p>
                            <p className="text-[10px] text-slate-500">
                              {inv.date ? new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                              {Number(inv.grandTotal) > 0 ? ` • ₹${Number(inv.grandTotal).toLocaleString('en-IN')}` : ''}
                            </p>
                            {paid > 0 && <p className="text-[10px] text-emerald-600">Paid ₹{paid.toLocaleString('en-IN')}</p>}
                          </div>
                          {isPaid ? (
                            <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Paid ✓
                            </span>
                          ) : (
                            <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">
                              Due ₹{due.toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                        {!isPaid && (
                          <button
                            onClick={() => handlePay(inv.id)}
                            disabled={payingInvoice === inv.id}
                            className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                          >
                            {payingInvoice === inv.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <QrCode className="w-3.5 h-3.5" />
                            )}
                            {payingInvoice === inv.id ? 'Creating payment link…' : `Pay ₹${due.toLocaleString('en-IN')} Online`}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Warranty */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" /> Warranty Status
              </p>
              {(!data.warranty || data.warranty.length === 0) ? (
                <p className="text-sm text-slate-400 text-center py-4">No warranty-tracked items on this number.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.warranty.map((w: any, i: number) => {
                    const statusCfg: Record<string, { label: string; cls: string }> = {
                      active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                      expiring: { label: 'Expiring soon', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                      expired: { label: 'Expired', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
                      none: { label: 'No warranty', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
                    }
                    const cfg = statusCfg[w.warrantyStatus] || statusCfg.none
                    return (
                      <div key={i} className="border border-slate-100 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{w.itemName}</p>
                            <p className="text-[10px] text-slate-500 font-mono truncate">{w.serialNumber}</p>
                          </div>
                          <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                        </div>
                        {w.warrantyExpiry && (
                          <p className="text-[10px] text-slate-500 mt-1">
                            {w.warrantyDays > 0 ? `${w.warrantyDays}-day warranty` : 'Warranty'} valid until{' '}
                            <strong>{new Date(w.warrantyExpiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                          </p>
                        )}
                        {w.invoiceNumber && <p className="text-[10px] text-slate-400 mt-0.5">Invoice: {w.invoiceNumber}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* AMC */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-violet-600" /> AMC Contracts
              </p>
              {(!data.amc || data.amc.length === 0) ? (
                <p className="text-sm text-slate-400 text-center py-4">No AMC contracts on this number.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.amc.map((a: any, i: number) => {
                    const statusCfg: Record<string, { label: string; cls: string }> = {
                      active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                      expiring: { label: 'Expiring soon', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                      expired: { label: 'Expired', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
                    }
                    const cfg = statusCfg[a.status] || statusCfg.active
                    return (
                      <div key={i} className="border border-slate-100 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-slate-900">{a.contractNumber}</p>
                            {a.devicesCovered && a.devicesCovered.length > 0 && (
                              <p className="text-[10px] text-slate-500 truncate">
                                {a.devicesCovered.map((d: any) => typeof d === 'string' ? d : (d?.name || d?.device || '')).filter(Boolean).join(', ')}
                              </p>
                            )}
                          </div>
                          <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[10px] text-slate-500">
                          {a.endDate && (
                            <span>
                              Valid till{' '}
                              <strong>{new Date(a.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                            </span>
                          )}
                          {a.frequency && <span className="capitalize">{a.frequency}</span>}
                          {a.fee > 0 && <span>₹{Number(a.fee).toLocaleString('en-IN')}</span>}
                          <span>Visits: {a.visitsUsed}/{a.visitsIncluded}</span>
                        </div>
                        {a.status === 'expiring' && (
                          <p className="text-[10px] text-amber-600 mt-1">Your AMC is expiring soon — visit the shop to renew.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Shop contact */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-900 mb-3">Contact Shop</p>
              <div className="space-y-2">
                {data.shop?.phone && (
                  <a href={`tel:${data.shop.phone}`} className="flex items-center gap-2 text-sm text-slate-700 hover:text-indigo-600">
                    <Phone className="w-4 h-4 text-indigo-500" /> {data.shop.phone}
                  </a>
                )}
                {data.shop?.email && (
                  <a href={`mailto:${data.shop.email}`} className="flex items-center gap-2 text-sm text-slate-700 hover:text-indigo-600">
                    <Mail className="w-4 h-4 text-indigo-500" /> {data.shop.email}
                  </a>
                )}
                {data.shop?.address && (
                  <div className="flex items-start gap-2 text-sm text-slate-700">
                    <MapPin className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" /> {data.shop.address}
                  </div>
                )}
              </div>
              {data.shop?.phone && (
                <a
                  href={`https://wa.me/${data.shop.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <MessageSquare className="w-4 h-4" /> Chat on WhatsApp
                </a>
              )}
            </div>

            <p className="text-center text-[10px] text-slate-500 pt-1 pb-4">
              Powered by {data.shop?.name || 'Smart Computers'} · Customer Self-Service Portal
            </p>
          </>
        )}
      </div>
    </div>
  )
}