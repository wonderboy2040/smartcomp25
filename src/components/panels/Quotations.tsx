'use client'

import { useState, useMemo, useCallback } from 'react'
import { useFetch, apiPost, apiDelete } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Plus, Search, FileText, Eye, Trash2, Share2, FileCheck2, Edit3, Download, IndianRupee, CheckCircle2, Percent, Loader2, Wallet, Boxes } from 'lucide-react'
import { shareWhatsAppPdf } from '@/lib/whatsapp'
import { toCSV, downloadCSV } from '@/lib/utils'

export function QuotationsPanel() {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const { openPreview } = usePdfPreview()

  const { data: quotations, loading, refetch } = useFetch<any[]>(
    `/api/quotations?limit=200`,
    undefined
  )

  const filtered = useMemo(() => {
    return (quotations || []).filter((q) => {
      if (statusFilter !== 'all' && q.status !== statusFilter) return false
      if (search) {
        const s = search.toLowerCase()
        return (
          q.number.toLowerCase().includes(s) ||
          String(q?.customer?.name || q?.customerName || '').toLowerCase().includes(s) ||
          String(q?.customer?.phone || q?.customerPhone || '').includes(s)
        )
      }
      return true
    })
  }, [quotations, statusFilter, search])

  // ===== Summary stats =====
  const summary = useMemo(() => {
    const total = filtered.length
    const totalValue = sumBy(filtered, (q) => q.grandTotal)
    const converted = filtered.filter((q) => q.status === 'converted').length
    const accepted = filtered.filter((q) => q.status === 'accepted' || q.status === 'converted').length
    const conversionRate = total > 0 ? (converted / total) * 100 : 0
    return { total, totalValue, converted, accepted, conversionRate }
  }, [filtered])

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast({ title: 'Nothing to export', variant: 'destructive' })
      return
    }
    const rows = filtered.map((q) => ({
      Number: q.number,
      Date: q.date ? new Date(q.date).toLocaleDateString('en-IN') : '',
      ValidTill: q.validTill ? new Date(q.validTill).toLocaleDateString('en-IN') : '',
      Customer: q.customer?.name || q.customerName || 'Walk-in',
      Phone: q.customer?.phone || q.customerPhone || '',
      GrandTotal: Number(q.grandTotal || 0).toFixed(2),
      Status: q.status || '',
    }))
    const csv = toCSV(rows)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCSV(csv, `quotations-${stamp}.csv`)
    toast({ title: `Exported ${rows.length} quotations ✓`, duration: 3000 })
  }

  const handleCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const handleEdit = (q: any) => {
    setEditing(q)
    setDialogOpen(true)
  }

  const handleShareWhatsApp = async (q: any) => {
    await shareWhatsAppPdf({
      docId: q.id,
      docType: 'quotation',
      docNumber: String(q.number || ''),
      customerName: String(q.customer?.name || q.customerName || 'Customer'),
      customerPhone: String(q.customerPhone || q.customer?.phone || q.phone || q.mobile || ''),
      grandTotal: Number(q.grandTotal) || 0,
      notes: q.notes,
      toast,
      gstMode: q.gstMode === 'non-gst' ? 'non-gst' : 'gst',
    })
  }

  // v11.3: advanced convert — optional payment at conversion + stock toggle
  const [convertTarget, setConvertTarget] = useState<any | null>(null)
  const [convertPaid, setConvertPaid] = useState<number>(0)
  const [convertType, setConvertType] = useState('Cash')
  const [convertDeductStock, setConvertDeductStock] = useState(true)
  const [convertSaving, setConvertSaving] = useState(false)

  const openConvert = useCallback((q: any) => {
    setConvertTarget(q)
    setConvertPaid(0)
    setConvertType('Cash')
    setConvertDeductStock(true)
  }, [])

  const submitConvert = useCallback(async () => {
    if (!convertTarget) return
    const paid = Math.max(0, Number(convertPaid) || 0)
    if (paid > (Number(convertTarget.grandTotal) || 0)) {
      toast({ title: 'Amount exceeds quotation total', variant: 'destructive' })
      return
    }
    setConvertSaving(true)
    try {
      const res = await apiPost(`/api/quotations/${convertTarget.id}`, {
        action: 'convert',
        amountPaid: paid,
        paymentType: convertType,
        deductStock: convertDeductStock,
      })
      toast({
        title: 'Converted to invoice ✓',
        description: `Invoice: ${res.invoiceNumber}${paid > 0 ? ` • Paid: Rs.${paid.toLocaleString('en-IN')}` : ''}`,
        duration: 4500,
      })
      setConvertTarget(null)
      refetch()
    } catch (e: any) {
      toast({
        title: 'Conversion failed',
        description: e.message,
        variant: 'destructive',
        duration: 6000,
      })
    } finally {
      setConvertSaving(false)
    }
  }, [convertTarget, convertPaid, convertType, convertDeductStock, refetch, toast])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this quotation?')) return
    try {
      await apiDelete(`/api/quotations/${id}`)
      toast({
        title: 'Quotation deleted ✓',
        description: 'Removed locally - syncing to cloud',
        duration: 3500,
      })
      refetch()
    } catch (e: any) {
      toast({
        title: 'Delete failed',
        description: e.message,
        variant: 'destructive',
        duration: 6000,
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Quotations</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Create quotes and convert to invoices</p>
        </div>
        <Button onClick={handleCreate} className="bg-slate-900 hover:bg-slate-800 h-11">
          <Plus className="w-4 h-4 mr-1.5" /> <span className="hidden sm:inline">New Quotation</span><span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* ===== Summary stat cards ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center"><IndianRupee className="w-4 h-4 text-cyan-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Pipeline Value</p>
                <p className="text-sm sm:text-base font-bold text-slate-900 truncate">{formatCurrency(summary.totalValue)}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{summary.total} quotation(s)</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Converted</p>
                <p className="text-sm sm:text-base font-bold text-emerald-700 truncate">{summary.converted}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{summary.accepted} accepted</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center"><Percent className="w-4 h-4 text-violet-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Conversion</p>
                <p className="text-sm sm:text-base font-bold text-violet-700 truncate">{summary.conversionRate.toFixed(1)}%</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Won / Total</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center"><FileText className="w-4 h-4 text-amber-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Pending</p>
                <p className="text-sm sm:text-base font-bold text-amber-700 truncate">{summary.total - summary.converted - summary.accepted}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Awaiting reply</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
              <Input
                placeholder="Search number, customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-11"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40 h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-11" title="Export filtered list to CSV">
              <Download className="w-3.5 h-3.5 mr-1" /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mobile card layout */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <Card><CardContent className="text-center py-8 text-slate-500">Loading...</CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="text-center py-8 text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
            No quotations found
          </CardContent></Card>
        ) : (
          filtered.map((q) => {
            const expired = new Date(q?.validTill || Date.now()) < new Date() && q.status === 'draft'
            return (
              <Card key={q.id} className="border-slate-200">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 text-sm">{q.number}</p>
                      <p className="text-[10px] text-slate-500">{new Date(q?.date || Date.now()).toLocaleDateString('en-IN')}</p>
                    </div>
                    <Badge variant="outline" className={
                      q.status === 'converted' ? 'bg-green-50 text-green-700 border-green-200 text-[9px]'
                      : q.status === 'accepted' ? 'bg-blue-50 text-blue-700 border-blue-200 text-[9px]'
                      : q.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200 text-[9px]'
                      : q.status === 'sent' ? 'bg-amber-50 text-amber-700 border-amber-200 text-[9px]'
                      : 'bg-slate-50 text-slate-700 border-slate-200 text-[9px]'
                    }>{q.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-700 mt-1 truncate">{q?.customer?.name || q?.customerName || 'Walk-in'}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <p className="text-base font-bold text-slate-900">{formatCurrency(q.grandTotal)}</p>
                      <p className="text-[10px] text-slate-500">
                        Valid: {new Date(q?.validTill || Date.now()).toLocaleDateString('en-IN')}
                        {expired && <span className="text-red-500 ml-1">Expired</span>}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {q.status !== 'converted' && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openConvert(q)}>
                          <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openPreview(q.id, 'quotation', `Quotation ${q.number}`, q.gstMode === 'non-gst' ? 'non-gst' : 'gst')}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEdit(q)} title="Edit Quotation">
                        <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleShareWhatsApp(q)}>
                        <Share2 className="w-3.5 h-3.5 text-green-600" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDelete(q.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Desktop table */}
      <Card className="border-slate-200 hidden sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Quotation #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Valid Till</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">Loading...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      No quotations found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((q) => {
                    const expired = new Date(q?.validTill || Date.now()) < new Date() && q.status === 'draft'
                    return (
                      <TableRow key={q.id} className="hover:bg-slate-50">
                        <TableCell className="font-medium text-slate-900">{q.number}</TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {new Date(q?.date || Date.now()).toLocaleDateString('en-IN')}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {new Date(q?.validTill || Date.now()).toLocaleDateString('en-IN')}
                          {expired && <span className="block text-[10px] text-red-500">Expired</span>}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{q?.customer?.name || q?.customerName || 'Walk-in'}</p>
                            {q?.customer?.phone && (
                              <p className="text-[10px] text-slate-500">{q.customer.phone}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(q.grandTotal)}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              q.status === 'converted' ? 'bg-green-50 text-green-700 border-green-200 text-[10px]'
                              : q.status === 'accepted' ? 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]'
                              : q.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200 text-[10px]'
                              : q.status === 'sent' ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                              : 'bg-slate-50 text-slate-700 border-slate-200 text-[10px]'
                            }
                          >
                            {q.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {q.status !== 'converted' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openConvert(q)}
                                title="Convert to Invoice"
                              >
                                <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPreview(q.id, 'quotation', `Quotation ${q.number}`, q.gstMode === 'non-gst' ? 'non-gst' : 'gst')}
                              title="View PDF"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(q)}
                              title="Edit Quotation"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleShareWhatsApp(q)}
                              title="Share on WhatsApp"
                            >
                              <Share2 className="w-3.5 h-3.5 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(q.id)}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <DocForm
        key={editing?.id || 'new'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        docType="quotation"
        editing={editing}
        onSaved={() => {
          setDialogOpen(false)
          refetch()
        }}
      />

      {/* Advanced Convert dialog — payment + stock options */}
      <Dialog open={!!convertTarget} onOpenChange={(o) => { if (!o) setConvertTarget(null) }}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-emerald-600" /> Convert to Invoice
            </DialogTitle>
            <DialogDescription className="text-xs">
              {convertTarget ? (
                <>{convertTarget.number} • {convertTarget?.customer?.name || convertTarget?.customerName || ''} • Total: <strong>{formatCurrency(convertTarget.grandTotal)}</strong></>
              ) : 'Select a quotation'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold">Payment Received Now (Rs.) — optional</Label>
              <Input
                type="number"
                value={convertPaid || ''}
                onChange={(e) => setConvertPaid(Number(e.target.value))}
                placeholder="0"
                className="mt-1 h-11 bg-white font-bold text-base"
              />
              {convertPaid > 0 && convertTarget && convertPaid < Number(convertTarget.grandTotal) && (
                <p className="text-[10px] text-amber-600 mt-1 font-medium">
                  Due Rs.{(Number(convertTarget.grandTotal) - convertPaid).toFixed(2)} customer credit me jayega
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold">Payment Type</Label>
              <Select value={convertType} onValueChange={setConvertType}>
                <SelectTrigger className="mt-1 bg-white h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Wallet'].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <Boxes className="w-4 h-4 text-slate-500" />
              <div className="flex-1">
                <Label className="text-xs font-semibold text-slate-700">Auto-deduct stock</Label>
                <p className="text-[10px] text-slate-500">Items stock se deduct honge (recommended)</p>
              </div>
              <input
                type="checkbox"
                checked={convertDeductStock}
                onChange={(e) => setConvertDeductStock(e.target.checked)}
                className="rounded w-4 h-4"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={submitConvert} disabled={convertSaving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11 font-bold">
                {convertSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Converting…</> : <><Wallet className="w-4 h-4 mr-2" /> Convert to Invoice</>}
              </Button>
              <Button variant="outline" onClick={() => setConvertTarget(null)} className="h-11">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
