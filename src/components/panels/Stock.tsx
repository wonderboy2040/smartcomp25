'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useFetch, apiPut, apiDelete } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle, Download, Tag, Folder, IndianRupee, TrendingUp, Boxes, Percent, FileText, Hash, KeyRound } from 'lucide-react'
import { toCSV, downloadCSV } from '@/lib/utils'

export const PRESET_CATEGORIES = [
  'Laptop',
  'Desktop PC',
  'Processor / CPU',
  'Motherboard',
  'RAM / Memory',
  'SSD / Hard Drive',
  'Graphics Card',
  'Power Supply (SMPS)',
  'Cabinet / Case',
  'Monitor / Display',
  'Keyboard & Mouse',
  'Printer & Scanner',
  'Networking & Wifi',
  'CCTV & Security',
  'Accessories & Cables',
  'Software & OS',
  'Repair Parts & Spares',
  'General',
]

export function StockPanel() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const { toast } = useToast()

  const { data: items, loading, refetch } = useFetch<any[]>('/api/items', undefined)
  const { data: suppliers } = useFetch<any[]>('/api/suppliers?active=true', undefined)

  // Merge items' actual categories with preset categories
  const categories = useMemo(() => {
    const itemCats = (items || []).map((i) => i.category).filter(Boolean)
    return Array.from(new Set([...itemCats, ...PRESET_CATEGORIES]))
  }, [items])

  const categoryStats = useMemo(() => {
    const counts = new Map<string, number>()
    ;(items || []).forEach((i) => {
      const cat = i.category || 'General'
      counts.set(cat, (counts.get(cat) || 0) + 1)
    })
    return Array.from(counts.entries()).map(([category, count]) => ({ category, count }))
  }, [items])

  const filtered = useMemo(() => {
    return (items || []).filter((i) => {
      if (categoryFilter !== 'all' && (i.category || 'General') !== categoryFilter) return false
      if (showLowOnly && Number(i.quantity) > Number(i.minQuantity)) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          String(i.name || '').toLowerCase().includes(q) ||
          String(i.sku || '').toLowerCase().includes(q) ||
          String(i.category || '').toLowerCase().includes(q) ||
          String(i.brand || '').toLowerCase().includes(q) ||
          String(i.hsnCode || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [items, categoryFilter, showLowOnly, search])

  const handleAdd = useCallback(() => {
    setEditing(null)
    setDialogOpen(true)
  }, [])

  const handleEdit = useCallback((item: any) => {
    setEditing(item)
    setDialogOpen(true)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this item?')) return
    try {
      await apiDelete(`/api/items/${id}`)
      toast({
        title: 'Item deleted ✓',
        description: 'Removed locally - syncing to cloud',
        duration: 3500,
      })
      refetch()
    } catch (e: any) {
      toast({
        title: 'Delete failed',
        description: e.message,
        variant: 'destructive',
        duration: 6000,
      })
    }
  }, [refetch, toast])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            Stock & Inventory
            <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border-violet-200 dark:border-violet-800">
              <Folder className="w-3 h-3 mr-1" /> {categoryStats.length} Categories
            </Badge>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage items, category tags, GST rates, prices and quantities</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            const csv = toCSV(filtered as any[], ['name','sku','category','quantity','costPrice','sellingPrice','gstRate'])
            downloadCSV(csv, `stock-${new Date().toISOString().split('T')[0]}.csv`)
          }} className="h-11" size="sm">
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
          <Button onClick={handleAdd} className="bg-slate-900 hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-700 text-white h-11">
            <Plus className="w-4 h-4 mr-1.5" /> Add Item
          </Button>
        </div>
      </div>

      {/* ===== Inventory summary cards ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><Boxes className="w-4 h-4 text-blue-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Items</p>
                <p className="text-sm sm:text-base font-bold text-slate-900 truncate">{(items || []).length}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{filtered.length} shown</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><IndianRupee className="w-4 h-4 text-slate-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Cost Value</p>
                <p className="text-sm sm:text-base font-bold text-slate-900 truncate">{formatCurrency(sumBy(items || [], (i) => (Number(i.quantity) || 0) * (Number(i.costPrice) || 0)))}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Qty × Cost</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Selling Value</p>
                <p className="text-sm sm:text-base font-bold text-emerald-700 truncate">{formatCurrency(sumBy(items || [], (i) => (Number(i.quantity) || 0) * (Number(i.sellingPrice) || 0)))}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Qty × Sell</p>
          </CardContent>
        </Card>
        <Card className={`border-slate-200 bg-white ${(items || []).filter((i) => Number(i.quantity) <= Number(i.minQuantity)).length > 0 ? 'ring-2 ring-red-200' : ''}`}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-600" /></div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Low Stock</p>
                <p className="text-sm sm:text-base font-bold text-red-700 truncate">{(items || []).filter((i) => Number(i.quantity) <= Number(i.minQuantity)).length}</p>
              </div>
            </div>
            <p className="text-[10px] text-red-500 mt-1">Reorder needed</p>
          </CardContent>
        </Card>
      </div>

      {/* Potential profit banner */}
      {(() => {
        const cost = sumBy(items || [], (i) => (Number(i.quantity) || 0) * (Number(i.costPrice) || 0))
        const sell = sumBy(items || [], (i) => (Number(i.quantity) || 0) * (Number(i.sellingPrice) || 0))
        const profit = sell - cost
        const margin = sell > 0 ? (profit / sell) * 100 : 0
        return (
          <Card className="border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0"><Percent className="w-4 h-4 text-violet-600" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-violet-700 uppercase font-medium">Potential Profit on Current Stock</p>
                <p className="text-sm font-bold text-violet-900">
                  {formatCurrency(profit)} <span className="text-[10px] font-medium text-violet-600">({margin.toFixed(1)}% margin)</span>
                </p>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
              <Input
                placeholder="Search name, SKU, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-11"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48 h-11">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories ({items?.length || 0})</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={showLowOnly ? 'default' : 'outline'}
              onClick={() => setShowLowOnly(!showLowOnly)}
              className={`h-11 flex-1 sm:flex-none ${showLowOnly ? 'bg-red-500 hover:bg-red-600 text-white' : ''}`}
            >
              <AlertTriangle className="w-4 h-4 sm:mr-1.5" />
              <span className="sm:inline">Low Stock Only</span>
              <span className="sm:hidden">Low Stock</span>
            </Button>
          </div>

          {/* Quick Category Chips Bar */}
          {categoryStats.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 scrollbar-thin">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 flex-shrink-0 ${
                  categoryFilter === 'all'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Tag className="w-3 h-3" /> All ({items?.length || 0})
              </button>
              {categoryStats.map(({ category, count }) => (
                <button
                  key={category}
                  onClick={() => setCategoryFilter(category === categoryFilter ? 'all' : category)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 flex-shrink-0 ${
                    categoryFilter === category
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{category}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    categoryFilter === category ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobile card layout */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <Card><CardContent className="text-center py-8 text-slate-500">Loading...</CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="text-center py-8 text-slate-500">
            <Package className="w-12 h-12 mx-auto mb-2 text-slate-300" />
            No items found. Add your first item.
          </CardContent></Card>
        ) : (
          filtered.map((item) => {
            const lowStock = item.quantity <= item.minQuantity
            return (
              <Card key={item.id} className={`border-slate-200 ${lowStock ? 'border-red-200 bg-red-50/30' : ''}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 text-sm">{item?.name || ""}</p>
                      <p className="text-[10px] text-slate-500">{item.sku}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEdit(item)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                    <div>
                      <span className="text-slate-500">Cost: </span>
                      <span className="font-medium">{formatCurrency(item.costPrice)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Selling: </span>
                      <span className="font-medium">{formatCurrency(item.sellingPrice)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 flex-wrap gap-1">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[9px]">{item.category}</Badge>
                      {item.gstApplicable ? (
                        <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 text-[9px]">{item.gstRate}%</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px]">No GST</Badge>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        lowStock
                          ? 'bg-red-50 text-red-700 border-red-200 text-[9px]'
                          : 'bg-green-50 text-green-700 border-green-200 text-[9px]'
                      }
                    >
                      {item.quantity} {item.unit}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Desktop table layout */}
      <Card className="border-slate-200 hidden sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>HSN</TableHead>
                  <TableHead className="text-center">GST</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Selling</TableHead>
                  <TableHead className="text-center">Stock</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500">Loading...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                      <Package className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      No items found. Add your first item.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((item) => {
                    const lowStock = item.quantity <= item.minQuantity
                    return (
                      <TableRow key={item.id} className="hover:bg-slate-50">
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">{item?.name || ""}</p>
                            <p className="text-xs text-slate-500">{item.sku}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{item.hsnCode || '-'}</TableCell>
                        <TableCell className="text-center">
                          {item.gstApplicable ? (
                            <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 text-[10px]">{item.gstRate}%</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">No GST</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(item.costPrice)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(item.sellingPrice)}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              lowStock
                                ? 'bg-red-50 text-red-700 border-red-200 text-[10px]'
                                : 'bg-green-50 text-green-700 border-green-200 text-[10px]'
                            }
                          >
                            {item.quantity} {item.unit}
                          </Badge>
                          {lowStock && (
                            <p className="text-[10px] text-red-500 mt-0.5">Min: {item.minQuantity}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{item.supplier?.name || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
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

      <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        suppliers={suppliers || []}
        onSaved={() => {
          setDialogOpen(false)
          refetch()
        }}
      />
    </div>
  )
}

function ItemDialog({
  open, onOpenChange, editing, suppliers, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: any | null
  suppliers: any[]
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? { ...editing }
          : {
              name: '', sku: '', category: 'General', hsnCode: '',
              description: '', serialNumbers: '',
              isDigitalProduct: false, digitalKeys: '',
              gstApplicable: true, gstRate: 18,
              costPrice: 0, sellingPrice: 0, quantity: 0, minQuantity: 0,
              unit: 'pcs', supplierId: '',
            }
      )
    }
  }, [open, editing])

  const handleSave = async () => {
    if (!form.name || !form.sku) {
      toast({ title: 'Name and SKU are required', variant: 'destructive', duration: 5000 })
      return
    }
    setSaving(true)
    const start = Date.now()
    try {
      if (editing) {
        await apiPut(`/api/items/${editing.id}`, form)
        const elapsed = Date.now() - start
        toast({
          title: `Item updated ✓ ${elapsed}ms`,
          description: `${form.name} - syncs to cloud`,
          duration: 4000,
        })
      } else {
        // ULTRA-ULTRA FAST: Instant optimistic + background sync
        const { apiPostUltraFast } = await import('@/lib/api')
        const temp = await apiPostUltraFast('/api/items', form, { instantClose: true })
        const elapsed = Date.now() - start
        toast({
          title: `Item added instantly! ✓ ${elapsed}ms`,
          description: `${form.name} - SKU: ${temp.sku || ''} - Syncing in background`,
          duration: 4000,
        })
      }
      onSaved()
    } catch (e: any) {
      toast({
        title: 'Error saving item',
        description: e.message,
        variant: 'destructive',
        duration: 6000,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Item' : 'Add New Item'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Item Name *</Label>
            <Input
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. HP Laptop 15s"
              className="mt-1"
            />
          </div>
          <div>
            <Label>SKU *</Label>
            <Input
              value={form.sku || ''}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="e.g. LAP-HP-15S"
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Category</Label>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Select preset or type custom</span>
            </div>
            <div className="flex gap-2">
              <Select
                value={PRESET_CATEGORIES.includes(form.category) ? form.category : 'custom'}
                onValueChange={(val) => {
                  if (val !== 'custom') setForm({ ...form, category: val })
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Preset Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">✍️ Custom Category...</SelectItem>
                  {PRESET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={form.category || ''}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Category name..."
                className="flex-1"
              />
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {['Laptop', 'Desktop PC', 'RAM / Memory', 'SSD / Hard Drive', 'Printer & Scanner', 'General'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, category: c })}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                    form.category === c
                      ? 'bg-violet-600 text-white border-violet-600 font-medium'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  + {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>HSN Code</Label>
            <Input
              value={form.hsnCode || ''}
              onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
              placeholder="e.g. 8471"
            />
          </div>
          <div>
            <Label>Unit</Label>
            <Input
              value={form.unit || 'pcs'}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="pcs"
            />
          </div>
          <div>
            <Label>Cost Price (Rs.)</Label>
            <Input
              type="number"
              value={form.costPrice || 0}
              onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Selling Price (Rs.)</Label>
            <Input
              type="number"
              value={form.sellingPrice || 0}
              onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Quantity in Stock</Label>
            <Input
              type="number"
              value={form.quantity || 0}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Min Quantity (alert)</Label>
            <Input
              type="number"
              value={form.minQuantity || 0}
              onChange={(e) => setForm({ ...form, minQuantity: Number(e.target.value) })}
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <Checkbox
              id="gst"
              checked={form.gstApplicable !== false}
              onCheckedChange={(v) => setForm({ ...form, gstApplicable: v === true })}
            />
            <Label htmlFor="gst" className="cursor-pointer">GST Applicable</Label>
            {form.gstApplicable !== false && (
              <Select
                value={String(form.gstRate ?? 18)}
                onValueChange={(v) => setForm({ ...form, gstRate: Number(v) })}
              >
                <SelectTrigger className="w-24 ml-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="5">5%</SelectItem>
                  <SelectItem value="12">12%</SelectItem>
                  <SelectItem value="18">18%</SelectItem>
                  <SelectItem value="28">28%</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="sm:col-span-2">
            <Label>Supplier</Label>
            <Select
              value={form.supplierId || 'none'}
              onValueChange={(v) => setForm({ ...form, supplierId: v === 'none' ? '' : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select supplier (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Supplier</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Product Description / Specification ── */}
          <div className="sm:col-span-2">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="w-3.5 h-3.5 text-violet-500" />
              <Label>Product Description / Specification</Label>
            </div>
            <Textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Enter product details, specs, features, warranty info etc..."
              rows={3}
              className="resize-y"
            />
            <p className="text-[10px] text-slate-400 mt-1">Add detailed specs like RAM, Storage, Processor, Warranty etc.</p>
          </div>

          {/* ── Serial Numbers ── */}
          <div className="sm:col-span-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Hash className="w-3.5 h-3.5 text-blue-500" />
              <Label>Serial Numbers</Label>
            </div>
            <Textarea
              value={form.serialNumbers || ''}
              onChange={(e) => setForm({ ...form, serialNumbers: e.target.value })}
              placeholder="Enter serial numbers (one per line)&#10;e.g.&#10;SN-001-ABC-2024&#10;SN-002-DEF-2024"
              rows={3}
              className="resize-y font-mono text-xs"
            />
            <p className="text-[10px] text-slate-400 mt-1">One serial number per line. Track individual units for warranty & service.</p>
          </div>

          {/* ── Digital Product Keys ── */}
          <div className="sm:col-span-2 space-y-2">
            <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <Checkbox
                id="digitalProduct"
                checked={form.isDigitalProduct === true}
                onCheckedChange={(v) => setForm({ ...form, isDigitalProduct: v === true })}
              />
              <div className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                <Label htmlFor="digitalProduct" className="cursor-pointer text-amber-800 dark:text-amber-300">
                  This is a Digital Product (Software Key / License)
                </Label>
              </div>
            </div>
            {form.isDigitalProduct && (
              <div>
                <Textarea
                  value={form.digitalKeys || ''}
                  onChange={(e) => setForm({ ...form, digitalKeys: e.target.value })}
                  placeholder="Enter license keys / activation codes (one per line)&#10;e.g.&#10;XXXXX-XXXXX-XXXXX-XXXXX-XXXXX&#10;YYYYY-YYYYY-YYYYY-YYYYY-YYYYY"
                  rows={4}
                  className="resize-y font-mono text-xs"
                />
                <p className="text-[10px] text-slate-400 mt-1">One key per line. Keys will be tracked and can be assigned to customers on sale.</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-slate-900 hover:bg-slate-800 w-full sm:w-auto">
            {saving ? 'Saving...' : editing ? 'Update Item' : 'Add Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
