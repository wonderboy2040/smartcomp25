'use client'

import { useState } from 'react'
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
import { Receipt, Plus, Trash2, Edit3, Filter, TrendingDown, IndianRupee } from 'lucide-react'

const CATEGORIES = ['Rent', 'Electricity', 'Salary', 'Internet', 'Phone', 'Marketing', 'Transport', 'Maintenance', 'Purchase', 'Tax', 'Other']

export function ExpensesPanel() {
  const { toast } = useToast()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [filterKey, setFilterKey] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)

  const query = filterKey ? `/api/expenses?${filterKey}` : '/api/expenses'
  const { data, loading, refetch } = useFetch<any>(query, undefined)

  const expenses = data?.expenses || []
  const totals = data?.totals || { total: 0, byCategory: {}, byMode: {} }

  const applyFilter = () => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (categoryFilter !== 'all') params.set('category', categoryFilter)
    setFilterKey(params.toString())
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    try {
      await apiDelete(`/api/expenses/${id}`)
      toast({ title: 'Expense deleted' })
      refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  const handleEdit = (e: any) => { setEditing(e); setDialogOpen(true) }
  const handleAdd = () => { setEditing(null); setDialogOpen(true) }

  // Top categories sorted
  const topCategories = Object.entries(totals.byCategory)
    .sort(([, a]: any, [, b]: any) => b - a)
    .slice(0, 5)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 flex-shrink-0" />
            <span className="truncate">Expenses</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Track shop expenses — rent, salary, electricity, purchases, and more
          </p>
        </div>
        <Button onClick={handleAdd} className="bg-red-600 hover:bg-red-700 h-11">
          <Plus className="w-4 h-4 mr-1.5" /> <span className="hidden sm:inline">Add Expense</span><span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-red-700 uppercase">Total Expenses</span>
              <TrendingDown className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-lg sm:text-2xl font-bold text-red-700">{formatCurrency(totals.total)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-600 uppercase">Cash Out</span>
              <IndianRupee className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-lg sm:text-xl font-bold text-blue-600">{formatCurrency(totals.byMode?.Cash || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-600 uppercase">UPI Out</span>
              <IndianRupee className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-lg sm:text-xl font-bold text-green-600">{formatCurrency(totals.byMode?.UPI || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-600 uppercase">Bank Out</span>
              <IndianRupee className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-lg sm:text-xl font-bold text-purple-600">{formatCurrency(totals.byMode?.Bank || 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[10px] text-slate-500 block mb-1">From</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10" />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 block mb-1">To</label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 h-10"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={applyFilter} className="bg-red-600 hover:bg-red-700 h-10">
          <Filter className="w-4 h-4 mr-1" /> Filter
        </Button>
      </div>

      {/* Top categories */}
      {topCategories.length > 0 && (
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-slate-700 mb-2">Top Categories</p>
            <div className="space-y-1.5">
              {topCategories.map(([cat, amt]: any) => (
                <div key={cat} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{cat}</span>
                  <div className="flex items-center gap-2 flex-1 max-w-[60%] ml-3">
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-red-500 h-full" style={{ width: `${totals.total > 0 ? (amt / totals.total) * 100 : 0}%` }} />
                    </div>
                    <span className="font-medium text-slate-700 w-20 text-right">{formatCurrency(amt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Description</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Vendor</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-center hidden sm:table-cell">Mode</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">Loading...</TableCell></TableRow>
                ) : expenses.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    <Receipt className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    No expenses yet. Click "Add Expense" to start tracking.
                  </TableCell></TableRow>
                ) : (
                  expenses.map((e: any) => (
                    <TableRow key={e.id} className="hover:bg-slate-50">
                      <TableCell className="text-xs">{e.date ? new Date(e.date).toLocaleDateString('en-IN') : '-'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] bg-slate-50">{e.category}</Badge></TableCell>
                      <TableCell className="text-sm hidden sm:table-cell max-w-[200px] truncate">{e.description}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell text-slate-500">{e.vendor || '-'}</TableCell>
                      <TableCell className="text-right font-semibold text-red-600">{formatCurrency(e.amount)}</TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        <Badge variant="outline" className="text-[9px]">{e.mode}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEdit(e)}>
                            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDelete(e.id)}>
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

      {/* Add/Edit Dialog */}
      {dialogOpen && (
        <ExpenseDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          onSaved={() => { setDialogOpen(false); refetch() }}
        />
      )}
    </div>
  )
}

function ExpenseDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: any | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    category: editing?.category || 'Rent',
    description: editing?.description || '',
    amount: editing?.amount || 0,
    mode: editing?.mode || 'Cash',
    date: editing?.date ? new Date(editing.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    vendor: editing?.vendor || '',
    reference: editing?.reference || '',
    notes: editing?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.amount || form.amount <= 0) {
      toast({ title: 'Amount must be greater than 0', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await apiPut(`/api/expenses/${editing.id}`, form)
        toast({ title: 'Expense updated' })
      } else {
        await apiPost('/api/expenses', form)
        toast({ title: 'Expense added' })
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
            <Receipt className="w-5 h-5 text-red-600" />
            {editing ? 'Edit Expense' : 'Add Expense'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Amount (Rs.) *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="h-10" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What was this expense for?" className="h-10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-10" />
            </div>
            <div>
              <Label className="text-xs">Mode</Label>
              <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Bank">Bank</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Vendor / Payee</Label>
            <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Who did you pay?" className="h-10" />
          </div>
          <div>
            <Label className="text-xs">Reference (cheque no, transaction ID)</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="h-10" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-red-600 hover:bg-red-700">
            {saving ? 'Saving...' : (editing ? 'Update' : 'Add Expense')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
