'use client'

import { useState, useMemo, useCallback } from 'react'
import { useFetch, apiPost, apiDelete } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, sumBy } from '@/lib/calc'
import { usePdfPreview } from '@/lib/preview-context'
import { DocForm } from './DocForm'
import { Plus, Search, FileText, Eye, Edit3, Share2, Trash2, Download, IndianRupee, Wallet, TrendingUp, AlertTriangle, Loader2 } from 'lucide-react'
import { shareWhatsAppPdf } from '@/lib/whatsapp'
import { toCSV, downloadCSV } from '@/lib/utils'

export function InvoicesPanel() {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { openPreview } = usePdfPreview()

  const { data: invoices, loading, refetch } = useFetch<any[]>('/api/invoices?limit=200', undefined)

  // v11.2: quick "Record Payment" from the invoice list itself
  const [payTarget, setPayTarget] = useState<any | null>(null)
  const [payAmount, setPayAmount] = useState<number>(0)
  const [payType, setPayType] = useState('Cash')
  const [paySaving, setPaySaving] = useState(false)

  const openQuickPay = useCallback((inv: any) => {
    setPayTarget(inv)
    setPayAmount(Number(inv.amountDue) || 0)
    setPayType('Cash')
  }, [])

  const submitQuickPay = useCallback(async () => {
    if (!payTarget) return
    const amt = Number(payAmount) || 0
    if (amt <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' })
      return
    }
    if (amt > (Number(payTarget.amountDue) || 0)) {
      toast({ title: `Amount exceeds balance due (Rs.${(Number(payTarget.amountDue) || 0).toFixed(2)})`, variant: 'destructive' })
      return
    }
    setPaySaving(true)
    try {
      await apiPost('/api/payments', {
        invoiceId: payTarget.id,
        amount: amt,
        type: payType,
        date: new Date().toISOString(),
        notes: 'Payment recorded from invoice list',
      })
      toast({ title: `Payment of Rs.${amt.toLocaleString('en-IN')} recorded ✓`, description: payTarget.number })
      setPayTarget(null)
      refetch()
    } catch (e: any) {
      toast({ title: 'Payment failed', description: e?.message, variant: 'destructive', duration: 6000 })
    } finally {
      setPaySaving(false)
    }
  }, [payTarget, payAmount, payType, refetch, toast])

  const filtered = useMemo(() => {
    return (invoices || []).filter((inv) => {
      if (statusFilter !== 'all' && inv.paymentStatus !== statusFilter) return false
      if (typeFilter !== 'all' && inv.paymentType !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return String(inv?.number || '').toLowerCase().includes(q) || String(inv?.customer?.name || inv?.customerName || '').toLowerCase().includes(q) || String(inv?.customer?.phone || inv?.customerPhone || '').includes(q)
      }
      return true
    })
  }, [invoices, statusFilter, typeFilter, search])

  // ===== Summary stats for the current filter =====
  const summary = useMemo(() => {
    const total = filtered.length
    const totalValue = sumBy(filtered, (i) => i.grandTotal)
    const totalDue = sumBy(filtered, (i) => i.amountDue)
    const totalProfit = sumBy(filtered, (i) => i.profit)
    const paidCount = filtered.filter((i) => i.paymentStatus === 'paid').length
    const overdue = filtered.filter((i) => {
      if (i.paymentStatus === 'paid') return false
      const d = new Date(i?.date || Date.now())
      const ageDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
      return ageDays > 30
    })
    return { total, totalValue, totalDue, totalProfit, paidCount, overdueCount: overdue.length, overdueValue: sumBy(overdue, (i) => i.amountDue) }
  }, [filtered])

  const handleCreate = useCallback(() => { setEditing(null); setDialogOpen(true) }, [])
  const handleEdit = useCallback((invoice: any) => { setEditing(invoice); setDialogOpen(true) }, [])

  const handleShareWhatsApp = useCallback(async (invoice: any) => {
    await shareWhatsAppPdf({
      docId: invoice.id,
      docType: 'invoice',
      docNumber: String(invoice.number || ''),
      customerName: String(invoice.customer?.name || invoice.customerName || 'Customer'),
      customerPhone: String(invoice.customerPhone || invoice.customer?.phone || invoice.phone || invoice.mobile || ''),
      grandTotal: Number(invoice.grandTotal) || 0,
      amountDue: Number(invoice.amountDue) || 0,
      notes: invoice.notes,
      toast,
      gstMode: invoice.gstMode === 'non-gst' ? 'non-gst' : 'gst',
    })
  }, [toast])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this invoice? Stock will be restored and customer credit adjusted.')) return
    try {
      await apiDelete(`/api/invoices/${id}`)
      toast({ title: 'Invoice deleted ✓', description: 'Removed locally - syncing to cloud', duration: 3500 })
      refetch()
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive', duration: 6000 })
    }
  }, [refetch, toast])

  // ===== Bulk selection helpers =====
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === filtered.length) return new Set()
      return new Set(filtered.map((i) => i.id))
    })
  }, [filtered])
  const clearSelection = useCallback(() => setSelected(new Set()), [])

  // Bulk WhatsApp share — iterates through selected invoices sequentially
  const handleBulkWhatsApp = useCallback(async () => {
    if (selected.size === 0) return
    if (!confirm(`Send ${selected.size} invoice(s) on WhatsApp one by one?`)) return
    const items = filtered.filter((i) => selected.has(i.id))
    for (const inv of items) {
      await handleShareWhatsApp(inv)
      // small gap so each wa.me tab opens separately
      await new Promise((r) => setTimeout(r, 800))
    }
    toast({ title: `Sent ${items.length} invoices to WhatsApp ✓`, duration: 4000 })
    clearSelection()
  }, [selected, filtered, handleShareWhatsApp, toast, clearSelection])

  // CSV export — current filtered list (or selected subset)
  const handleExportCSV = useCallback((onlySelected: boolean = false) => {
    const rows = (onlySelected ? filtered.filter((i) => selected.has(i.id)) : filtered).map((i) => ({
      Number: i.number,
      Date: i.date ? new Date(i.date).toLocaleDateString('en-IN') : '',
      Customer: i.customer?.name || i.customerName || 'Walk-in',
      Phone: i.customer?.phone || i.customerPhone || '',
      Subtotal: Number(i.subtotal || 0).toFixed(2),
      GST: Number(i.gstAmount || 0).toFixed(2),
      GrandTotal: Number(i.grandTotal || 0).toFixed(2),
      AmountPaid: Number(i.amountPaid || 0).toFixed(2),
      AmountDue: Number(i.amountDue || 0).toFixed(2),
      Profit: Number(i.profit || 0).toFixed(2),
      PaymentType: i.paymentType || '',
      Status: i.paymentStatus || '',
    }))
    if (rows.length === 0) {
      toast({ title: 'Nothing to export', variant: 'destructive' })
      return
    }
    const csv = toCSV(rows)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCSV(csv, `invoices-${onlySelected ? 'selected' : 'all'}-${stamp}.csv`)
    toast({ title: `Exported ${rows.length} invoices ✓`, duration: 3000 })
  }, [filtered, selected, toast])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            Invoices <span className="text-[10px] px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full font-bold">10 Premium GST Templates • A4 Perfect</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Create GST invoices - Professional A4 printable - 10 premium designs - HSN summary - UPI QR</p>
        </div>
        <Button onClick={handleCreate} className="bg-slate-900 hover:bg-slate-800 h-11 font-bold"><Plus className="w-4 h-4 mr-1.5" /> New Invoice</Button>
      </div>

      {/* ===== Summary stat cards (filtered view) ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center"><IndianRupee className="w-4 h-4 text-indigo-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Total Value</p>
                <p className="text-sm sm:text-base font-bold text-slate-900 truncate">{formatCurrency(summary.totalValue)}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{summary.total} invoice(s)</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center"><Wallet className="w-4 h-4 text-orange-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Outstanding</p>
                <p className="text-sm sm:text-base font-bold text-orange-700 truncate">{formatCurrency(summary.totalDue)}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{summary.paidCount} paid</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Profit</p>
                <p className={`text-sm sm:text-base font-bold truncate ${summary.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(summary.totalProfit)}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{summary.totalValue > 0 ? `${((summary.totalProfit / summary.totalValue) * 100).toFixed(1)}% margin` : '—'}</p>
          </CardContent>
        </Card>
        <Card className={`border-slate-200 bg-white ${summary.overdueCount > 0 ? 'ring-2 ring-red-200' : ''}`}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Overdue &gt;30d</p>
                <p className="text-sm sm:text-base font-bold text-red-700 truncate">{formatCurrency(summary.overdueValue)}</p>
              </div>
            </div>
            <p className="text-[10px] text-red-500 mt-1">{summary.overdueCount} invoice(s)</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
              <Input placeholder="Search number, customer, phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11 bg-white border-slate-200" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36 h-11 bg-white border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-36 h-11 bg-white border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
              </SelectContent>
            </Select>
            {/* Export buttons */}
            <Button variant="outline" size="sm" onClick={() => handleExportCSV(false)} className="h-11 border-slate-200" title="Export filtered list to CSV">
              <Download className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
            {selected.size > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleExportCSV(true)} className="h-11 border-indigo-200 bg-indigo-50 text-indigo-700" title="Export selected rows">
                <Download className="w-3.5 h-3.5 mr-1" /> Selected ({selected.size})
              </Button>
            )}
            {selected.size > 0 && (
              <Button size="sm" onClick={handleBulkWhatsApp} className="h-11 bg-green-600 hover:bg-green-700" title="Share selected invoices on WhatsApp">
                <Share2 className="w-3.5 h-3.5 mr-1" /> WhatsApp
              </Button>
            )}
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSelection} className="h-11">Clear</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mobile card layout */}
      <div className="sm:hidden space-y-3">
        {loading ? <Card><CardContent className="text-center py-8 text-slate-600">Loading...</CardContent></Card> : filtered.length === 0 ? <Card><CardContent className="text-center py-8 text-slate-500"><FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />No invoices</CardContent></Card> : filtered.map((inv) => (
          <Card key={inv.id} className={`border-slate-200 bg-white ${selected.has(inv.id) ? 'ring-2 ring-indigo-300' : ''}`}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <Checkbox checked={selected.has(inv.id)} onCheckedChange={() => toggleSelect(inv.id)} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 text-sm">{inv.number}</p>
                    <p className="text-[10px] text-slate-500">{new Date(inv?.date || Date.now()).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 bg-white border" onClick={() => openPreview(inv.id, 'invoice', `Invoice ${inv.number}`, inv.gstMode === 'non-gst' ? 'non-gst' : 'gst')}><Eye className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 bg-white border" onClick={() => handleEdit(inv)}><Edit3 className="w-3.5 h-3.5 text-blue-600" /></Button>
                  {inv.paymentStatus !== 'paid' && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 bg-emerald-50 border border-emerald-200" title="Record payment" onClick={() => openQuickPay(inv)}><Wallet className="w-3.5 h-3.5 text-emerald-600" /></Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 bg-white border" onClick={() => handleShareWhatsApp(inv)}><Share2 className="w-3.5 h-3.5 text-green-600" /></Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 bg-white border" onClick={() => handleDelete(inv.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-800 mt-1 truncate">{inv?.customer?.name || inv?.customerName || 'Walk-in'}</p>
              <div className="flex items-center justify-between mt-2">
                <div>
                  <p className="text-base font-bold text-slate-900">{formatCurrency(inv.grandTotal)}</p>
                  <p className={`text-[10px] font-bold ${inv.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Profit: {formatCurrency(inv.profit)}</p>
                  {(inv.amountPaid > 0 || inv.amountDue > 0) && (
                    <p className="text-[9px] text-slate-500 mt-0.5">
                      <span className="text-emerald-600 font-bold">Paid: {formatCurrency(inv.amountPaid)}</span>
                      {inv.amountDue > 0 && <span className="text-red-500 font-bold"> • Due: {formatCurrency(inv.amountDue)}</span>}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline" className="bg-white text-slate-700 border-slate-200 text-[9px] font-bold">{inv.paymentType}</Badge>
                  <Badge variant="outline" className={`${inv.paymentStatus === 'paid' ? 'bg-green-50 text-green-700 border-green-200' : inv.paymentStatus === 'partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'} text-[9px] font-bold`}>{inv.paymentStatus}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="border-slate-200 bg-white hidden sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="font-bold text-slate-700">Invoice #</TableHead>
                  <TableHead className="font-bold text-slate-700">Date</TableHead>
                  <TableHead className="font-bold text-slate-700">Customer</TableHead>
                  <TableHead className="text-right font-bold text-slate-700">Total</TableHead>
                  <TableHead className="text-right font-bold text-slate-700">Paid / Due</TableHead>
                  <TableHead className="text-right font-bold text-slate-700">Profit</TableHead>
                  <TableHead className="text-center font-bold text-slate-700">Type</TableHead>
                  <TableHead className="text-center font-bold text-slate-700">Status</TableHead>
                  <TableHead className="text-right font-bold text-slate-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-600">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-500">No invoices</TableCell></TableRow>
                ) : filtered.map((inv) => (
                  <TableRow key={inv.id} className={`hover:bg-slate-50 ${selected.has(inv.id) ? 'bg-indigo-50/50' : ''}`}>
                    <TableCell><Checkbox checked={selected.has(inv.id)} onCheckedChange={() => toggleSelect(inv.id)} aria-label="Select" /></TableCell>
                    <TableCell className="font-bold text-slate-900">{inv.number}</TableCell>
                    <TableCell className="text-sm text-slate-700">{new Date(inv?.date || Date.now()).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>
                      <p className="text-sm font-bold text-slate-900">{inv?.customer?.name || inv?.customerName || 'Walk-in'}</p>
                      {inv?.customer?.phone && <p className="text-[10px] text-slate-500">{inv.customer.phone}</p>}
                    </TableCell>
                    <TableCell className="text-right font-bold text-slate-900">{formatCurrency(inv.grandTotal)}</TableCell>
                    <TableCell className="text-right text-xs">
                      <span className="font-bold text-emerald-600">{formatCurrency(inv.amountPaid)}</span>
                      {inv.amountDue > 0 && <span className="text-red-500 font-bold"> / {formatCurrency(inv.amountDue)}</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold"><span className={inv.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatCurrency(inv.profit)}</span></TableCell>
                    <TableCell className="text-center"><Badge variant="outline" className="bg-white text-slate-700 border-slate-200 text-[10px] font-bold">{inv.paymentType}</Badge></TableCell>
                    <TableCell className="text-center"><Badge variant="outline" className={`${inv.paymentStatus === 'paid' ? 'bg-green-50 text-green-700 border-green-200' : inv.paymentStatus === 'partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'} text-[10px] font-bold`}>{inv.paymentStatus}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" aria-label={`Preview invoice ${inv.number}`} onClick={() => openPreview(inv.id, 'invoice', `Invoice ${inv.number}`, inv.gstMode === 'non-gst' ? 'non-gst' : 'gst')} className="h-8 w-8 p-0 bg-white border hover:bg-slate-50"><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" aria-label={`Edit invoice ${inv.number}`} onClick={() => handleEdit(inv)} className="h-8 w-8 p-0 bg-white border hover:bg-blue-50"><Edit3 className="w-4 h-4 text-blue-600" /></Button>
                        {inv.paymentStatus !== 'paid' && (
                          <Button variant="ghost" size="sm" aria-label={`Record payment for ${inv.number}`} onClick={() => openQuickPay(inv)} className="h-8 w-8 p-0 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100" title={`Record payment (Due: ${formatCurrency(inv.amountDue)})`}><Wallet className="w-4 h-4 text-emerald-600" /></Button>
                        )}
                        <Button variant="ghost" size="sm" aria-label={`Share invoice ${inv.number} on WhatsApp`} onClick={() => handleShareWhatsApp(inv)} className="h-8 w-8 p-0 bg-white border hover:bg-green-50"><Share2 className="w-4 h-4 text-green-600" /></Button>
                        <Button variant="ghost" size="sm" aria-label={`Delete invoice ${inv.number}`} onClick={() => handleDelete(inv.id)} className="h-8 w-8 p-0 bg-white border hover:bg-red-50"><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <DocForm key={editing?.id || 'new'} open={dialogOpen} onOpenChange={setDialogOpen} docType="invoice" editing={editing} onSaved={() => { setDialogOpen(false); refetch() }} />

      {/* Quick Record Payment dialog */}
      <Dialog open={!!payTarget} onOpenChange={(o) => { if (!o) setPayTarget(null) }}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" /> Record Payment
            </DialogTitle>
            <DialogDescription className="text-xs">
              {payTarget ? (
                <>Invoice <strong>{payTarget.number}</strong> • {payTarget?.customer?.name || payTarget?.customerName || 'Walk-in'} • Due: <strong className="text-red-600">{formatCurrency(payTarget.amountDue)}</strong></>
              ) : 'Select an invoice'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold">Amount (Rs.)</Label>
              <Input
                type="number"
                value={payAmount || ''}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                placeholder="0"
                className="mt-1 h-11 bg-white font-bold text-base"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Payment Type</Label>
              <Select value={payType} onValueChange={setPayType}>
                <SelectTrigger className="mt-1 bg-white h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Wallet'].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={submitQuickPay} disabled={paySaving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11 font-bold">
                {paySaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : <><Wallet className="w-4 h-4 mr-2" /> Record Payment</>}
              </Button>
              <Button variant="outline" onClick={() => setPayTarget(null)} className="h-11">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
