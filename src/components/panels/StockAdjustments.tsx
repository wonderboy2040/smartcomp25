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
import { Plus, ClipboardList, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function StockAdjustmentsPanel() {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [itemId, setItemId] = useState('')
  const [adjType, setAdjType] = useState<'set' | 'add' | 'subtract'>('set')
  const [quantity, setQuantity] = useState(0)
  const [reason, setReason] = useState('correction')
  const [notes, setNotes] = useState('')

  const { data: adjustments, loading, refetch } = useFetch<any[]>('/api/stock-adjustments', undefined)
  const { data: items } = useFetch<any[]>('/api/items', undefined)

  const stats = useMemo(() => {
    const list = adjustments || []
    const totalAdjustments = list.length
    const totalAdded = list.filter((a) => a.change > 0).reduce((s, a) => s + a.change, 0)
    const totalRemoved = list.filter((a) => a.change < 0).reduce((s, a) => s + Math.abs(a.change), 0)
    return { totalAdjustments, totalAdded, totalRemoved }
  }, [adjustments])

  const openDialog = () => {
    setItemId('')
    setAdjType('set')
    setQuantity(0)
    setReason('correction')
    setNotes('')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!itemId) {
      toast({ title: 'Select an item', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await apiPost('/api/stock-adjustments', {
        itemId,
        adjustmentType: adjType,
        quantity,
        reason,
        notes,
      })
      toast({
        title: 'Stock adjusted ✓',
        description: 'Quantity updated successfully',
        duration: 3500,
      })
      setDialogOpen(false)
      refetch()
    } catch (e: any) {
      toast({ title: 'Adjustment failed', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const selectedItem = (items || []).find((i) => i.id === itemId)
  const currentQty = selectedItem ? Number(selectedItem.quantity) || 0 : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-600 flex-shrink-0" />
            <span className="truncate">Stock Adjustments</span>
            <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200">
              {stats.totalAdjustments} entries
            </Badge>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Stock-take reconciliation, damage/theft/loss adjustments
          </p>
        </div>
        <Button onClick={openDialog} className="bg-cyan-600 hover:bg-cyan-700 text-white h-11">
          <Plus className="w-4 h-4 mr-1.5" /> New Adjustment
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-cyan-200 bg-cyan-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="w-4 h-4 text-cyan-600" />
              <p className="text-xs font-medium text-slate-600">Total Entries</p>
            </div>
            <p className="text-2xl font-bold text-cyan-700">{stats.totalAdjustments}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <p className="text-xs font-medium text-slate-600">Stock Added</p>
            </div>
            <p className="text-2xl font-bold text-green-700">+{stats.totalAdded}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <p className="text-xs font-medium text-slate-600">Stock Removed</p>
            </div>
            <p className="text-2xl font-bold text-red-700">-{stats.totalRemoved}</p>
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Adjustment History</h2>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading...</p>
          ) : (!adjustments || adjustments.length === 0) ? (
            <p className="text-sm text-slate-400 text-center py-4">No stock adjustments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Item</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs text-right">Prev Qty</TableHead>
                  <TableHead className="text-xs text-right">New Qty</TableHead>
                  <TableHead className="text-xs text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(adjustments || []).slice(0, 50).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{new Date(a.createdAt).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell className="text-xs font-medium">{a.itemName}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{a.adjustmentType}</Badge></TableCell>
                    <TableCell className="text-xs"><Badge variant="outline" className="text-[10px] capitalize">{a.reason}</Badge></TableCell>
                    <TableCell className="text-xs text-right text-slate-500">{a.previousQty}</TableCell>
                    <TableCell className="text-xs text-right font-bold">{a.newQty}</TableCell>
                    <TableCell className={`text-xs text-right font-bold ${(a.change || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {a.change > 0 ? `+${a.change}` : a.change}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-cyan-600" />
              New Stock Adjustment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium">Select Item</Label>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Search item..." /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {(items || []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} (Stock: {i.quantity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedItem && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <p className="text-xs text-blue-900">Current stock: <span className="font-bold">{currentQty} {selectedItem.unit || 'pcs'}</span></p>
              </div>
            )}
            <div>
              <Label className="text-xs font-medium">Adjustment Type</Label>
              <Select value={adjType} onValueChange={(v) => setAdjType(v as any)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="set">Set (Stock-take: set absolute qty)</SelectItem>
                  <SelectItem value="add">Add (Found extra stock)</SelectItem>
                  <SelectItem value="subtract">Subtract (Damage/Theft/Loss)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">
                {adjType === 'set' ? 'New Quantity' : adjType === 'add' ? 'Quantity to Add' : 'Quantity to Remove'}
              </Label>
              <Input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="mt-1" min={0} />
            </div>
            <div>
              <Label className="text-xs font-medium">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="correction">Correction (data entry error)</SelectItem>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="theft">Theft</SelectItem>
                  <SelectItem value="loss">Loss</SelectItem>
                  <SelectItem value="expiry">Expiry</SelectItem>
                  <SelectItem value="found">Found (extra stock)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Details about this adjustment..." className="mt-1 h-16" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
              {saving ? 'Saving...' : 'Save Adjustment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
