'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useFetch, apiPost, apiPut, apiDelete, invalidate } from '@/lib/api'
import { safeJsonParse } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { usePdfPreview } from '@/lib/preview-context'
import { ServiceWhatsAppModal } from '@/components/ServiceWhatsAppModal'
import { Wrench, Plus, Search, Laptop, Printer, Monitor, Battery, ScanLine, Smartphone, ClipboardList, CheckCircle2, Clock, Package, IndianRupee, Trash2, RefreshCw, Send, Eye, ExternalLink, Copy, FileText, MessageSquare, ShoppingCart, AlertTriangle, Boxes } from 'lucide-react'

const DEVICE_ICONS: Record<string, any> = {
  Laptop: Laptop,
  Desktop: Monitor,
  Printer: Printer,
  Monitor: Monitor,
  UPS: Battery,
  Scanner: ScanLine,
  Other: Smartphone,
}

const STATUS_COLORS: Record<string, string> = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  'Device Received': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Delivered: 'bg-purple-50 text-purple-700 border-purple-200',
}

const PRIORITY_BORDER: Record<string, string> = {
  High: 'border-l-4 border-l-red-500',
  Medium: 'border-l-4 border-l-amber-500',
  Low: 'border-l-4 border-l-green-500',
}

const PRIORITY_BADGE: Record<string, string> = {
  High: 'bg-red-50 text-red-700 border-red-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-green-50 text-green-700 border-green-200',
}

const money = (value: any) => Math.round((Number(value) || 0) * 100) / 100
const jobTotal = (job: any) => money(Number(job?.finalAmount) || Number(job?.estimatedAmount) || 0)
const jobPaidTotal = (job: any) => money((Number(job?.advanceAmount) || 0) + (Number(job?.paidAmount) || 0))
const jobBalance = (job: any) => money(Math.max(0, jobTotal(job) - jobPaidTotal(job)))
const isActiveJob = (job: any) => job?.status === 'Pending' || job?.status === 'Device Received' || job?.status === 'In Progress'
const jobAgeDays = (job: any) => {
  const ts = job?.createdAt ? new Date(job.createdAt).getTime() : 0
  return ts && !Number.isNaN(ts) ? Math.max(0, Math.floor((Date.now() - ts) / 86400000)) : 0
}
const formatDateTime = (value: any) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function JobsPanel() {
  const { toast } = useToast()
  const { openPreview } = usePdfPreview()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [detailJob, setDetailJob] = useState<any | null>(null)
  const [editing, setEditing] = useState<any | null>(null)
  const [invoiceJobId, setInvoiceJobId] = useState<string | null>(null)
  const [whatsappJobId, setWhatsappJobId] = useState<string | null>(null)

  const { data: jobs, loading, refetch } = useFetch<any[]>('/api/jobs')

  const filtered = useMemo(() => {
    return (jobs || []).filter((j) => {
      if (statusFilter !== 'all' && j.status !== statusFilter) return false
      if (priorityFilter !== 'all' && j.priority !== priorityFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return String(j?.jobId || '').toLowerCase().includes(q) ||
               String(j?.customerName || '').toLowerCase().includes(q) ||
               String(j?.customerMobile || '').includes(q) ||
               String(j?.brandModel || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [jobs, statusFilter, priorityFilter, search])

  // Open service invoice preview when invoiceJobId changes
  useEffect(() => {
    if (invoiceJobId) {
      openPreview(invoiceJobId, 'service', 'Service Invoice')
      setInvoiceJobId(null)
    }
  }, [invoiceJobId, openPreview])

  const stats = useMemo(() => {
    const list = jobs || []
    return {
      total: list.length,
      pending: list.filter((j) => j.status === 'Pending').length,
      received: list.filter((j) => j.status === 'Device Received').length,
      progress: list.filter((j) => j.status === 'In Progress').length,
      completed: list.filter((j) => j.status === 'Completed').length,
      delivered: list.filter((j) => j.status === 'Delivered').length,
      highPriority: list.filter((j) => j.priority === 'High' && isActiveJob(j)).length,
      overdue: list.filter((j) => isActiveJob(j) && jobAgeDays(j) >= 3).length,
    }
  }, [jobs])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this job? Job record will be soft-deleted (data safe in Sheets).')) return
    try {
      await apiDelete(`/api/jobs/${id}`)
      toast({ title: 'Job deleted' })
      // apiDelete already optimistically removes item from cache — no need for refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }, [toast])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
            <span className="truncate">Service Jobs</span>
            <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">v3.0.4 Upgraded</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Manage repairs with stock-linked parts, due tracking, customer links & professional invoices</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true) }} className="bg-blue-600 hover:bg-blue-700 h-11">
          <Plus className="w-4 h-4 mr-1.5" /> <span className="hidden sm:inline">New Job</span><span className="sm:hidden">New</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
        <Card><CardContent className="p-3"><div className="flex items-center justify-between mb-1"><span className="text-[10px] font-medium text-slate-600 uppercase">Total</span><ClipboardList className="w-4 h-4 text-slate-500" /></div><p className="text-lg sm:text-2xl font-bold text-slate-900">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-3"><div className="flex items-center justify-between mb-1"><span className="text-[10px] font-medium text-slate-600 uppercase">Pending</span><Clock className="w-4 h-4 text-amber-500" /></div><p className="text-lg sm:text-2xl font-bold text-amber-600">{stats.pending}</p></CardContent></Card>
        <Card><CardContent className="p-3"><div className="flex items-center justify-between mb-1"><span className="text-[10px] font-medium text-slate-600 uppercase">In Progress</span><RefreshCw className="w-4 h-4 text-blue-500" /></div><p className="text-lg sm:text-2xl font-bold text-blue-600">{stats.progress}</p></CardContent></Card>
        <Card><CardContent className="p-3"><div className="flex items-center justify-between mb-1"><span className="text-[10px] font-medium text-slate-600 uppercase">Completed</span><CheckCircle2 className="w-4 h-4 text-emerald-500" /></div><p className="text-lg sm:text-2xl font-bold text-emerald-600">{stats.completed}</p></CardContent></Card>
        <Card><CardContent className="p-3"><div className="flex items-center justify-between mb-1"><span className="text-[10px] font-medium text-slate-600 uppercase">Delivered</span><Package className="w-4 h-4 text-purple-500" /></div><p className="text-lg sm:text-2xl font-bold text-purple-600">{stats.delivered}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
          <Input placeholder="Search job ID, customer, mobile, model..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11 bg-white" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44 h-11 bg-white"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Device Received">Device Received</SelectItem><SelectItem value="In Progress">In Progress</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="Delivered">Delivered</SelectItem></SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-40 h-11 bg-white"><SelectValue placeholder="All Priority" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Priority</SelectItem><SelectItem value="High">🔴 High</SelectItem><SelectItem value="Medium">🟡 Medium</SelectItem><SelectItem value="Low">🟢 Low</SelectItem></SelectContent>
        </Select>
        {stats.highPriority > 0 && (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 px-3 h-11 flex items-center gap-1.5 font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            {stats.highPriority} High Priority
          </Badge>
        )}
        {stats.overdue > 0 && (
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 px-3 h-11 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            {stats.overdue} Overdue
          </Badge>
        )}
      </div>

      <div className="sm:hidden space-y-3">
        {loading ? <Card><CardContent className="text-center py-8 text-slate-600">Loading...</CardContent></Card> : filtered.length === 0 ? <Card><CardContent className="text-center py-8 text-slate-600"><Wrench className="w-12 h-12 mx-auto mb-2 text-slate-300" />No jobs yet.</CardContent></Card> : filtered.map((j) => {
          const Icon = DEVICE_ICONS[j.deviceType] || Smartphone
          return (
            <Card key={j.id} className={`${PRIORITY_BORDER[j.priority] || ''}`}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 border border-blue-100"><Icon className="w-4 h-4 text-blue-600" /></div>
                    <div className="min-w-0"><p className="font-semibold text-slate-900 text-sm truncate">{j.customerName || 'Unknown'}</p><p className="text-[10px] text-slate-500 font-mono">{j.jobId}</p></div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0"><Badge variant="outline" className={`${STATUS_COLORS[j.status] || ''} text-[9px] font-semibold`}>{j.status}</Badge>{j.priority && <Badge variant="outline" className={`${PRIORITY_BADGE[j.priority] || ''} text-[8px] px-1.5 py-0 font-semibold`}>{j.priority}</Badge>}</div>
                </div>
                <div className="text-xs space-y-0.5 text-slate-700"><p className="truncate"><span className="font-semibold">{j.deviceType}</span>{j.brandModel ? ` · ${j.brandModel}` : ''}</p><p className="truncate text-slate-500 text-[11px]">{j.problemDesc}</p></div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><div><p className="text-sm font-bold text-slate-900">{formatCurrency(jobTotal(j))}</p>{jobBalance(j) > 0 && <p className="text-[10px] text-orange-600 font-semibold">Due {formatCurrency(jobBalance(j))}</p>}{isActiveJob(j) && jobAgeDays(j) >= 3 && <p className="text-[10px] text-red-600 font-semibold">Overdue {jobAgeDays(j)}d</p>}</div><div className="flex gap-1"><Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-white" onClick={() => setWhatsappJobId(j.id)}><MessageSquare className="w-3.5 h-3.5 text-green-600" /></Button><Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-white" onClick={() => setInvoiceJobId(j.id)}><FileText className="w-3.5 h-3.5 text-purple-600" /></Button><Button size="sm" variant="outline" className="h-8 px-2 bg-white" onClick={() => setDetailJob(j)}><Eye className="w-3.5 h-3.5" /></Button></div></div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="hidden sm:block"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead>Job ID</TableHead><TableHead>Customer</TableHead><TableHead>Device</TableHead><TableHead>Problem</TableHead><TableHead className="text-center">Priority</TableHead><TableHead className="text-center">Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-600">Loading...</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-600">No jobs found</TableCell></TableRow> : filtered.map((j) => { const Icon = DEVICE_ICONS[j.deviceType] || Smartphone; return (<TableRow key={j.id} className={`hover:bg-slate-50 cursor-pointer ${PRIORITY_BORDER[j.priority] || ''}`} onClick={() => setDetailJob(j)}><TableCell className="font-mono text-xs font-semibold text-slate-900">{j.jobId}</TableCell><TableCell><div className="font-semibold text-slate-900">{j.customerName || 'Unknown'}</div><div className="text-[10px] text-slate-500">{j.customerMobile}</div></TableCell><TableCell><div className="flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-slate-500" /><span className="text-sm font-medium text-slate-800">{j.deviceType}</span></div><div className="text-[10px] text-slate-500">{j.brandModel}</div></TableCell><TableCell className="text-xs text-slate-700 max-w-[200px] truncate">{j.problemDesc}</TableCell><TableCell className="text-center">{j.priority ? <Badge variant="outline" className={`${PRIORITY_BADGE[j.priority] || ''} text-[9px] font-semibold`}>{j.priority}</Badge> : '-'}</TableCell><TableCell className="text-center"><Badge variant="outline" className={`${STATUS_COLORS[j.status] || ''} text-[10px] font-semibold`}>{j.status}</Badge></TableCell><TableCell className="text-right"><div className="font-bold text-slate-900">{formatCurrency(jobTotal(j))}</div>{jobBalance(j) > 0 && <div className="text-[10px] text-orange-600 font-semibold">Due {formatCurrency(jobBalance(j))}</div>}{isActiveJob(j) && jobAgeDays(j) >= 3 && <div className="text-[10px] text-red-600 font-semibold">{jobAgeDays(j)}d overdue</div>}</TableCell><TableCell className="text-right" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1"><Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-white" onClick={() => setWhatsappJobId(j.id)}><MessageSquare className="w-3.5 h-3.5 text-green-600" /></Button><Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-white" onClick={() => setInvoiceJobId(j.id)}><FileText className="w-3.5 h-3.5 text-purple-600" /></Button><Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-white" onClick={() => setDetailJob(j)}><Eye className="w-3.5 h-3.5" /></Button><Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-white text-red-500" onClick={() => handleDelete(j.id)}><Trash2 className="w-3.5 h-3.5" /></Button></div></TableCell></TableRow>) })}</TableBody></Table></div></CardContent></Card>

      {dialogOpen && <NewJobDialog key={editing?.id || 'new'} open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => { setDialogOpen(false); refetch() }} />}
      {detailJob && <JobDetailDialog key={detailJob.id} job={detailJob} onClose={() => setDetailJob(null)} onUpdated={() => { refetch(); setDetailJob(null) }} onOpenInvoice={(id) => { setDetailJob(null); setInvoiceJobId(id) }} onOpenWhatsApp={(id) => { setDetailJob(null); setWhatsappJobId(id) }} onEditInfo={(j) => { setDetailJob(null); setEditing(j); setDialogOpen(true) }} />}

      {whatsappJobId && <ServiceWhatsAppModal jobId={whatsappJobId} onClose={() => setWhatsappJobId(null)} />}
    </div>
  )
}

function NewJobDialog({ open, onOpenChange, editing, onSaved }: { open: boolean, onOpenChange: (v: boolean) => void, editing: any | null, onSaved: () => void }) {
  const { toast } = useToast()
  // v3.0.5 FIX: Use Number() with nullish coalescing to preserve 0 values
  // (previously `|| 0` would treat existing 0 as falsy and overwrite)
  const [form, setForm] = useState({
    customerName: editing?.customerName || '',
    customerMobile: editing?.customerMobile || '',
    deviceType: editing?.deviceType || 'Laptop',
    brandModel: editing?.brandModel || '',
    serialNumber: editing?.serialNumber || '',
    problemDesc: editing?.problemDesc || '',
    accessories: editing?.accessories || '',
    serviceType: editing?.serviceType || 'InShop',
    priority: editing?.priority || 'Low',
    estimatedAmount: Number(editing?.estimatedAmount ?? 0),
    advanceAmount: Number(editing?.advanceAmount ?? 0),
    advanceMode: editing?.advanceMode || 'Cash',
    assignedEngineer: editing?.assignedEngineer || '',
    notes: editing?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.customerName || !form.customerMobile || !form.problemDesc) {
      toast({ title: 'Customer name, mobile, and problem required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await apiPut(`/api/jobs/${editing.id}`, { action: 'update', ...form })
        toast({ title: 'Job updated ✓' })
      } else {
        await apiPost('/api/jobs', form)
        toast({ title: 'Job created ✓' })
      }
      // Invalidate jobs list to force fresh fetch from server
      invalidate('/api/jobs')
      onSaved()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-slate-900"><Wrench className="w-5 h-5 text-blue-600" />{editing ? 'Edit Job' : 'New Service Job'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs font-semibold text-slate-700">Customer Name *</Label><Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Enter name" className="h-10 bg-white mt-1" /></div>
            <div><Label className="text-xs font-semibold text-slate-700">Mobile *</Label><Input value={form.customerMobile} onChange={(e) => setForm({ ...form, customerMobile: e.target.value })} placeholder="10-digit" className="h-10 bg-white mt-1" inputMode="tel" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs font-semibold text-slate-700">Device Type *</Label><Select value={form.deviceType} onValueChange={(v) => setForm({ ...form, deviceType: v })}><SelectTrigger className="h-10 bg-white mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Laptop">💻 Laptop</SelectItem><SelectItem value="Desktop">🖥️ Desktop</SelectItem><SelectItem value="Printer">🖨️ Printer</SelectItem><SelectItem value="Monitor">🖵 Monitor</SelectItem><SelectItem value="UPS">🔋 UPS</SelectItem><SelectItem value="Scanner">📠 Scanner</SelectItem><SelectItem value="Other">📱 Other</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs font-semibold text-slate-700">Brand / Model</Label><Input value={form.brandModel} onChange={(e) => setForm({ ...form, brandModel: e.target.value })} placeholder="e.g., HP Pavilion" className="h-10 bg-white mt-1" /></div>
          </div>
          <div><Label className="text-xs font-semibold text-slate-700">Serial Number</Label><Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} placeholder="Device serial" className="h-10 bg-white mt-1" /></div>
          <div><Label className="text-xs font-semibold text-slate-700">Service Type</Label><div className="flex gap-2 mt-1"><button type="button" onClick={() => setForm({ ...form, serviceType: 'InShop' })} className={`flex-1 p-2.5 border-2 rounded-xl text-sm font-semibold transition ${form.serviceType === 'InShop' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}>🏪 In-Shop</button><button type="button" onClick={() => setForm({ ...form, serviceType: 'Onsite' })} className={`flex-1 p-2.5 border-2 rounded-xl text-sm font-semibold transition ${form.serviceType === 'Onsite' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-600 hover:border-green-300'}`}>🚗 Onsite</button></div></div>
          <div><Label className="text-xs font-semibold text-slate-700">Priority</Label><div className="flex gap-2 mt-1">{(['Low', 'Medium', 'High'] as const).map((p) => { const colors: any = { Low: 'border-green-500 bg-green-50 text-green-700', Medium: 'border-amber-500 bg-amber-50 text-amber-700', High: 'border-red-500 bg-red-50 text-red-700' }; const isSel = form.priority === p; return <button key={p} type="button" onClick={() => setForm({ ...form, priority: p })} className={`flex-1 p-2.5 border-2 rounded-xl text-sm font-semibold transition ${isSel ? colors[p] : 'border-slate-200 bg-white text-slate-600'}`}>{p === 'Low' ? '🟢' : p === 'Medium' ? '🟡' : '🔴'} {p}</button> })}</div></div>
          <div><Label className="text-xs font-semibold text-slate-700">Problem Description *</Label><Textarea value={form.problemDesc} onChange={(e) => setForm({ ...form, problemDesc: e.target.value })} placeholder="Describe the issue..." rows={3} className="bg-white mt-1" /></div>
          <div><Label className="text-xs font-semibold text-slate-700">Accessories Received</Label><Input value={form.accessories} onChange={(e) => setForm({ ...form, accessories: e.target.value })} placeholder="Charger, Battery, Mouse" className="h-10 bg-white mt-1" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs font-semibold text-slate-700">Estimated</Label><Input type="number" value={form.estimatedAmount} onChange={(e) => setForm({ ...form, estimatedAmount: Number(e.target.value) })} className="h-10 bg-white mt-1" /></div>
            <div><Label className="text-xs font-semibold text-slate-700">Advance</Label><Input type="number" value={form.advanceAmount} onChange={(e) => setForm({ ...form, advanceAmount: Number(e.target.value) })} className="h-10 bg-white mt-1" /></div>
            <div><Label className="text-xs font-semibold text-slate-700">Mode</Label><Select value={form.advanceMode} onValueChange={(v) => setForm({ ...form, advanceMode: v })}><SelectTrigger className="h-10 bg-white mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem></SelectContent></Select></div>
          </div>
          <div><Label className="text-xs font-semibold text-slate-700">Assigned Engineer</Label><Input value={form.assignedEngineer} onChange={(e) => setForm({ ...form, assignedEngineer: e.target.value })} placeholder="Engineer name" className="h-10 bg-white mt-1" /></div>
        </div>
        <DialogFooter className="mt-4"><Button variant="outline" onClick={() => onOpenChange(false)} className="bg-white">Cancel</Button><Button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">{saving ? <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> Saving...</> : editing ? 'Update Job' : 'Create Job'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function JobDetailDialog({ job, onClose, onUpdated, onOpenInvoice, onOpenWhatsApp }: { job: any, onClose: () => void, onUpdated: () => void, onOpenInvoice: (id: string) => void, onOpenWhatsApp: (id: string) => void, onEditInfo: (j: any) => void }) {
  const { toast } = useToast()
  const [status, setStatus] = useState(job?.status || 'Pending')
  const [partsUsed, setPartsUsed] = useState<any[]>(safeJsonParse<any[]>(job?.partsUsedJson || job?.partsUsed, []))
  const [finalAmount, setFinalAmount] = useState(Number(job?.finalAmount) || 0)
  const [serviceCharge, setServiceCharge] = useState(Number(job?.serviceCharge) || 0)
  const [paymentMode, setPaymentMode] = useState(job?.paymentMode || 'Cash')
  const [stockSearch, setStockSearch] = useState('')
  const [debouncedStockSearch, setDebouncedStockSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedStockSearch(stockSearch), 250)
    return () => clearTimeout(t)
  }, [stockSearch])
  const [showStock, setShowStock] = useState(false)
  const [newPart, setNewPart] = useState({ name: '', costPrice: 0, sellPrice: 0, qty: 1, itemId: '', sku: '', warranty: 'No Warranty' })
  const [quickPayAmount, setQuickPayAmount] = useState('')
  const [quickPayMode, setQuickPayMode] = useState<'Cash' | 'UPI'>('Cash')
  const [saving, setSaving] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [deductStock, setDeductStock] = useState(true)

  // Server-side search — only fetches when the user types (capped at 30 results).
  const stockItemsUrl = debouncedStockSearch
    ? `/api/items?search=${encodeURIComponent(debouncedStockSearch)}&limit=30`
    : '/api/items?limit=30'
  const { data: stockItems } = useFetch<any[]>(stockItemsUrl, undefined)

  const filteredStock = useMemo(() => {
    if (!stockSearch) return (stockItems || []).slice(0, 10)
    const q = stockSearch.toLowerCase()
    return (stockItems || []).filter((it: any) =>
      String(it.name || '').toLowerCase().includes(q) ||
      String(it.sku || '').toLowerCase().includes(q) ||
      String(it.category || '').toLowerCase().includes(q)
    ).slice(0, 15)
  }, [stockItems, stockSearch])

  const partsTotalCost = partsUsed.reduce((s, p) => s + (Number(p.costPrice) || 0) * (Number(p.qty) || 1), 0)
  const partsTotalSell = partsUsed.reduce((s, p) => s + (Number(p.sellPrice) || 0) * (Number(p.qty) || 1), 0)
  const partsProfit = partsTotalSell - partsTotalCost

  const handleSaveJobChanges = async () => {
    setSaving(true)
    try {
      const calculatedFinal = serviceCharge > 0 ? (serviceCharge + partsTotalSell) : (finalAmount > 0 ? finalAmount : partsTotalSell)
      await apiPut(`/api/jobs/${job.id}`, {
        action: 'update',
        partsUsed,
        serviceCharge,
        finalAmount: calculatedFinal,
      })
      toast({ title: 'Job saved ✓', description: `Parts & charges saved for ${job.jobId}` })
      invalidate('/api/jobs')
      onUpdated()
    } catch (e: any) {
      toast({ title: 'Error saving job', description: e.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const handleUpdateStatus = async () => {
    setSaving(true)
    try {
      await apiPut(`/api/jobs/${job.id}`, { action: 'updateStatus', status })
      toast({ title: 'Status updated ✓', description: `Job is now ${status}` })
      invalidate('/api/jobs')
      onUpdated()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const handleAddPart = () => {
    if (!newPart.name) {
      toast({ title: 'Enter part name', variant: 'destructive' })
      return
    }
    setPartsUsed([...partsUsed, { ...newPart }])
    setNewPart({ name: '', costPrice: 0, sellPrice: 0, qty: 1, itemId: '', sku: '', warranty: 'No Warranty' })
    setStockSearch('')
    setShowStock(false)
    toast({ title: 'Part added', description: `${newPart.name} x${newPart.qty} (${newPart.warranty})` })
  }

  const handleSelectStock = (item: any) => {
    const itemWarranty = item.warrantyDays ? `${item.warrantyDays} Days` : (item.warranty || 'Testing Warranty')
    setNewPart({
      name: String(item.name || ''),
      costPrice: Number(item.costPrice) || 0,
      sellPrice: Number(item.sellingPrice) || 0,
      qty: 1,
      itemId: String(item.id || ''),
      sku: String(item.sku || ''),
      warranty: itemWarranty,
    })
    setShowStock(false)
    setStockSearch('')
    toast({ title: `Selected from stock: ${item.name}`, description: `Stock: ${item.quantity} ${item.unit || 'pcs'} | Warranty: ${itemWarranty}` })
  }

  const handleRemovePart = (i: number) => {
    setPartsUsed(partsUsed.filter((_, idx) => idx !== i))
  }

  const handleComplete = async () => {
    // AUTO-FIX (v3.0.5 Pro): Recalculate final amount from parts + service charge
    // to ensure invoice always shows correct total matching saved details
    const calculatedTotal = serviceCharge > 0 ? (serviceCharge + partsTotalSell) : (finalAmount > 0 ? finalAmount : partsTotalSell)
    if (calculatedTotal <= 0) {
      toast({ title: 'Final amount must be > 0', description: 'Set service charge or add parts first', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await apiPut(`/api/jobs/${job.id}`, {
        action: 'complete',
        partsUsed,
        finalAmount: calculatedTotal,
        serviceCharge,
        paymentMode,
        deductStock,
      })
      toast({ title: 'Job completed! ✓', description: 'Profit calculated & stock updated' })
      invalidate('/api/jobs')
      onUpdated()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const handleQuickPayment = async () => {
    const amt = Number(quickPayAmount) || 0
    if (!amt || amt <= 0) {
      toast({ title: 'Enter valid amount', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await apiPut(`/api/jobs/${job.id}`, { action: 'recordPayment', amount: amt, mode: quickPayMode })
      toast({ title: 'Payment recorded ✓', description: `Rs.${amt} via ${quickPayMode}` })
      setQuickPayAmount('')
      invalidate('/api/jobs')
      onUpdated()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const handleDeliver = async () => {
    if (!confirm('Mark as Delivered?')) return
    setSaving(true)
    try {
      await apiPut(`/api/jobs/${job.id}`, { action: 'deliver' })
      toast({ title: 'Job delivered ✓' })
      invalidate('/api/jobs')
      onUpdated()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const Icon = DEVICE_ICONS[job.deviceType] || Smartphone

  return (
    <Dialog open={!!job} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader><DialogTitle className="flex items-center gap-2 flex-wrap text-slate-900"><Icon className="w-5 h-5 text-blue-600" /><span className="font-mono text-sm">{job.jobId}</span><Badge variant="outline" className={`${STATUS_COLORS[job.status] || ''} text-[10px] font-semibold`}>{job.status}</Badge>{job.priority && <Badge variant="outline" className={`${PRIORITY_BADGE[job.priority] || ''} text-[9px] font-semibold`}>{job.priority}</Badge>}<span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">v3.0.4 Stock + Due Linked</span></DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 p-3 rounded-xl border"><p className="text-xs font-semibold text-slate-500 mb-1">Customer</p><p className="font-semibold text-slate-900">{job.customerName}</p><p className="text-xs text-slate-600">{job.customerMobile}</p></div>
            <div className="bg-slate-50 p-3 rounded-xl border"><p className="text-xs font-semibold text-slate-500 mb-1">Device</p><p className="font-semibold text-slate-900">{job.deviceType}</p><p className="text-xs text-slate-600">{job.brandModel}</p>{job.serialNumber && <p className="text-[10px] text-slate-500">S/N: {job.serialNumber}</p>}</div>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl"><p className="text-xs font-bold text-amber-800 mb-1">Problem</p><p className="text-sm font-medium text-slate-900">{job.problemDesc}</p>{job.accessories && <p className="text-xs text-slate-600 mt-1">Accessories: {job.accessories}</p>}</div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-slate-50 border rounded-xl p-3"><p className="text-[10px] uppercase font-bold text-slate-500">Total</p><p className="text-sm font-black text-slate-900">{formatCurrency(jobTotal(job))}</p></div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3"><p className="text-[10px] uppercase font-bold text-emerald-700">Paid</p><p className="text-sm font-black text-emerald-700">{formatCurrency(jobPaidTotal(job))}</p></div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3"><p className="text-[10px] uppercase font-bold text-orange-700">Balance</p><p className="text-sm font-black text-orange-700">{formatCurrency(jobBalance(job))}</p></div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3"><p className="text-[10px] uppercase font-bold text-blue-700">Opened</p><p className="text-sm font-black text-blue-700">{formatDateTime(job.createdAt)}</p></div>
          </div>

          {job.trackUrl && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl">
              <p className="text-xs font-bold text-blue-800 mb-1 flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Customer Tracking Link</p>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 text-xs bg-white px-2 py-2 rounded-lg border truncate font-mono">{typeof window !== 'undefined' ? window.location.origin + job.trackUrl : job.trackUrl}</code>
                <Button size="sm" variant="outline" className="h-9 px-3 bg-white flex-shrink-0" onClick={() => { const url = (typeof window !== 'undefined' ? window.location.origin : '') + job.trackUrl; navigator.clipboard.writeText(url); toast({ title: 'Link copied ✓' }) }}><Copy className="w-3.5 h-3.5" /></Button>
                <a href={`https://wa.me/${String(job.customerMobile || '').replace(/\D/g, '').length === 10 ? '91' : ''}${String(job.customerMobile || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Track repair: ${(typeof window !== 'undefined' ? window.location.origin : '') + job.trackUrl}`)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold flex-shrink-0"><Send className="w-3 h-3" /> WhatsApp</a>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[150px]"><Label className="text-xs font-semibold text-slate-700">Update Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="h-10 bg-white mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Device Received">Device Received</SelectItem><SelectItem value="In Progress">In Progress</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="Delivered">Delivered</SelectItem></SelectContent></Select></div>
            <Button onClick={handleUpdateStatus} disabled={saving || status === job.status} className="bg-blue-600 hover:bg-blue-700 text-white h-10">Update Status</Button>
            {job.status === 'Completed' && <Button onClick={handleDeliver} disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white h-10"><Package className="w-4 h-4 mr-1" /> Delivered</Button>}
          </div>

          {/* Parts Used - UPGRADED v3.0.3 with Stock */}
          <div className="border-2 border-slate-200 rounded-xl p-3 bg-white">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-bold text-slate-900 flex items-center gap-2"><Boxes className="w-4 h-4 text-blue-600" />Parts Used - Stock Linked <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">NEW v3.0.3</span></Label>
              <div className="text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-full border">
                Cost: <span className="font-bold text-slate-900">Rs.{partsTotalCost}</span> · Sell: <span className="font-bold text-blue-700">Rs.{partsTotalSell}</span> · Profit: <span className="font-bold text-emerald-600">Rs.{partsProfit}</span>
              </div>
            </div>

            {partsUsed.length > 0 && (
              <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                {partsUsed.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border hover:bg-slate-100 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 border border-blue-200"><ShoppingCart className="w-4 h-4 text-blue-600" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{p.name} {p.sku ? `(${p.sku})` : ''}</p>
                      <p className="text-[10px] text-slate-500">Qty: {p.qty} | Cost: Rs.{p.costPrice} | Sell: Rs.{p.sellPrice} {p.warranty && p.warranty !== 'No Warranty' ? <span className="font-semibold text-emerald-700">| 🛡️ {p.warranty}</span> : ''} {p.itemId ? `| Stock ID: ${String(p.itemId).slice(0,6)}` : ''}</p>
                    </div>
                    <div className="text-right flex-shrink-0"><p className="font-bold text-slate-900">Rs.{Number(p.sellPrice || 0) * Number(p.qty || 1)}</p><p className="text-[10px] text-emerald-600 font-semibold">+Rs.{(Number(p.sellPrice||0)-Number(p.costPrice||0))*Number(p.qty||1)} profit</p></div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 flex-shrink-0" onClick={() => handleRemovePart(i)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            )}

            {/* Stock Search */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                  <Input placeholder="Search stock to add (name, SKU, category)..." value={stockSearch} onChange={(e) => { setStockSearch(e.target.value); setShowStock(true) }} onFocus={() => setShowStock(true)} className="pl-9 h-10 bg-white text-sm" />
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowStock(!showStock)} className="h-10 bg-white text-xs"><Boxes className="w-4 h-4 mr-1" />{showStock ? 'Hide' : 'Stock'}</Button>
              </div>

              {showStock && (
                <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto bg-white shadow-sm">
                  {filteredStock.length === 0 ? <div className="p-3 text-center text-xs text-slate-500">No stock found for "{stockSearch}"</div> : filteredStock.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2 p-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-0 transition-colors" onClick={() => handleSelectStock(item)}>
                      <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center flex-shrink-0"><Package className="w-5 h-5 text-slate-400" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{item.sku} | {item.category} | Stock: {item.quantity} {item.unit || 'pcs'} {Number(item.quantity) <= Number(item.minQuantity) ? '⚠️ LOW' : ''}</p>
                      </div>
                      <div className="text-right flex-shrink-0"><p className="text-xs font-bold text-slate-900">Rs.{item.sellingPrice}</p><p className="text-[10px] text-slate-500">Cost Rs.{item.costPrice}</p></div>
                      <Plus className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    </div>
                  ))}
                  <div className="p-2 bg-slate-50 text-center"><p className="text-[10px] text-slate-500">Showing {filteredStock.length} of {stockItems?.length || 0} stock items - Click to select</p></div>
                </div>
              )}

              <div className="grid grid-cols-12 gap-1.5 bg-slate-50 p-2.5 rounded-xl border">
                <div className="col-span-4"><Label className="text-[10px] font-semibold text-slate-600">Part Name *</Label><Input placeholder="e.g., 8GB RAM" value={newPart.name} onChange={(e) => setNewPart({ ...newPart, name: e.target.value })} className="h-9 text-xs bg-white mt-1" /></div>
                <div className="col-span-1"><Label className="text-[10px] font-semibold text-slate-600">Qty</Label><Input type="number" min={1} value={newPart.qty} onChange={(e) => setNewPart({ ...newPart, qty: Number(e.target.value) || 1 })} className="h-9 text-xs bg-white mt-1 px-1 text-center" /></div>
                <div className="col-span-2"><Label className="text-[10px] font-semibold text-slate-600">Cost</Label><Input type="number" placeholder="Cost" value={newPart.costPrice} onChange={(e) => setNewPart({ ...newPart, costPrice: Number(e.target.value) })} className="h-9 text-xs bg-white mt-1" /></div>
                <div className="col-span-2"><Label className="text-[10px] font-semibold text-slate-600">Sell</Label><Input type="number" placeholder="Sell" value={newPart.sellPrice} onChange={(e) => setNewPart({ ...newPart, sellPrice: Number(e.target.value) })} className="h-9 text-xs bg-white mt-1" /></div>
                <div className="col-span-2"><Label className="text-[10px] font-semibold text-slate-600">Warranty</Label><Input placeholder="No Warranty" value={newPart.warranty} onChange={(e) => setNewPart({ ...newPart, warranty: e.target.value })} className="h-9 text-xs bg-white mt-1" /></div>
                <div className="col-span-1 flex items-end"><Button size="sm" onClick={handleAddPart} className="h-9 w-full bg-blue-600 hover:bg-blue-700 text-white p-0"><Plus className="w-4 h-4" /></Button></div>
              </div>
              {newPart.itemId && <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" />Selected from stock: <strong>{newPart.name}</strong> ({newPart.sku}) - Will deduct from stock if enabled</div>}
              <div className="flex items-center gap-2 text-[11px]"><input type="checkbox" id="deductStock" checked={deductStock} onChange={(e) => setDeductStock(e.target.checked)} className="rounded" /><label htmlFor="deductStock" className="text-slate-700">Auto-deduct from stock when job completed (recommended)</label></div>
            </div>

            <Button onClick={handleSaveJobChanges} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 mt-3 shadow-sm">
              {saving ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving Changes...</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Save Job Parts & Charges</>}
            </Button>
          </div>

          <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
            <Label className="text-sm font-bold text-emerald-900 mb-2 block">Record Payment (partial)</Label>
            <div className="grid grid-cols-4 gap-2">
              <Input type="number" placeholder="Amount" value={quickPayAmount} onChange={(e) => setQuickPayAmount(e.target.value)} className="h-10 text-sm bg-white col-span-2" />
              <Select value={quickPayMode} onValueChange={(v) => setQuickPayMode(v as 'Cash' | 'UPI')}><SelectTrigger className="h-10 text-sm bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem></SelectContent></Select>
              <Button onClick={handleQuickPayment} disabled={saving} size="sm" className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white"><IndianRupee className="w-4 h-4 mr-1" /> Pay</Button>
            </div>
            <p className="text-[10px] text-emerald-700 mt-2 font-medium">Paid: {formatCurrency(Number(job.paidAmount) || 0)} · Advance: {formatCurrency(Number(job.advanceAmount) || 0)} · Balance: {formatCurrency(jobBalance(job))}</p>
          </div>

          {job.status !== 'Completed' && job.status !== 'Delivered' && (
            <div className="border-2 border-blue-200 rounded-xl p-3 bg-blue-50">
              <div className="flex items-center justify-between mb-2"><Label className="text-sm font-bold text-blue-900">Complete Job & Invoice</Label><Button size="sm" variant="ghost" onClick={() => setShowComplete(!showComplete)} className="text-blue-700 text-xs bg-white border">{showComplete ? 'Hide' : 'Show Details'}</Button></div>
              {showComplete && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-[11px] font-semibold text-blue-800">Service Charge (Rs.)</Label><Input type="number" value={serviceCharge} onChange={(e) => setServiceCharge(Number(e.target.value))} className="h-10 text-sm bg-white mt-1" /></div>
                    <div><Label className="text-[11px] font-semibold text-blue-800">Final Amount = Service + Parts (Rs.)</Label><Input type="number" value={finalAmount} onChange={(e) => setFinalAmount(Number(e.target.value))} className="h-10 text-sm bg-white mt-1 font-bold" /></div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border text-xs space-y-1">
                    <div className="flex justify-between"><span>Parts Sell Total:</span><span className="font-bold">Rs.{partsTotalSell}</span></div>
                    <div className="flex justify-between"><span>Service Charge:</span><span className="font-bold">Rs.{serviceCharge}</span></div>
                    <div className="flex justify-between border-t pt-1 mt-1"><span className="font-bold">Total (suggested):</span><span className="font-bold text-blue-700">Rs.{partsTotalSell + serviceCharge}</span></div>
                    <Button variant="outline" size="sm" className="w-full mt-2 h-8 text-xs bg-white" onClick={() => setFinalAmount(partsTotalSell + serviceCharge)}>Use Suggested Total</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-[11px] font-semibold text-blue-800">Payment Mode</Label><Select value={paymentMode} onValueChange={setPaymentMode}><SelectTrigger className="h-10 text-sm bg-white mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem></SelectContent></Select></div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800"><AlertTriangle className="w-3.5 h-3.5 inline mr-1" />On complete: {deductStock ? 'Stock will be deducted for linked items' : 'Stock will NOT be deducted'}</div>
                  <Button onClick={handleComplete} disabled={saving || finalAmount <= 0} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11 font-bold">{saving ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Completing...</> : <><CheckCircle2 className="w-5 h-5 mr-2" /> Complete Job & Generate Invoice</>}</Button>
                </div>
              )}
            </div>
          )}

          {(job.status === 'Completed' || job.status === 'Delivered') && Number(job.serviceProfit || job.partsProfit) > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-center"><p className="text-[10px] font-semibold text-slate-600 uppercase">Service Profit</p><p className="font-bold text-emerald-700 text-lg">Rs.{job.serviceProfit || 0}</p></div>
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-center"><p className="text-[10px] font-semibold text-slate-600 uppercase">Parts Profit</p><p className="font-bold text-blue-700 text-lg">Rs.{job.partsProfit || 0}</p></div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 flex-wrap mt-4 items-center">
          <Button onClick={handleSaveJobChanges} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-10">
            {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Save Parts & Charges
          </Button>
          <Button variant="outline" onClick={() => onOpenWhatsApp(job.id)} className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200 font-semibold h-10"><MessageSquare className="w-4 h-4 mr-2" /> WhatsApp</Button>
          <Button variant="outline" onClick={() => onOpenInvoice(job.id)} className="bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 font-semibold h-10"><FileText className="w-4 h-4 mr-2" /> Professional Invoice</Button>
          <Button variant="outline" onClick={onClose} className="ml-auto bg-white h-10">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
