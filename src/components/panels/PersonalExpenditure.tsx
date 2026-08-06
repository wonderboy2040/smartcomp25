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
import { Wallet, Plus, Trash2, Edit3, TrendingUp, TrendingDown, IndianRupee, ArrowUpRight, ArrowDownRight, Filter } from 'lucide-react'

const INCOME_CATEGORIES = ['Salary', 'Business Profit', 'Commission', 'Rent Income', 'Interest', 'Gift', 'Other Income']
const EXPENSE_CATEGORIES = ['Food', 'Rent', 'Transport', 'Bills', 'Shopping', 'Health', 'Education', 'Entertainment', 'Fuel', 'Mobile', 'Other']

export function PersonalExpenditurePanel() {
  const { toast } = useToast()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [filterKey, setFilterKey] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)

  const query = `/api/personal-expenditure${filterKey ? `?${filterKey}` : ''}`
  const { data, loading, refetch } = useFetch<any>(query, undefined)

  const entries = data?.entries || []
  const totals = data?.totals || {}

  const applyFilter = () => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (typeFilter !== 'all') params.set('type', typeFilter)
    setFilterKey(params.toString())
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return
    try {
      await apiDelete(`/api/personal-expenditure/${id}`)
      toast({ title: 'Entry deleted' })
      refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  const handleEdit = (e: any) => { setEditing(e); setDialogOpen(true) }
  const handleAdd = () => { setEditing(null); setDialogOpen(true) }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 flex-shrink-0" />
            <span className="truncate">Personal Expenditure</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Track your daily personal income and expenses
          </p>
        </div>
        <Button onClick={handleAdd} className="bg-purple-600 hover:bg-purple-700 h-11">
          <Plus className="w-4 h-4 mr-1.5" /> <span className="hidden sm:inline">Add Entry</span><span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Today's summary */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-emerald-700 uppercase">Today's Income</span>
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-base sm:text-xl font-bold text-emerald-700">{formatCurrency(totals.todayIncome || 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-red-700 uppercase">Today's Expense</span>
              <ArrowDownRight className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-base sm:text-xl font-bold text-red-700">{formatCurrency(totals.todayExpense || 0)}</p>
          </CardContent>
        </Card>
        <Card className={`border-2 ${(totals.todayNet || 0) >= 0 ? 'bg-emerald-100 border-emerald-300' : 'bg-red-100 border-red-300'}`}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-700 uppercase">Today's Net</span>
              <IndianRupee className="w-4 h-4 text-slate-600" />
            </div>
            <p className={`text-base sm:text-xl font-bold ${(totals.todayNet || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatCurrency(totals.todayNet || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Month summary */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">This Month Income</p>
            <p className="text-sm sm:text-lg font-bold text-emerald-600">{formatCurrency(totals.monthIncome || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">This Month Expense</p>
            <p className="text-sm sm:text-lg font-bold text-red-600">{formatCurrency(totals.monthExpense || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">Month Net</p>
            <p className={`text-sm sm:text-lg font-bold ${(totals.monthNet || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(totals.monthNet || 0)}
            </p>
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
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32 h-10"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={applyFilter} className="bg-purple-600 hover:bg-purple-700 h-10">
          <Filter className="w-4 h-4 mr-1" /> Filter
        </Button>
      </div>

      {/* Filtered summary */}
      {filterKey && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-xs text-purple-700">Filtered: {totals.filterCount || 0} entries</span>
          <div className="flex gap-4 text-xs">
            <span className="text-emerald-600">Income: {formatCurrency(totals.filterIncome || 0)}</span>
            <span className="text-red-600">Expense: {formatCurrency(totals.filterExpense || 0)}</span>
            <span className={`font-bold ${(totals.filterNet || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              Net: {formatCurrency(totals.filterNet || 0)}
            </span>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Description</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Person</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">Loading...</TableCell></TableRow>
                ) : entries.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    <Wallet className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    No entries yet. Click "Add Entry" to start tracking.
                  </TableCell></TableRow>
                ) : (
                  entries.map((e: any) => (
                    <TableRow key={e.id} className="hover:bg-slate-50">
                      <TableCell className="text-xs">
                        {e.date ? new Date(e.date).toLocaleDateString('en-IN') : '-'}
                        <div className="text-[10px] text-slate-400">
                          {e.date ? new Date(e.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[9px] ${e.type === 'income' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          {e.type === 'income' ? <ArrowUpRight className="w-3 h-3 mr-0.5 inline" /> : <ArrowDownRight className="w-3 h-3 mr-0.5 inline" />}
                          {e.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{e.category}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell max-w-[200px] truncate">{e.description}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell text-slate-500">{e.person || '-'}</TableCell>
                      <TableCell className={`text-right font-semibold ${e.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {e.type === 'income' ? '+' : '-'}{formatCurrency(e.amount)}
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

      {dialogOpen && (
        <EntryDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={() => { setDialogOpen(false); refetch() }} />
      )}
    </div>
  )
}

function EntryDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: any | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    type: editing?.type || 'expense',
    category: editing?.category || 'Food',
    description: editing?.description || '',
    amount: editing?.amount || 0,
    mode: editing?.mode || 'Cash',
    date: editing?.date ? new Date(editing.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    person: editing?.person || '',
    notes: editing?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const submit = async () => {
    if (!form.amount || form.amount <= 0) {
      toast({ title: 'Amount must be greater than 0', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await apiPut(`/api/personal-expenditure/${editing.id}`, form)
        toast({ title: 'Entry updated' })
      } else {
        await apiPost('/api/personal-expenditure', form)
        toast({ title: 'Entry added' })
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
            <Wallet className="w-5 h-5 text-purple-600" />
            {editing ? 'Edit Entry' : 'Add Entry'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Type toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setForm({ ...form, type: 'expense', category: 'Food' })}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${form.type === 'expense' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              <TrendingDown className="w-4 h-4" /> Expense
            </button>
            <button
              onClick={() => setForm({ ...form, type: 'income', category: 'Salary' })}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${form.type === 'income' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              <TrendingUp className="w-4 h-4" /> Income
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What was this for?" className="h-10" />
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
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Person (optional)</Label>
            <Input value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} placeholder="Who spent/received?" className="h-10" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className={form.type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}>
            {saving ? 'Saving...' : (editing ? 'Update' : 'Add Entry')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
