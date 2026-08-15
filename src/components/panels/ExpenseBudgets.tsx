'use client'

import { useState, useMemo } from 'react'
import { useFetch, apiPost, apiDelete } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/calc'
import { Plus, PiggyBank, TrendingUp, TrendingDown, AlertTriangle, Trash2, Target } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function ExpenseBudgetsPanel() {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)

  const [catInput, setCatInput] = useState('')
  const [amtInput, setAmtInput] = useState(0)

  const { data: budgetData, loading, refetch } = useFetch<any>(`/api/expense-budgets?month=${month}`, undefined)

  const budgets = budgetData?.budgets || []
  const totalBudget = budgetData?.totalBudget || 0
  const totalActual = budgetData?.totalActual || 0
  const totalVariance = budgetData?.totalVariance || 0
  const totalVariancePct = budgetData?.totalVariancePct || 0

  const handleSave = async () => {
    if (!catInput.trim()) {
      toast({ title: 'Category is required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await apiPost('/api/expense-budgets', {
        category: catInput.trim(),
        month,
        amount: amtInput,
      })
      toast({ title: 'Budget saved ✓', duration: 3000 })
      setDialogOpen(false)
      setCatInput('')
      setAmtInput(0)
      refetch()
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this budget?')) return
    try {
      await apiDelete(`/api/expense-budgets?id=${id}`)
      toast({ title: 'Budget deleted ✓' })
      refetch()
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' })
    }
  }

  const overBudgetCount = budgets.filter((b: any) => b.status === 'over').length
  const warningCount = budgets.filter((b: any) => b.status === 'warning').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PiggyBank className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 flex-shrink-0" />
            <span className="truncate">Expense Budgets</span>
            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
              {budgets.length} categories
            </Badge>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Monthly budgets vs actual spend + variance tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40 h-11" />
          <Button onClick={() => setDialogOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white h-11">
            <Plus className="w-4 h-4 mr-1.5" /> Add Budget
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-purple-600" />
              <p className="text-xs font-medium text-slate-600">Total Budget</p>
            </div>
            <p className="text-xl font-bold text-purple-700">Rs.{formatCurrency(totalBudget)}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <p className="text-xs font-medium text-slate-600">Actual Spend</p>
            </div>
            <p className="text-xl font-bold text-blue-700">Rs.{formatCurrency(totalActual)}</p>
          </CardContent>
        </Card>
        <Card className={`${totalVariance >= 0 ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}" />
              <p className="text-xs font-medium text-slate-600">Variance</p>
            </div>
            <p className={`text-xl font-bold ${totalVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {totalVariance >= 0 ? '+' : ''}Rs.{formatCurrency(totalVariance)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">{totalVariancePct >= 0 ? '+' : ''}{totalVariancePct}%</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-xs font-medium text-slate-600">Alerts</p>
            </div>
            <p className="text-xl font-bold text-amber-700">{overBudgetCount + warningCount}</p>
            <p className="text-[10px] text-slate-500 mt-1">{overBudgetCount} over, {warningCount} warning</p>
          </CardContent>
        </Card>
      </div>

      {/* Budgets Table */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Budget vs Actual — {month}</h2>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading...</p>
          ) : budgets.length === 0 ? (
            <div className="text-center py-8">
              <PiggyBank className="w-12 h-12 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No budgets set for {month}.</p>
              <p className="text-xs text-slate-400 mt-1">Click "Add Budget" to set monthly category limits.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-right">Budget</TableHead>
                  <TableHead className="text-xs text-right">Actual</TableHead>
                  <TableHead className="text-xs text-right">Variance</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs font-medium">{b.category}</TableCell>
                    <TableCell className="text-xs text-right">Rs.{formatCurrency(b.budgetAmount)}</TableCell>
                    <TableCell className="text-xs text-right font-bold">Rs.{formatCurrency(b.actualAmount)}</TableCell>
                    <TableCell className={`text-xs text-right font-bold ${b.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {b.variance >= 0 ? '+' : ''}Rs.{formatCurrency(b.variance)}
                      <span className="text-[10px] block text-slate-400">({b.variancePct >= 0 ? '+' : ''}{b.variancePct}%)</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {b.status === 'over' && <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Over</Badge>}
                      {b.status === 'warning' && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Warning</Badge>}
                      {b.status === 'ok' && <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">OK</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(b.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" />
              Set Budget for {month}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium">Category</Label>
              <Input value={catInput} onChange={(e) => setCatInput(e.target.value)} placeholder="e.g. Rent, Salary, Electricity" className="mt-1" list="expense-categories" />
              <datalist id="expense-categories">
                <option value="Rent" />
                <option value="Salary" />
                <option value="Electricity" />
                <option value="Internet" />
                <option value="Telephone" />
                <option value="Transport" />
                <option value="Maintenance" />
                <option value="Marketing" />
                <option value="Office Supplies" />
                <option value="Miscellaneous" />
              </datalist>
            </div>
            <div>
              <Label className="text-xs font-medium">Budget Amount (Rs.)</Label>
              <Input type="number" value={amtInput} onChange={(e) => setAmtInput(Number(e.target.value))} className="mt-1" min={0} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
              {saving ? 'Saving...' : 'Save Budget'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
