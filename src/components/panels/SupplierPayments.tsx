'use client'

import { useState, useMemo } from 'react'
import { useFetch, apiPost } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/calc'
import { Plus, Wallet, AlertCircle, CheckCircle2, IndianRupee } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function SupplierPaymentsPanel() {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPO, setSelectedPO] = useState<any | null>(null)
  const [payAmount, setPayAmount] = useState(0)
  const [payMode, setPayMode] = useState('Cash')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payNotes, setPayNotes] = useState('')
  const [payRef, setPayRef] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: payments, loading, refetch } = useFetch<any[]>('/api/supplier-payments', undefined)
  const { data: pos } = useFetch<any[]>('/api/purchase-orders', undefined)

  // POs with pending payables (received but not paid)
  const pendingPOs = useMemo(() => {
    return (pos || []).filter((p) =>
      String(p.status) === 'received' &&
      (Number(p.amountDue) || 0) > 0
    )
  }, [pos])

  const totalPayable = pendingPOs.reduce((s, p) => s + (Number(p.amountDue) || 0), 0)
  const totalPaid = (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)

  const openPayDialog = (po: any) => {
    setSelectedPO(po)
    setPayAmount(Number(po.amountDue) || 0)
    setPayMode('Cash')
    setPayDate(new Date().toISOString().slice(0, 10))
    setPayNotes('')
    setPayRef('')
    setDialogOpen(true)
  }

  const handlePay = async () => {
    if (!selectedPO) return
    if (payAmount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await apiPost('/api/supplier-payments', {
        poId: selectedPO.id,
        amount: payAmount,
        mode: payMode,
        date: payDate,
        notes: payNotes,
        reference: payRef,
      })
      toast({
        title: 'Payment recorded ✓',
        description: `Rs.${formatCurrency(payAmount)} to ${selectedPO.supplierName}`,
        duration: 4000,
      })
      setDialogOpen(false)
      refetch()
    } catch (e: any) {
      toast({ title: 'Payment failed', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 flex-shrink-0" />
            <span className="truncate">Supplier Payments</span>
            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
              {payments?.length || 0} payments
            </Badge>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Settle supplier payables from received purchase orders
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <p className="text-xs font-medium text-slate-600">Total Payable</p>
            </div>
            <p className="text-2xl font-bold text-orange-700">Rs.{formatCurrency(totalPayable)}</p>
            <p className="text-[10px] text-slate-500 mt-1">{pendingPOs.length} pending POs</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <p className="text-xs font-medium text-slate-600">Total Paid</p>
            </div>
            <p className="text-2xl font-bold text-green-700">Rs.{formatCurrency(totalPaid)}</p>
            <p className="text-[10px] text-slate-500 mt-1">{payments?.length || 0} settlements</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <IndianRupee className="w-4 h-4 text-blue-600" />
              <p className="text-xs font-medium text-slate-600">Net Payable</p>
            </div>
            <p className="text-2xl font-bold text-blue-700">Rs.{formatCurrency(Math.max(0, totalPayable))}</p>
            <p className="text-[10px] text-slate-500 mt-1">Outstanding to suppliers</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending POs */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-600" />
            Pending Payables ({pendingPOs.length})
          </h2>
          {pendingPOs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No pending supplier payments. All POs are paid! ✓</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">PO Number</TableHead>
                  <TableHead className="text-xs">Supplier</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Due</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPOs.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="text-xs font-mono font-bold">{po.poNumber}</TableCell>
                    <TableCell className="text-xs">{po.supplierName}</TableCell>
                    <TableCell className="text-xs text-right">Rs.{formatCurrency(po.grandTotal)}</TableCell>
                    <TableCell className="text-xs text-right font-bold text-orange-600">Rs.{formatCurrency(po.amountDue)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" className="h-7 bg-orange-600 hover:bg-orange-700 text-xs" onClick={() => openPayDialog(po)}>
                        <IndianRupee className="w-3 h-3 mr-1" /> Pay
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Payment History</h2>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading...</p>
          ) : (!payments || payments.length === 0) ? (
            <p className="text-sm text-slate-400 text-center py-4">No supplier payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">PO</TableHead>
                  <TableHead className="text-xs">Supplier</TableHead>
                  <TableHead className="text-xs">Mode</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(payments || []).slice(0, 20).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{new Date(p.date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell className="text-xs font-mono">{p.poNumber}</TableCell>
                    <TableCell className="text-xs">{p.supplierName}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{p.mode}</Badge></TableCell>
                    <TableCell className="text-xs text-right font-bold">Rs.{formatCurrency(p.amount)}</TableCell>
                    <TableCell className="text-xs text-right text-slate-500">Rs.{formatCurrency(p.remainingDue || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pay Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="w-5 h-5 text-orange-600" />
              Settle Supplier Payment
            </DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-slate-500">PO: <span className="font-mono font-bold text-slate-900">{selectedPO.poNumber}</span></p>
                <p className="text-xs text-slate-500">Supplier: <span className="font-bold text-slate-900">{selectedPO.supplierName}</span></p>
                <p className="text-xs text-slate-500">Total Due: <span className="font-bold text-orange-600">Rs.{formatCurrency(selectedPO.amountDue)}</span></p>
              </div>
              <div>
                <Label className="text-xs font-medium">Payment Amount (Rs.)</Label>
                <Input type="number" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} className="mt-1" max={selectedPO.amountDue} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-medium">Mode</Label>
                  <Select value={payMode} onValueChange={setPayMode}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Bank">Bank Transfer</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium">Date</Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium">Reference (optional)</Label>
                <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="UTR / Cheque no." className="mt-1" />
              </div>
              <div>
                <Label className="text-xs font-medium">Notes (optional)</Label>
                <Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Any notes..." className="mt-1 h-16" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePay} disabled={saving} className="bg-orange-600 hover:bg-orange-700">
              {saving ? 'Saving...' : `Pay Rs.${formatCurrency(payAmount)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
