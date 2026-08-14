'use client'

import { useState, useEffect, useMemo } from 'react'
import { useFetch, apiPost, apiPut } from '@/lib/api'
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
import { Plus, Trash2, Send, PackageCheck, Boxes, IndianRupee } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function PurchaseOrdersPanel() {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)

  const { data: posRaw, loading, refetch } = useFetch<any[]>('/api/purchase-orders', undefined)
  const { data: suppliers } = useFetch<any[]>('/api/suppliers?active=true', undefined)
  const { data: items } = useFetch<any[]>('/api/items', undefined)

  const pos = useMemo(() => (posRaw || []).filter((p) => !p.deleted), [posRaw])
  const supplierMap = useMemo(() => new Map((suppliers || []).map((s: any) => [s.id, s])), [suppliers])

  const incomingCount = pos.filter((p) => String(p.status) === 'sent' || String(p.status) === 'ordered').length

  const handleAdd = () => { setEditing(null); setDialogOpen(true) }
  const handleEdit = (po: any) => { setEditing(po); setDialogOpen(true) }

  const handleReceive = async (po: any) => {
    if (!confirm(`Receive goods for ${po.poNumber}? Stock will be added and supplier payable created.`)) return
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/receive`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Receive failed')
      const updated = data?.data || data
      toast({
        title: 'Goods received ✓',
        description: `${updated?.stockItemsAdded || 0} items added to stock • Payable Rs.${formatCurrency(data?.payableAmount || updated?.payableAmount || 0)}`,
        duration: 5000,
      })
      refetch()
    } catch (e: any) {
      toast({ title: 'Receive failed', description: e.message, variant: 'destructive', duration: 6000 })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PackageCheck className="w-5 h-5 sm:w-6 sm:h-6 text-violet-600 flex-shrink-0" />
            <span className="truncate">Purchase Orders</span>
            <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">
              {pos.length} total
            </Badge>
            {incomingCount > 0 && (
              <Badge className="bg-amber-500 text-white text-[10px]">{incomingCount} incoming</Badge>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Create PO → WhatsApp supplier → receive goods → auto stock-in + supplier payable
          </p>
        </div>
        <Button onClick={handleAdd} className="bg-violet-600 hover:bg-violet-700 text-white h-11">
          <Plus className="w-4 h-4 mr-1.5" /> New Purchase Order
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Card className="border-violet-200 bg-violet-50/50">
          <CardContent className="p-3 flex items-center gap-2">
            <Boxes className="w-4 h-4 text-violet-600" />
            <div className="min-w-0">
              <p className="text-[10px] text-violet-600 uppercase font-medium">Draft</p>
              <p className="text-base font-bold text-violet-900">{pos.filter((p) => p.status === 'draft').length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-3 flex items-center gap-2">
            <Send className="w-4 h-4 text-amber-600" />
            <div className="min-w-0">
              <p className="text-[10px] text-amber-600 uppercase font-medium">Ordered</p>
              <p className="text-base font-bold text-amber-900">{incomingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-3 flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-emerald-600" />
            <div className="min-w-0">
              <p className="text-[10px] text-emerald-600 uppercase font-medium">Received</p>
              <p className="text-base font-bold text-emerald-900">{pos.filter((p) => p.status === 'received').length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3 flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-slate-600" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-600 uppercase font-medium">Unpaid Payables</p>
              <p className="text-base font-bold text-slate-900">
                {formatCurrency(pos.filter((p) => p.status === 'received' && Number(p.amountDue || 0) > 0).reduce((s, p) => s + Number(p.amountDue || 0), 0))}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Desktop table */}
      <Card className="border-slate-200 hidden sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">Loading...</TableCell></TableRow>
                ) : pos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      <PackageCheck className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      No purchase orders yet. Create your first PO to send to a supplier.
                    </TableCell>
                  </TableRow>
                ) : (
                  pos.map((po) => {
                    const sup = supplierMap.get(String(po.supplierId || ''))
                    const isSent = po.status === 'sent' || po.status === 'ordered'
                    const isReceived = po.status === 'received'
                    return (
                      <TableRow key={po.id} className="hover:bg-slate-50">
                        <TableCell>
                          <p className="font-mono text-sm font-semibold text-slate-900">{po.poNumber}</p>
                          {po.notes && <p className="text-[10px] text-slate-400 truncate max-w-[160px]">{po.notes}</p>}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-slate-900">{sup?.name || po.supplierName || '-'}</p>
                          <p className="text-[10px] text-slate-500">{sup?.whatsappNumber || sup?.phone || ''}</p>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {po.date ? new Date(po.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                        </TableCell>
                        <TableCell className="text-right text-sm">{Number(po.itemCount || 0)}</TableCell>
                        <TableCell className="text-right text-sm font-bold text-slate-900">{formatCurrency(po.grandTotal)}</TableCell>
                        <TableCell className="text-center">
                          {isReceived ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Received</Badge>
                          ) : isSent ? (
                            <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Ordered</Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-500 text-[10px]">Draft</Badge>
                          )}
                          {isReceived && Number(po.amountDue) > 0 && (
                            <p className="text-[10px] text-red-500 mt-0.5">Due: {formatCurrency(po.amountDue)}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!isReceived && (
                              <Button size="sm" variant="ghost" className="text-emerald-600" title="Receive goods (GRN)" onClick={() => handleReceive(po)}>
                                <PackageCheck className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {!isReceived && (
                              <Button size="sm" variant="ghost" className="text-blue-600" title="Edit" onClick={() => handleEdit(po)}>
                                <Plus className="w-3.5 h-3.5" />
                              </Button>
                            )}
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

      {/* Mobile list */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <Card><CardContent className="text-center py-8 text-slate-500">Loading...</CardContent></Card>
        ) : pos.length === 0 ? (
          <Card><CardContent className="text-center py-8 text-slate-500">
            <PackageCheck className="w-12 h-12 mx-auto mb-2 text-slate-300" />
            No purchase orders yet.
          </CardContent></Card>
        ) : (
          pos.map((po) => {
            const sup = supplierMap.get(String(po.supplierId || ''))
            const isReceived = po.status === 'received'
            const isSent = po.status === 'sent' || po.status === 'ordered'
            return (
              <Card key={po.id} className="border-slate-200">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-bold text-slate-900">{po.poNumber}</p>
                      <p className="text-xs text-slate-500">{sup?.name || po.supplierName || '-'}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {!isReceived && (
                        <Button size="sm" variant="ghost" className="text-emerald-600 h-8 w-8 p-0" onClick={() => handleReceive(po)}>
                          <PackageCheck className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {!isReceived && (
                        <Button size="sm" variant="ghost" className="text-blue-600 h-8 w-8 p-0" onClick={() => handleEdit(po)}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-slate-500">{formatCurrency(po.grandTotal)} • {Number(po.itemCount || 0)} items</span>
                    {isReceived ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px]">Received</Badge>
                    ) : isSent ? (
                      <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[9px]">Ordered</Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-500 text-[9px]">Draft</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      <PODialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        suppliers={suppliers || []}
        items={items || []}
        onSaved={() => {
          setDialogOpen(false)
          refetch()
        }}
      />
    </div>
  )
}

function PODialog({
  open, onOpenChange, editing, suppliers, items, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: any | null
  suppliers: any[]
  items: any[]
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<any>({})
  const [lineItems, setLineItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [sendWhatsApp, setSendWhatsApp] = useState(true)

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          supplierId: editing.supplierId || '',
          date: editing.date ? editing.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
          notes: editing.notes || '',
        })
        try {
          const parsed = typeof editing.itemsJson === 'string' ? JSON.parse(editing.itemsJson) : (editing.itemsJson || [])
          setLineItems(Array.isArray(parsed) ? parsed : [])
        } catch { setLineItems([]) }
      } else {
        setForm({
          supplierId: '',
          date: new Date().toISOString().slice(0, 10),
          notes: '',
        })
        setLineItems([])
      }
      setSendWhatsApp(true)
    }
  }, [open, editing])

  const grandTotal = useMemo(() => lineItems.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.costPrice) || 0), 0), [lineItems])

  const handleAddLine = () => {
    setLineItems([...lineItems, { itemId: '', name: '', quantity: 1, costPrice: 0 }])
  }

  const updateLine = (idx: number, updates: any) => {
    setLineItems(lineItems.map((l, i) => (i === idx ? { ...l, ...updates } : l)))
  }

  const removeLine = (idx: number) => {
    setLineItems(lineItems.filter((_, i) => i !== idx))
  }

  const handleItemSelect = (idx: number, itemId: string) => {
    const item = items.find((i: any) => i.id === itemId)
    updateLine(idx, {
      itemId,
      name: item?.name || '',
      costPrice: Number(item?.costPrice) || 0,
    })
  }

  const handleSave = async () => {
    if (!form.supplierId) {
      toast({ title: 'Select a supplier', variant: 'destructive' })
      return
    }
    if (lineItems.length === 0) {
      toast({ title: 'Add at least one line item', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        supplierId: form.supplierId,
        date: form.date,
        notes: form.notes,
        itemsJson: JSON.stringify(lineItems),
        sendWhatsApp: sendWhatsApp,
      }
      if (editing) {
        await apiPut(`/api/purchase-orders/${editing.id}`, payload)
        toast({ title: 'PO updated ✓', duration: 3500 })
      } else {
        const created = await apiPost('/api/purchase-orders', payload)
        toast({
          title: created?.whatsappLink ? 'Purchase Order created & sent ✓' : 'Purchase Order created ✓',
          description: created?.whatsappLink ? 'Opening WhatsApp to supplier…' : 'Saved as draft',
          duration: 4000,
        })
        if (created?.whatsappLink && typeof window !== 'undefined') {
          window.open(created.whatsappLink, '_blank', 'noopener,noreferrer')
        }
      }
      onSaved()
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive', duration: 6000 })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-violet-600" />
            {editing ? `Edit ${editing.poNumber}` : 'New Purchase Order'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Label>Supplier *</Label>
            <Select value={form.supplierId || 'none'} onValueChange={(v) => setForm({ ...form, supplierId: v === 'none' ? '' : v })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Supplier</SelectItem>
                {suppliers.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} {s.company ? `(${s.company})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" />
          </div>
        </div>

        {/* Line items */}
        <div className="border-2 border-slate-200 rounded-xl overflow-hidden bg-white">
          <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b">
            <span className="text-sm font-bold text-slate-900">Items ({lineItems.length})</span>
            <Button type="button" size="sm" variant="outline" onClick={handleAddLine} className="h-8">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
            </Button>
          </div>
          {lineItems.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">
              <Boxes className="w-10 h-10 mx-auto mb-2 text-slate-200" />
              No items yet — add lines for the items you want to order.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lineItems.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 p-2 items-center">
                  <div className="col-span-5">
                    <Select value={line.itemId || 'none'} onValueChange={(v) => handleItemSelect(idx, v === 'none' ? '' : v)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select item / or custom name" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((item: any) => (
                          <SelectItem key={item.id} value={item.id} className="text-xs">
                            {item.name} • Stock: {item.quantity}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={line.name || ''}
                      onChange={(e) => updateLine(idx, { name: e.target.value })}
                      placeholder="Custom item name (if not from stock)"
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] text-slate-500">Qty</Label>
                    <Input type="number" min={1} value={line.quantity || 1} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} className="h-9 text-center" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] text-slate-500">Cost Rs</Label>
                    <Input type="number" value={line.costPrice || 0} onChange={(e) => updateLine(idx, { costPrice: Number(e.target.value) })} className="h-9 text-center" />
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-xs text-slate-400">Total</p>
                    <p className="text-sm font-bold text-slate-900">{formatCurrency((Number(line.quantity) || 0) * (Number(line.costPrice) || 0))}</p>
                  </div>
                  <div className="col-span-1 text-right">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500" onClick={() => removeLine(idx)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {lineItems.length > 0 && (
            <div className="flex justify-end items-center gap-3 px-3 py-2 bg-slate-50 border-t">
              <span className="text-sm font-bold text-slate-900">Grand Total: {formatCurrency(grandTotal)}</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Notes (optional)</Label>
          <Textarea
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Delivery instructions, terms, expected date..."
            rows={2}
            className="resize-y"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={sendWhatsApp} onChange={(e) => setSendWhatsApp(e.target.checked)} className="rounded" />
          Send to supplier via WhatsApp after saving
        </label>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white w-full sm:w-auto">
            {saving ? 'Saving...' : editing ? 'Update PO' : 'Create PO'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}