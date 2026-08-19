'use client'

/**
 * Engineers Panel — v4.0
 *
 * Tracks in-house service engineers / technicians with complete financial
 * summary:
 *   - Personal info (name, phone, email, specialization, joined date)
 *   - Commission rate (% of gross profit on completed jobs + sold items)
 *   - Monthly salary (informational)
 *   - Service jobs assigned + completed
 *   - Service revenue + profit (from completed jobs)
 *   - Parts sold revenue + cost + profit (from parts on those jobs)
 *   - Items sold via Invoices (linked via engineerId on invoice)
 *   - Commission earned / paid / due
 *
 * The financial summary is computed SERVER-SIDE by /api/engineers (GET) so
 * the panel stays fast even with hundreds of jobs and invoices.
 */

import { useState, useMemo, useCallback } from 'react'
import { useFetch, apiPost, apiPut, apiDelete, invalidate, asArray } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, sumBy } from '@/lib/calc'
import { Wrench, Plus, Search, Pencil, Trash2, UserCog, Phone, Mail, IndianRupee, TrendingUp, Package, CheckCircle2, Clock, AlertTriangle, RefreshCw, Wallet } from 'lucide-react'

export function EngineersPanel() {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [detailEngineer, setDetailEngineer] = useState<any | null>(null)

  const { data: engineers, loading, refetch } = useFetch<any[]>('/api/engineers', undefined)

  const filtered = useMemo(() => {
    return (engineers || []).filter((e) => {
      if (filterStatus === 'active' && !e.active) return false
      if (filterStatus === 'inactive' && e.active) return false
      if (search) {
        const q = search.toLowerCase()
        return String(e?.name || '').toLowerCase().includes(q) ||
               String(e?.phone || '').includes(q) ||
               String(e?.specialization || '').toLowerCase().includes(q) ||
               String(e?.email || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [engineers, filterStatus, search])

  // Aggregate totals across all visible engineers
  const totals = useMemo(() => {
    const list = filtered
    return {
      engineers: list.length,
      active: list.filter((e) => e.active).length,
      jobsAssigned: sumBy(list, (e) => Number(e.jobsAssigned) || 0),
      jobsCompleted: sumBy(list, (e) => Number(e.jobsCompleted) || 0),
      serviceProfit: sumBy(list, (e) => Number(e.serviceProfit) || 0),
      partsProfit: sumBy(list, (e) => Number(e.partsProfit) || 0),
      grossProfit: sumBy(list, (e) => Number(e.grossProfit) || 0),
      commissionDue: sumBy(list, (e) => Number(e.commissionDue) || 0),
      commissionPaid: sumBy(list, (e) => Number(e.commissionPaid) || 0),
      itemsSold: sumBy(list, (e) => Number(e.itemsSold) || 0),
      itemsSoldRevenue: sumBy(list, (e) => Number(e.itemsSoldRevenue) || 0),
    }
  }, [filtered])

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Delete engineer "${name}"?\n\nExisting jobs assigned to this engineer will keep their assignment — only the engineer row is removed from the picker.`)) return
    try {
      await apiDelete(`/api/engineers/${id}`)
      toast({ title: 'Engineer removed ✓', description: `${name} no longer appears in pickers.` })
      invalidate('/api/engineers')
      refetch()
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' })
    }
  }, [toast, refetch])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserCog className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
            <span className="truncate">Engineers</span>
            <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">v4.0 Financial Tracking</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Track technicians with complete financial summary — jobs done, items sold, profit, commission.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true) }} className="bg-blue-600 hover:bg-blue-700 h-11">
          <Plus className="w-4 h-4 mr-1.5" /> <span className="hidden sm:inline">Add Engineer</span><span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <Card><CardContent className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-slate-600 uppercase">Active Engineers</span>
            <UserCog className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-slate-900">{totals.active}<span className="text-xs text-slate-500 font-medium ml-1">/ {totals.engineers}</span></p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-slate-600 uppercase">Gross Profit</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-emerald-600">{formatCurrency(totals.grossProfit)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-slate-600 uppercase">Commission Due</span>
            <Wallet className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-orange-600">{formatCurrency(totals.commissionDue)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-slate-600 uppercase">Jobs Completed</span>
            <CheckCircle2 className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-purple-600">{totals.jobsCompleted}<span className="text-xs text-slate-500 font-medium ml-1">/ {totals.jobsAssigned}</span></p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
          <Input placeholder="Search engineer name, phone, specialization..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11 bg-white" />
        </div>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as 'all' | 'active' | 'inactive')}>
          <SelectTrigger className="w-full sm:w-40 h-11 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Engineers</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Engineer table */}
      <Card className="hidden sm:block"><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Engineer</TableHead>
                <TableHead>Specialization</TableHead>
                <TableHead className="text-center">Jobs</TableHead>
                <TableHead className="text-right">Service Profit</TableHead>
                <TableHead className="text-right">Parts Profit</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-center">Comm %</TableHead>
                <TableHead className="text-right">Commission Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-600">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-600">
                  <UserCog className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  No engineers yet. Click "Add Engineer" to create the first one.
                </TableCell></TableRow>
              ) : filtered.map((e) => (
                <TableRow key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailEngineer(e)}>
                  <TableCell>
                    <div className="font-semibold text-slate-900">{e.name}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                      <Phone className="w-3 h-3" /> {e.phone || '—'}
                      {e.email && <><Mail className="w-3 h-3 ml-1" /> {e.email}</>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-700">{e.specialization || '—'}</TableCell>
                  <TableCell className="text-center">
                    <div className="font-bold text-slate-900">{e.jobsCompleted}</div>
                    <div className="text-[10px] text-slate-500">/ {e.jobsAssigned} assigned</div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-emerald-700">{formatCurrency(e.serviceProfit)}</TableCell>
                  <TableCell className="text-right font-semibold text-blue-700">{formatCurrency(e.partsProfit)}</TableCell>
                  <TableCell className="text-right font-bold text-slate-900">{formatCurrency(e.grossProfit)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-[10px] font-bold bg-amber-50 text-amber-700 border-amber-200">
                      {Number(e.commissionRate || 0)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(e.commissionDue) > 0 ? (
                      <div className="font-bold text-orange-600">{formatCurrency(e.commissionDue)}</div>
                    ) : (
                      <span className="text-[10px] text-slate-400">—</span>
                    )}
                    {Number(e.commissionPaid) > 0 && (
                      <div className="text-[10px] text-emerald-600">Paid: {formatCurrency(e.commissionPaid)}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-white" onClick={() => { setEditing(e); setDialogOpen(true) }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-white text-red-500" onClick={() => handleDelete(e.id, e.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {loading ? <Card><CardContent className="text-center py-8 text-slate-600">Loading...</CardContent></Card> :
         filtered.length === 0 ? <Card><CardContent className="text-center py-8 text-slate-600"><UserCog className="w-12 h-12 mx-auto mb-2 text-slate-300" />No engineers yet.</CardContent></Card> :
         filtered.map((e) => (
          <Card key={e.id} onClick={() => setDetailEngineer(e)} className="cursor-pointer">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 text-sm">{e.name}</p>
                  <p className="text-[10px] text-slate-500">{e.specialization || '—'}</p>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold bg-amber-50 text-amber-700 border-amber-200">{e.commissionRate}%</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-500">Jobs:</span> <span className="font-bold">{e.jobsCompleted}/{e.jobsAssigned}</span></div>
                <div><span className="text-slate-500">Profit:</span> <span className="font-bold text-emerald-700">{formatCurrency(e.grossProfit)}</span></div>
                <div><span className="text-slate-500">Comm Due:</span> <span className="font-bold text-orange-600">{formatCurrency(e.commissionDue)}</span></div>
                <div><span className="text-slate-500">Items Sold:</span> <span className="font-bold">{e.itemsSold}</span></div>
              </div>
              <div className="flex gap-1 mt-2">
                <Button size="sm" variant="outline" className="flex-1 h-8 bg-white text-xs" onClick={(ev) => { ev.stopPropagation(); setEditing(e); setDialogOpen(true) }}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-white text-red-500" onClick={(ev) => { ev.stopPropagation(); handleDelete(e.id, e.name) }}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {dialogOpen && (
        <EngineerDialog
          key={editing?.id || 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          onSaved={() => { setDialogOpen(false); invalidate('/api/engineers'); refetch() }}
        />
      )}

      {detailEngineer && (
        <EngineerDetailDialog
          engineer={detailEngineer}
          onClose={() => setDetailEngineer(null)}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Add / Edit dialog
// ────────────────────────────────────────────────────────────────────────────
function EngineerDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: any | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    name: editing?.name || '',
    phone: editing?.phone || '',
    email: editing?.email || '',
    specialization: editing?.specialization || '',
    commissionRate: Number(editing?.commissionRate ?? 0),
    salaryMonthly: Number(editing?.salaryMonthly ?? 0),
    active: editing?.active !== false && editing?.active !== 'false',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: 'Name and phone are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await apiPut(`/api/engineers/${editing.id}`, form)
        toast({ title: 'Engineer updated ✓' })
      } else {
        await apiPost('/api/engineers', form)
        toast({ title: 'Engineer added ✓' })
      }
      onSaved()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <UserCog className="w-5 h-5 text-blue-600" />
            {editing ? 'Edit Engineer' : 'Add Engineer'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Engineer name" className="h-10 bg-white mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Phone *</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile" className="h-10 bg-white mt-1" inputMode="tel" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" className="h-10 bg-white mt-1" inputMode="email" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Specialization</Label>
              <Input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} placeholder="e.g., Laptop Repair, Hardware" className="h-10 bg-white mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Commission Rate (%)</Label>
              <Input type="number" min={0} max={100} step={0.5} value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: Number(e.target.value) || 0 })} className="h-10 bg-white mt-1" />
              <p className="text-[10px] text-slate-500 mt-1">% of gross profit on completed jobs + sold items.</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Monthly Salary (Rs.)</Label>
              <Input type="number" min={0} value={form.salaryMonthly} onChange={(e) => setForm({ ...form, salaryMonthly: Number(e.target.value) || 0 })} className="h-10 bg-white mt-1" />
              <p className="text-[10px] text-slate-500 mt-1">Informational only — does not auto-post to expenses.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="eng-active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
            <label htmlFor="eng-active" className="text-xs text-slate-700">Active (appears in engineer pickers on Jobs / Invoices)</label>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-white">Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> Saving...</> : editing ? 'Update Engineer' : 'Add Engineer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Detail dialog — full financial breakdown for one engineer
// ────────────────────────────────────────────────────────────────────────────
function EngineerDetailDialog({ engineer, onClose }: { engineer: any, onClose: () => void }) {
  return (
    <Dialog open={!!engineer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap text-slate-900">
            <UserCog className="w-5 h-5 text-blue-600" />
            <span>{engineer.name}</span>
            <Badge variant="outline" className="text-[10px] font-semibold bg-amber-50 text-amber-700 border-amber-200">
              {engineer.commissionRate}% commission
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Personal info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 p-3 rounded-xl border">
              <p className="text-xs font-semibold text-slate-500 mb-1">Contact</p>
              <p className="font-semibold text-slate-900 flex items-center gap-1.5"><Phone className="w-3 h-3" /> {engineer.phone || '—'}</p>
              <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-1"><Mail className="w-3 h-3" /> {engineer.email || '—'}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border">
              <p className="text-xs font-semibold text-slate-500 mb-1">Specialization</p>
              <p className="font-semibold text-slate-900">{engineer.specialization || 'General'}</p>
              {engineer.joinedAt && (
                <p className="text-xs text-slate-500 mt-1">Joined: {new Date(engineer.joinedAt).toLocaleDateString('en-IN')}</p>
              )}
            </div>
          </div>

          {/* Service jobs summary */}
          <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50">
            <Label className="text-sm font-bold text-blue-900 mb-2 block flex items-center gap-2">
              <Wrench className="w-4 h-4" /> Service Jobs Financials
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="bg-white rounded-lg p-2 border">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Jobs Assigned</p>
                <p className="text-lg font-bold text-slate-900">{engineer.jobsAssigned}</p>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Completed</p>
                <p className="text-lg font-bold text-emerald-700">{engineer.jobsCompleted}</p>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Service Revenue</p>
                <p className="text-sm font-bold text-slate-900">{formatCurrency(engineer.serviceRevenue)}</p>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Service Profit</p>
                <p className="text-sm font-bold text-emerald-700">{formatCurrency(engineer.serviceProfit)}</p>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Parts Sold</p>
                <p className="text-sm font-bold text-slate-900">{formatCurrency(engineer.partsSoldRevenue)}</p>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Parts Cost</p>
                <p className="text-sm font-bold text-orange-700">{formatCurrency(engineer.partsCost)}</p>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Parts Profit</p>
                <p className="text-sm font-bold text-blue-700">{formatCurrency(engineer.partsProfit)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-200">
                <p className="text-[10px] text-emerald-700 uppercase font-bold">Gross Profit</p>
                <p className="text-sm font-bold text-emerald-800">{formatCurrency(engineer.grossProfit)}</p>
              </div>
            </div>
          </div>

          {/* Items sold (via invoices) */}
          <div className="border-2 border-violet-200 rounded-xl p-3 bg-violet-50">
            <Label className="text-sm font-bold text-violet-900 mb-2 block flex items-center gap-2">
              <Package className="w-4 h-4" /> Items Sold (via Invoices)
            </Label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white rounded-lg p-2 border">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Units Sold</p>
                <p className="text-lg font-bold text-violet-700">{engineer.itemsSold}</p>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Sales Revenue</p>
                <p className="text-lg font-bold text-slate-900">{formatCurrency(engineer.itemsSoldRevenue)}</p>
              </div>
            </div>
            <p className="text-[10px] text-violet-700 mt-2">
              💡 To attribute an invoice to this engineer, set the "Engineer" field when creating the invoice.
            </p>
          </div>

          {/* Commission summary */}
          <div className="border-2 border-amber-200 rounded-xl p-3 bg-amber-50">
            <Label className="text-sm font-bold text-amber-900 mb-2 block flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Commission Summary
            </Label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-white rounded-lg p-2 border">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Earned</p>
                <p className="text-sm font-bold text-emerald-700">{formatCurrency(engineer.commissionEarned)}</p>
                <p className="text-[9px] text-slate-500">{engineer.commissionRate}% of gross profit</p>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Paid</p>
                <p className="text-sm font-bold text-slate-700">{formatCurrency(engineer.commissionPaid)}</p>
                <p className="text-[9px] text-slate-500">via ServicePayments</p>
              </div>
              <div className="bg-orange-100 rounded-lg p-2 border border-orange-300">
                <p className="text-[10px] text-orange-700 uppercase font-bold">Due</p>
                <p className="text-sm font-bold text-orange-800">{formatCurrency(engineer.commissionDue)}</p>
              </div>
            </div>
            <p className="text-[10px] text-amber-800 mt-2">
              💡 To pay commission, record a Service Payment with type "Commission" from the Service Payments panel.
            </p>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} className="bg-white ml-auto">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
