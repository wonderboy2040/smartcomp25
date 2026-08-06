'use client'

import { useState, useMemo } from 'react'
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
import { formatCurrency } from '@/lib/calc'

import { FileText, Plus, Trash2, Edit3, RefreshCw, Wrench } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expiring: 'bg-amber-50 text-amber-700 border-amber-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
}

export function AMCPanel() {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)

  const { data: contracts, loading, refetch } = useFetch<any[]>('/api/amc', undefined)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this AMC contract?')) return
    try {
      await apiDelete(`/api/amc/${id}`)
      toast({ title: 'Contract deleted' })
      refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  const handleLogVisit = async (c: any) => {
    // Prompt for fresh visit notes instead of silently re-using the contract's
    // existing notes (which would overwrite visit history with stale data).
    // window.prompt returns null on Cancel, '' on OK-empty.
    let visitNotes = ''
    if (typeof window !== 'undefined') {
      const prompted = window.prompt(
        `Log a service visit for ${c.customerName}?\nVisits used: ${c.visitsUsed}/${c.visitsIncluded}\n\nVisit notes (optional):`,
        ''
      )
      if (prompted === null) return // user cancelled
      visitNotes = prompted
    }
    try {
      await apiPut(`/api/amc/${c.id}`, { action: 'logVisit', notes: visitNotes })
      toast({ title: 'Visit logged', description: `Visits: ${Number(c.visitsUsed || 0) + 1}/${c.visitsIncluded}` })
      refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  const handleRenew = async (c: any) => {
    if (!confirm(`Renew contract ${c.contractNumber}?\nEnd date will extend by 1 ${c.frequency} period.`)) return
    try {
      await apiPut(`/api/amc/${c.id}`, { action: 'renew', fee: c.fee })
      toast({ title: 'Contract renewed!' })
      refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  const handleEdit = (c: any) => { setEditing(c); setDialogOpen(true) }
  const handleAdd = () => { setEditing(null); setDialogOpen(true) }

  const monthlyFee = (c: any) => {
    const fee = Number(c.fee) || 0
    switch (c.frequency) {
      case 'monthly': return fee
      case 'quarterly': return fee / 3
      case 'half-yearly': return fee / 6
      case 'yearly': return fee / 12
      default: return fee
    }
  }

  const stats = useMemo(() => {
    const list = contracts || []
    return {
      total: list.length,
      active: list.filter((c) => c.dynamicStatus === 'active').length,
      expiring: list.filter((c) => c.dynamicStatus === 'expiring').length,
      expired: list.filter((c) => c.dynamicStatus === 'expired').length,
      totalFee: list.filter((c) => c.dynamicStatus === 'active').reduce((s, c) => s + monthlyFee(c), 0),
    }
  }, [contracts])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
            <span className="truncate">AMC Contracts</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Annual Maintenance Contracts — offices, schools, recurring revenue
          </p>
        </div>
        <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 h-11">
          <Plus className="w-4 h-4 mr-1.5" /> <span className="hidden sm:inline">New Contract</span><span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
        <Card className="border-slate-200"><CardContent className="p-3">
          <p className="text-[10px] text-slate-500 uppercase">Total</p>
          <p className="text-lg font-bold text-slate-900">{stats.total}</p>
        </CardContent></Card>
        <Card className="border-emerald-200 bg-emerald-50"><CardContent className="p-3">
          <p className="text-[10px] text-emerald-700 uppercase">Active</p>
          <p className="text-lg font-bold text-emerald-700">{stats.active}</p>
        </CardContent></Card>
        <Card className="border-amber-200 bg-amber-50"><CardContent className="p-3">
          <p className="text-[10px] text-amber-700 uppercase">Expiring</p>
          <p className="text-lg font-bold text-amber-700">{stats.expiring}</p>
        </CardContent></Card>
        <Card className="border-red-200 bg-red-50"><CardContent className="p-3">
          <p className="text-[10px] text-red-700 uppercase">Expired</p>
          <p className="text-lg font-bold text-red-700">{stats.expired}</p>
        </CardContent></Card>
        <Card className="border-slate-200"><CardContent className="p-3">
          <p className="text-[10px] text-slate-500 uppercase">Monthly Revenue</p>
          <p className="text-lg font-bold text-emerald-600">{formatCurrency(stats.totalFee)}</p>
        </CardContent></Card>
      </div>

      {/* Contracts table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Contract</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Period</TableHead>
                  <TableHead className="text-xs text-right">Fee</TableHead>
                  <TableHead className="text-xs text-center hidden sm:table-cell">Visits</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">Loading...</TableCell></TableRow>
                ) : !contracts || contracts.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    No AMC contracts yet. Create one for recurring revenue.
                  </TableCell></TableRow>
                ) : (
                  contracts.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.contractNumber}</TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{c.customerName}</p>
                        <p className="text-[10px] text-slate-500">{c.customerPhone}</p>
                      </TableCell>
                      <TableCell className="text-xs hidden sm:table-cell">
                        <p>{c.startDate ? new Date(c.startDate).toLocaleDateString('en-IN') : '-'}</p>
                        <p className="text-slate-400">to {c.endDate ? new Date(c.endDate).toLocaleDateString('en-IN') : '-'}</p>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm">{formatCurrency(c.fee)}</TableCell>
                      <TableCell className="text-center text-xs hidden sm:table-cell">
                        {c.visitsIncluded > 0 ? `${c.visitsUsed}/${c.visitsIncluded}` : 'Unlimited'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`text-[9px] ${STATUS_COLORS[c.dynamicStatus] || ''}`}>
                          {c.dynamicStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {c.dynamicStatus === 'active' && (
                            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => handleLogVisit(c)} title="Log Visit">
                              <Wrench className="w-3.5 h-3.5 text-blue-600" />
                            </Button>
                          )}
                          {(c.dynamicStatus === 'expiring' || c.dynamicStatus === 'expired') && (
                            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => handleRenew(c)} title="Renew">
                              <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEdit(c)}>
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDelete(c.id)}>
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
        <ContractDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => { setDialogOpen(false); refetch() }} />
      )}
    </div>
  )
}

function ContractDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: any | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    customerId: editing?.customerId || '',
    customerName: editing?.customerName || '',
    customerPhone: editing?.customerPhone || '',
    customerAddress: editing?.customerAddress || '',
    devices: editing?.devicesCovered?.map((d: any) => d.name || d).join('\n') || '',
    startDate: editing?.startDate ? new Date(editing.startDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    fee: editing?.fee || 0,
    frequency: editing?.frequency || 'yearly',
    visitsIncluded: editing?.visitsIncluded || 12,
    notes: editing?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.customerName) {
      toast({ title: 'Customer name required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const devices = form.devices.split('\n').map((s) => s.trim()).filter(Boolean).map((name) => ({ name }))
      const payload = { ...form, devicesCovered: devices }
      if (editing) {
        await apiPut(`/api/amc/${editing.id}`, { action: 'update', ...payload })
        toast({ title: 'Contract updated' })
      } else {
        await apiPost('/api/amc', payload)
        toast({ title: 'Contract created' })
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
            <FileText className="w-5 h-5 text-blue-600" />
            {editing ? 'Edit Contract' : 'New AMC Contract'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Customer Name *</Label>
              <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="h-10" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} className="h-10" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Address</Label>
            <Textarea value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Devices Covered (one per line)</Label>
            <Textarea value={form.devices} onChange={(e) => setForm({ ...form, devices: e.target.value })} rows={3} placeholder={'HP Laptop\nDell Desktop\nCanon Printer'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="h-10" />
            </div>
            <div>
              <Label className="text-xs">Fee (Rs.)</Label>
              <Input type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })} className="h-10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="half-yearly">Half-Yearly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Visits Included</Label>
              <Input type="number" value={form.visitsIncluded} onChange={(e) => setForm({ ...form, visitsIncluded: Number(e.target.value) })} className="h-10" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? 'Saving...' : (editing ? 'Update' : 'Create Contract')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
