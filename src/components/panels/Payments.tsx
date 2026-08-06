'use client'

import { useState, useMemo } from 'react'
import { useFetch, apiPost, apiDelete } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/calc'
import { Plus, Wallet, TrendingUp, Trash2, Search, AlertCircle, MessageCircle, CreditCard, Loader2 } from 'lucide-react'

export function PaymentsPanel() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    type: 'cash',
    notes: '',
    reference: '',
  })

  const { data: invoices, loading: invLoading, refetch: refetchInv } = useFetch<any[]>(
    `/api/invoices?limit=200`,
    undefined
  )
  const { data: payments, loading: payLoading, refetch: refetchPay } = useFetch<any[]>(
    `/api/payments?limit=200`,
    undefined
  )

  const pendingInvoices = useMemo(() => {
    return (invoices || []).filter(
      (i) => i.paymentStatus === 'unpaid' || i.paymentStatus === 'partial'
    )
  }, [invoices])

  const filteredPending = useMemo(() => {
    return pendingInvoices.filter((i) => {
      if (!search) return true
      const q = search.toLowerCase()
      return String(i?.number || '').toLowerCase().includes(q) || String(i?.customer?.name || i?.customerName || '').toLowerCase().includes(q)
    })
  }, [pendingInvoices, search])

  const filteredPayments = useMemo(() => {
    return (payments || []).filter((p) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        String(p?.invoice?.number || p?.invoiceNumber || '').toLowerCase().includes(q) ||
        String(p?.invoice?.customer?.name || p?.customerName || '').toLowerCase().includes(q) ||
        String(p?.type || '').toLowerCase().includes(q)
      )
    })
  }, [payments, search])

  const totalDue = useMemo(() => pendingInvoices.reduce((s, i) => s + (Number(i.amountDue) || 0), 0), [pendingInvoices])
  
  const todayPayments = useMemo(() => {
    const todayStr = new Date().toDateString()
    return (payments || []).filter(
      (p) => new Date(p?.date || Date.now()).toDateString() === todayStr
    )
  }, [payments])

  const todayTotal = useMemo(() => {
    return todayPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  }, [todayPayments])

  const handleAddPayment = (invoice: any) => {
    setSelectedInvoice(invoice)
    setPaymentForm({
      amount: invoice.amountDue,
      type: 'cash',
      notes: '',
      reference: '',
    })
    setDialogOpen(true)
  }

  const handleSavePayment = async () => {
    if (!selectedInvoice) return
    if (paymentForm.amount <= 0) {
      toast({ title: 'Amount must be greater than 0', variant: 'destructive' })
      return
    }
    if (saving) return // double-click / double-submit guard
    setSaving(true)
    try {
      await apiPost('/api/payments', {
        invoiceId: selectedInvoice.id,
        ...paymentForm,
      })
      toast({ title: 'Payment recorded' })
      setDialogOpen(false)
      refetchInv()
      refetchPay()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleReminder = async (invoice: any) => {
    try {
      const res = await apiPost('/api/whatsapp/send', {
        action: 'paymentReminder',
        invoiceId: invoice.id,
      })
      window.open(res.link, '_blank')
      toast({ title: 'WhatsApp reminder opened' })
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  const handleDeletePayment = async (id: string) => {
    if (!confirm('Delete this payment? Invoice balance will be restored.')) return
    try {
      await apiDelete(`/api/payments/${id}`)
      toast({ title: 'Payment deleted' })
      refetchInv()
      refetchPay()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Track cash, credit, and collections</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-medium text-slate-600 uppercase">Total Outstanding</span>
              <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-orange-600 truncate">{formatCurrency(totalDue)}</p>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-1">{pendingInvoices.length} pending invoices</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-medium text-slate-600 uppercase">Today's Collections</span>
              <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-emerald-600 truncate">{formatCurrency(todayTotal)}</p>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-1">{todayPayments.length} payments today</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-medium text-slate-600 uppercase">Total Payments (Recent)</span>
              <Wallet className="w-4 h-4 text-violet-500 flex-shrink-0" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-violet-600 truncate">
              {formatCurrency((payments || []).reduce((s, p) => s + p.amount, 0))}
            </p>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-1">{payments?.length || 0} total payments</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-1 flex-shrink-0">
              <Button
                size="sm"
                variant={tab === 'pending' ? 'default' : 'ghost'}
                onClick={() => setTab('pending')}
                className={tab === 'pending' ? 'bg-slate-900 text-white h-9' : 'h-9'}
              >
                Pending ({pendingInvoices.length})
              </Button>
              <Button
                size="sm"
                variant={tab === 'history' ? 'default' : 'ghost'}
                onClick={() => setTab('history')}
                className={tab === 'history' ? 'bg-slate-900 text-white h-9' : 'h-9'}
              >
                History
              </Button>
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-11"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile: Pending invoices cards */}
      {tab === 'pending' && (
        <div className="sm:hidden space-y-3">
          {invLoading ? (
            <Card><CardContent className="text-center py-8 text-slate-500">Loading...</CardContent></Card>
          ) : filteredPending.length === 0 ? (
            <Card><CardContent className="text-center py-8 text-slate-500">
              <Wallet className="w-12 h-12 mx-auto mb-2 text-emerald-300" />
              All payments cleared!
            </CardContent></Card>
          ) : (
            filteredPending.map((inv) => (
              <Card key={inv.id} className="border-slate-200">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 text-sm truncate">{inv?.customer?.name || inv?.customerName || 'Walk-in'}</p>
                      <p className="text-[10px] text-slate-500">{inv.number} · {new Date(inv?.date || Date.now()).toLocaleDateString('en-IN')}</p>
                    </div>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] flex-shrink-0">
                      {inv.paymentStatus}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                    <div>
                      <p className="text-[9px] text-slate-500">Total</p>
                      <p className="font-medium">{formatCurrency(inv.grandTotal)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500">Paid</p>
                      <p className="font-medium text-emerald-600">{formatCurrency(inv.amountPaid)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500">Due</p>
                      <p className="font-semibold text-red-600">{formatCurrency(inv.amountDue)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => handleAddPayment(inv)} className="bg-emerald-600 hover:bg-emerald-700 flex-1 h-9">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Pay
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleReminder(inv)} className="h-9 w-9 p-0">
                      <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Mobile: Payment history cards */}
      {tab === 'history' && (
        <div className="sm:hidden space-y-3">
          {payLoading ? (
            <Card><CardContent className="text-center py-8 text-slate-500">Loading...</CardContent></Card>
          ) : filteredPayments.length === 0 ? (
            <Card><CardContent className="text-center py-8 text-slate-500">
              <CreditCard className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              No payment history
            </CardContent></Card>
          ) : (
            filteredPayments.map((p) => (
              <Card key={p.id} className="border-slate-200">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 text-sm">{p.invoice.number}</p>
                      <p className="text-[10px] text-slate-500 truncate">{p?.invoice?.customer?.name || p?.customerName || ''}</p>
                      <p className="text-[9px] text-slate-400">{new Date(p?.date || Date.now()).toLocaleDateString('en-IN')} · {new Date(p?.date || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 flex-shrink-0" onClick={() => handleDeletePayment(p.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <Badge variant="outline" className={
                      p.type === 'cash' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px]'
                      : p.type === 'upi' ? 'bg-violet-50 text-violet-700 border-violet-200 text-[9px]'
                      : p.type === 'bank' ? 'bg-blue-50 text-blue-700 border-blue-200 text-[9px]'
                      : 'bg-slate-50 text-slate-700 border-slate-200 text-[9px]'
                    }>{p.type}</Badge>
                    <p className="text-base font-bold text-emerald-600">+{formatCurrency(p.amount)}</p>
                  </div>
                  {(p.reference || p.notes) && (
                    <p className="text-[10px] text-slate-500 mt-1 truncate">{p.reference || p.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Desktop tables */}
      <Card className="border-slate-200 hidden sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {tab === 'pending' ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                    <TableHead className="text-center">Type</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-slate-500">Loading...</TableCell>
                    </TableRow>
                  ) : filteredPending.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                        <Wallet className="w-12 h-12 mx-auto mb-2 text-emerald-300" />
                        All payments cleared!
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPending.map((inv) => (
                      <TableRow key={inv.id} className="hover:bg-slate-50">
                        <TableCell className="font-medium">{inv.number}</TableCell>
                        <TableCell className="text-sm">{new Date(inv?.date || Date.now()).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{inv?.customer?.name || inv?.customerName || 'Walk-in'}</p>
                            {inv?.customer?.phone && (
                              <p className="text-[10px] text-slate-500">{inv.customer.phone}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(inv.grandTotal)}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-600">{formatCurrency(inv.amountPaid)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold text-red-600">{formatCurrency(inv.amountDue)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px]">{inv.paymentType}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                            {inv.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" onClick={() => handleAddPayment(inv)} className="bg-emerald-600 hover:bg-emerald-700">
                              <Plus className="w-3.5 h-3.5 mr-1" /> Pay
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReminder(inv)}
                              title="WhatsApp Reminder"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-500">Loading...</TableCell>
                    </TableRow>
                  ) : filteredPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                        <CreditCard className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                        No payment history
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPayments.map((p) => (
                      <TableRow key={p.id} className="hover:bg-slate-50">
                        <TableCell className="text-sm">
                          {new Date(p?.date || Date.now()).toLocaleDateString('en-IN')}
                          <div className="text-[10px] text-slate-500">
                            {new Date(p?.date || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{p.invoice.number}</TableCell>
                        <TableCell className="text-sm">{p?.invoice?.customer?.name || p?.customerName || ''}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">
                          +{formatCurrency(p.amount)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              p.type === 'cash' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                              : p.type === 'upi' ? 'bg-violet-50 text-violet-700 border-violet-200 text-[10px]'
                              : p.type === 'bank' ? 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]'
                              : 'bg-slate-50 text-slate-700 border-slate-200 text-[10px]'
                            }
                          >
                            {p.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{p.reference || p.notes || '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleDeletePayment(p.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[100dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Record Payment</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-lg space-y-1">
                <div className="flex justify-between text-xs sm:text-sm gap-2">
                  <span className="text-slate-600 flex-shrink-0">Invoice:</span>
                  <span className="font-medium text-right truncate">{selectedInvoice.number}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm gap-2">
                  <span className="text-slate-600 flex-shrink-0">Customer:</span>
                  <span className="font-medium text-right truncate">{selectedInvoice?.customer?.name || selectedInvoice?.customerName || 'Walk-in'}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm gap-2">
                  <span className="text-slate-600 flex-shrink-0">Grand Total:</span>
                  <span className="font-medium">{formatCurrency(selectedInvoice.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm gap-2">
                  <span className="text-slate-600 flex-shrink-0">Already Paid:</span>
                  <span className="font-medium text-emerald-600">{formatCurrency(selectedInvoice.amountPaid)}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm border-t pt-1 mt-1 gap-2">
                  <span className="text-slate-600 font-medium flex-shrink-0">Due Amount:</span>
                  <span className="font-bold text-red-600">{formatCurrency(selectedInvoice.amountDue)}</span>
                </div>
              </div>

              <div>
                <Label>Payment Amount (Rs.)</Label>
                <Input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Payment Type</Label>
                <Select
                  value={paymentForm.type}
                  onValueChange={(v) => setPaymentForm({ ...paymentForm, type: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reference (Transaction ID / Cheque No.)</Label>
                <Input
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  placeholder="Optional"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Input
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="Optional"
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleSavePayment} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
