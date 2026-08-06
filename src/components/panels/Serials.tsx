'use client'

import { useState, useEffect } from 'react'
import { useFetch, apiPost, apiPut, apiDelete } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'

import { Package, Plus, Trash2, Edit3, Search, Shield, ShieldCheck, ShieldAlert } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  in_stock: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sold: 'bg-blue-50 text-blue-700 border-blue-200',
  returned: 'bg-amber-50 text-amber-700 border-amber-200',
  rma: 'bg-red-50 text-red-700 border-red-200',
}

export function SerialsPanel() {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const query = `/api/item-serials${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}${statusFilter !== 'all' ? `${debouncedSearch ? '&' : '?'}status=${statusFilter}` : ''}`
  const { data, loading, refetch } = useFetch<any>(query, undefined)

  const serials = data?.serials || []
  const summary = data?.summary || { total: 0, inStock: 0, sold: 0, warrantyActive: 0, expiringSoon: 0, expired: 0 }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this serial number?')) return
    try {
      await apiDelete(`/api/item-serials/${id}`)
      toast({ title: 'Serial deleted' })
      refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  const handleEdit = (s: any) => { setEditing(s); setDialogOpen(true) }
  const handleAdd = () => { setEditing(null); setDialogOpen(true) }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 flex-shrink-0" />
            <span className="truncate">Serial Numbers & Warranty</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Track laptop/processor serials, warranty cards, and RMA
          </p>
        </div>
        <Button onClick={handleAdd} className="bg-indigo-600 hover:bg-indigo-700 h-11">
          <Plus className="w-4 h-4 mr-1.5" /> <span className="hidden sm:inline">Add Serial</span><span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 sm:gap-3">
        <Card className="border-slate-200"><CardContent className="p-3">
          <p className="text-[10px] text-slate-500 uppercase">Total</p>
          <p className="text-lg font-bold text-slate-900">{summary.total}</p>
        </CardContent></Card>
        <Card className="border-emerald-200 bg-emerald-50"><CardContent className="p-3">
          <p className="text-[10px] text-emerald-700 uppercase">In Stock</p>
          <p className="text-lg font-bold text-emerald-700">{summary.inStock}</p>
        </CardContent></Card>
        <Card className="border-blue-200 bg-blue-50"><CardContent className="p-3">
          <p className="text-[10px] text-blue-700 uppercase">Sold</p>
          <p className="text-lg font-bold text-blue-700">{summary.sold}</p>
        </CardContent></Card>
        <Card className="border-slate-200"><CardContent className="p-3">
          <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Active</p>
          <p className="text-lg font-bold text-slate-700">{summary.warrantyActive}</p>
        </CardContent></Card>
        <Card className="border-amber-200 bg-amber-50"><CardContent className="p-3">
          <p className="text-[10px] text-amber-700 uppercase flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Expiring</p>
          <p className="text-lg font-bold text-amber-700">{summary.expiringSoon}</p>
        </CardContent></Card>
        <Card className="border-red-200 bg-red-50"><CardContent className="p-3">
          <p className="text-[10px] text-red-700 uppercase flex items-center gap-1"><Shield className="w-3 h-3" /> Expired</p>
          <p className="text-lg font-bold text-red-700">{summary.expired}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
          <Input placeholder="Search serial, item, customer, invoice..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44 h-11"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="sold">Sold</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
            <SelectItem value="rma">RMA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Serial Number</TableHead>
                  <TableHead className="text-xs">Item</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Customer / Invoice</TableHead>
                  <TableHead className="text-xs text-center hidden sm:table-cell">Warranty</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">Loading...</TableCell></TableRow>
                ) : serials.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    <Package className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    No serials yet. Add serials for laptops, processors, and other tracked items.
                  </TableCell></TableRow>
                ) : (
                  serials.map((s: any) => (
                    <TableRow key={s.id} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-xs font-medium">{s.serialNumber}</TableCell>
                      <TableCell className="text-sm">{s.itemName || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`text-[9px] ${STATUS_COLORS[s.status] || ''}`}>
                          {s.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs hidden sm:table-cell">
                        {s.customerName ? (
                          <div>
                            <p className="font-medium">{s.customerName}</p>
                            {s.invoiceNumber && <p className="text-slate-400">{s.invoiceNumber}</p>}
                          </div>
                        ) : <span className="text-slate-300">-</span>}
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        {s.warrantyStatus === 'active' && <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 text-[9px]"><ShieldCheck className="w-3 h-3 mr-0.5" />Active</Badge>}
                        {s.warrantyStatus === 'expiring' && <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 text-[9px]"><ShieldAlert className="w-3 h-3 mr-0.5" />Expiring</Badge>}
                        {s.warrantyStatus === 'expired' && <Badge className="bg-red-50 text-red-700 hover:bg-red-50 text-[9px]"><Shield className="w-3 h-3 mr-0.5" />Expired</Badge>}
                        {s.warrantyStatus === 'none' && <span className="text-slate-300 text-[10px]">-</span>}
                        {s.warrantyExpiry && (
                          <p className="text-[9px] text-slate-400 mt-0.5">{new Date(s.warrantyExpiry).toLocaleDateString('en-IN')}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEdit(s)}>
                            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDelete(s.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {dialogOpen && (
        <SerialDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => { setDialogOpen(false); refetch() }} />
      )}
    </div>
  )
}

function SerialDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: any | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    itemId: editing?.itemId || '',
    itemName: editing?.itemName || '',
    serialNumber: editing?.serialNumber || '',
    serialNumbers: '', // for bulk add (newline-separated)
    warrantyDays: editing?.warrantyDays || 365,
    costPrice: editing?.costPrice || 0,
    status: editing?.status || 'in_stock',
    notes: editing?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [bulkMode, setBulkMode] = useState(!editing)

  const submit = async () => {
    if (bulkMode && !form.serialNumbers.trim()) {
      toast({ title: 'Enter at least one serial number', variant: 'destructive' })
      return
    }
    if (!bulkMode && !form.serialNumber.trim()) {
      toast({ title: 'Enter serial number', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await apiPut(`/api/item-serials/${editing.id}`, {
          serialNumber: form.serialNumber,
          warrantyDays: form.warrantyDays,
          costPrice: form.costPrice,
          status: form.status,
          notes: form.notes,
        })
        toast({ title: 'Serial updated' })
      } else {
        const payload: any = {
          itemId: form.itemId,
          itemName: form.itemName,
          warrantyDays: form.warrantyDays,
          costPrice: form.costPrice,
          notes: form.notes,
        }
        if (bulkMode) {
          payload.serialNumbers = form.serialNumbers.split('\n').map((s: string) => s.trim()).filter(Boolean)
        } else {
          payload.serialNumber = form.serialNumber
        }
        const res = await apiPost('/api/item-serials', payload)
        toast({ title: `${res.count} serial(s) added` })
      }
      onSaved()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[100dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            {editing ? 'Edit Serial' : 'Add Serial Number(s)'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!editing && (
            <>
              <div className="flex gap-2">
                <button
                  onClick={() => setBulkMode(false)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium ${!bulkMode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  Single
                </button>
                <button
                  onClick={() => setBulkMode(true)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium ${bulkMode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  Bulk (multiple)
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Item Name *</Label>
                  <Input value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} placeholder="e.g., HP Laptop 15s" className="h-10" />
                </div>
                <div>
                  <Label className="text-xs">Item ID (optional)</Label>
                  <Input value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} placeholder="Links to stock item" className="h-10" />
                </div>
              </div>
            </>
          )}

          {editing ? (
            <div>
              <Label className="text-xs">Serial Number *</Label>
              <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className="h-10 font-mono" />
            </div>
          ) : bulkMode ? (
            <div>
              <Label className="text-xs">Serial Numbers (one per line) *</Label>
              <Textarea
                value={form.serialNumbers}
                onChange={(e) => setForm({ ...form, serialNumbers: e.target.value })}
                placeholder={'SN001\nSN002\nSN003'}
                rows={5}
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-slate-400 mt-1">Each line = one serial number</p>
            </div>
          ) : (
            <div>
              <Label className="text-xs">Serial Number *</Label>
              <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} placeholder="e.g., 5CD1234ABC" className="h-10 font-mono" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Warranty (days)</Label>
              <Input type="number" value={form.warrantyDays} onChange={(e) => setForm({ ...form, warrantyDays: Number(e.target.value) })} className="h-10" />
            </div>
            <div>
              <Label className="text-xs">Cost Price (Rs.)</Label>
              <Input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} className="h-10" />
            </div>
          </div>

          {editing && (
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                  <SelectItem value="rma">RMA (Return to Supplier)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? 'Saving...' : (editing ? 'Update' : 'Add Serial(s)')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
