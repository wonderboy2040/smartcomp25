'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useFetch, apiPut, apiDelete, apiPost } from '@/lib/api'
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
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle, Download, Tag, Folder, IndianRupee, TrendingUp, Boxes, Percent, FileText, Hash, KeyRound, ScanLine } from 'lucide-react'
import { toCSV, downloadCSV } from '@/lib/utils'
import { BarcodeScanner } from '@/components/BarcodeScanner'

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
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
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
      ; (items || []).forEach((i) => {
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

  const handleAddPurchase = useCallback(() => {
    setPurchaseDialogOpen(true)
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
            const csv = toCSV(filtered as any[], ['name', 'sku', 'category', 'quantity', 'costPrice', 'sellingPrice', 'gstRate'])
            downloadCSV(csv, `stock-${new Date().toISOString().split('T')[0]}.csv`)
          }} className="h-11" size="sm">
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
          <Button onClick={handleAddPurchase} variant="outline" className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 h-11">
            <Package className="w-4 h-4 mr-1.5" /> Add Purchase
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
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 flex-shrink-0 ${categoryFilter === 'all'
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 flex-shrink-0 ${categoryFilter === category
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                >
                  <span>{category}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${categoryFilter === category ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
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
                      {item.gstApplicable && Number(item.gstRate) > 0 && (
                        <span className="text-[10px] text-emerald-600 block font-medium">
                          incl GST: {formatCurrency(Number(item.sellingPrice) * (1 + (Number(item.gstRate) || 0) / 100))}
                        </span>
                      )}
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
                            {/* Confirms at a glance that serials / keys actually
                                persisted — they are stored per unit, not on the row. */}
                            {((item.availableKeys?.length || 0) > 0 || (item.availableSerials?.length || 0) > 0) && (
                              <div className="flex gap-1 mt-1">
                                {(item.availableKeys?.length || 0) > 0 && (
                                  <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                                    <KeyRound className="w-2.5 h-2.5 mr-0.5" />{item.availableKeys.length} keys
                                  </Badge>
                                )}
                                {(item.availableSerials?.length || 0) > 0 && (
                                  <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">
                                    <Hash className="w-2.5 h-2.5 mr-0.5" />{item.availableSerials.length} serials
                                  </Badge>
                                )}
                              </div>
                            )}
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
                        <TableCell className="text-right text-sm font-medium">
                          {formatCurrency(item.sellingPrice)}
                          {item.gstApplicable && Number(item.gstRate) > 0 && (
                            <p className="text-[10px] text-emerald-600 font-normal">
                              incl GST {formatCurrency(Number(item.sellingPrice) * (1 + (Number(item.gstRate) || 0) / 100))}
                            </p>
                          )}
                        </TableCell>
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

      <PurchaseDialog
        open={purchaseDialogOpen}
        onOpenChange={setPurchaseDialogOpen}
        items={items || []}
        refetch={refetch}
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
  // Barcode scanner held in the Item dialog: scanning fills the barcode field
  // so the item is visible in /api/items?barcode= lookups (billing + stock).
  const [showBarcodeDialog, setShowBarcodeDialog] = useState(false)

  // On scan, fill the barcode field so the item is searchable by barcode.
  const handleScan = useCallback((barcode: string) => {
    setShowBarcodeDialog(false)
    setForm((prev: any) => ({ ...prev, barcode: barcode.trim() }))
    toast({ title: `Barcode: ${barcode.trim()}`, description: 'Saved to this item', duration: 3000 })
  }, [toast])

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? {
              ...editing,
            // Serials and keys live in the ItemSerials sheet, not on the item
            // row. Seed the textareas from the unsold units the list endpoint
            // already returned so an edit shows what is on file instead of an
            // empty box (re-typing them used to be the only way to see them).
            serialNumbers: (editing.availableSerials || []).join('\n'),
            digitalKeys: (editing.availableKeys || []).join('\n'),
            isDigitalProduct:
              editing.isDigitalProduct === true ||
              editing.isDigitalProduct === 'true' ||
              (editing.availableKeys || []).length > 0,
          }
          : {
            name: '', sku: '', barcode: '', category: 'General', hsnCode: '',
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
        // apiPost is optimistic too — the row appears in the list behind this
        // dialog immediately — but unlike the fire-and-forget variant it waits
        // for confirmation, so a failed save reports an error instead of
        // silently looking like it worked.
        const { apiPost } = await import('@/lib/api')
        const created: any = await apiPost('/api/items', form)
        const elapsed = Date.now() - start
        const extras: string[] = []
        if (created?.serialsCreated) extras.push(`${created.serialsCreated} serial no.`)
        if (created?.keysCreated) extras.push(`${created.keysCreated} product key`)
        toast({
          title: `Item added ✓ ${elapsed}ms`,
          description: `${form.name} — SKU: ${created?.sku || form.sku || ''}${extras.length ? ` • saved ${extras.join(' + ')}` : ''}`,
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
          <div className="relative">
            <Label>Barcode</Label>
            <div className="flex gap-1 mt-1">
              <Input
                value={form.barcode || ''}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="Scan or type barcode"
                className="flex-1"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 px-2 border-slate-300 flex-shrink-0"
                title="Scan barcode"
                onClick={() => setShowBarcodeDialog(true)}
              >
                <ScanLine className="w-4 h-4" />
              </Button>
            </div>
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
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${form.category === c
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

        {showBarcodeDialog && (
          <BarcodeScanner
            onScan={handleScan}
            onClose={() => setShowBarcodeDialog(false)}
            hint="Point at product barcode or QR code to attach to this item"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ===== PURCHASE DIALOG — add multiple items at once =====
interface PurchaseLine {
  mode: 'existing' | 'new'
  itemId: string
  quantity: number
  costPrice: number
  sellingPrice: number
  // New-item fields (used when mode === 'new')
  newName: string
  newSku: string
  newCategory: string
  newGstApplicable: boolean
  newGstRate: number
  newUnit: string
  newHsnCode: string
  newBarcode: string
}

function PurchaseDialog({
  open, onOpenChange, items, refetch,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: any[]
  refetch: () => void
}) {
  const emptyLine = (): PurchaseLine => ({
    mode: 'existing',
    itemId: '',
    quantity: 1,
    costPrice: 0,
    sellingPrice: 0,
    newName: '',
    newSku: '',
    newCategory: 'General',
    newGstApplicable: true,
    newGstRate: 18,
    newUnit: 'pcs',
    newHsnCode: '',
    newBarcode: '',
  })
  const [lines, setLines] = useState<PurchaseLine[]>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  // Reset lines when dialog opens
  useEffect(() => {
    if (open) setLines([emptyLine()])
  }, [open])

  const updateLine = (index: number, patch: Partial<PurchaseLine>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))

  const handleItemSelect = (index: number, itemId: string) => {
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    updateLine(index, {
      itemId,
      costPrice: Number(item.costPrice) || 0,
      sellingPrice: Number(item.sellingPrice) || 0,
    })
  }

  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index))

  const handleSave = async () => {
    // Validate lines
    const validExisting = lines.filter((l) => l.mode === 'existing' && l.itemId && l.quantity > 0)
    const validNew = lines.filter((l) => l.mode === 'new' && l.newName.trim() && l.quantity > 0)
    const validLines = [...validExisting, ...validNew]

    if (validLines.length === 0) {
      toast({ title: 'Add at least one item with quantity', variant: 'destructive' })
      return
    }

    // Validate new-item lines have a name
    const newWithoutName = lines.filter((l) => l.mode === 'new' && !l.newName.trim() && l.quantity > 0)
    if (newWithoutName.length > 0) {
      toast({ title: 'New items must have a name', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      let createdCount = 0
      let updatedCount = 0

      for (const line of validLines) {
        if (line.mode === 'new') {
          // Create the new item first, then set its quantity
          const created: any = await apiPost('/api/items', {
            name: line.newName.trim(),
            sku: line.newSku.trim(),
            category: line.newCategory,
            barcode: line.newBarcode.trim(),
            hsnCode: line.newHsnCode.trim(),
            unit: line.newUnit,
            gstApplicable: line.newGstApplicable,
            gstRate: line.newGstRate,
            costPrice: line.costPrice,
            sellingPrice: line.sellingPrice,
            quantity: line.quantity,
            minQuantity: 0,
          })
          createdCount++
          // The POST already sets quantity, so no need for a second PUT
        } else {
          // Existing item — add to current quantity
          const currentItem = items.find((i) => i.id === line.itemId)
          if (!currentItem) continue

          const newQty = (Number(currentItem.quantity) || 0) + line.quantity

          await apiPut(`/api/items/${line.itemId}`, {
            quantity: newQty,
            costPrice: line.costPrice,
            sellingPrice: line.sellingPrice,
          })
          updatedCount++
        }
      }

      const parts: string[] = []
      if (createdCount > 0) parts.push(`${createdCount} new item(s) created`)
      if (updatedCount > 0) parts.push(`${updatedCount} existing item(s) updated`)
      toast({
        title: `Purchase added ✓`,
        description: parts.join(' + ') + '. Stock updated.',
      })
      refetch()
      onOpenChange(false)
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const totalCost = lines.reduce((s, l) => s + (l.quantity > 0 ? l.quantity * l.costPrice : 0), 0)
  const totalSell = lines.reduce((s, l) => s + (l.quantity > 0 ? l.quantity * l.sellingPrice : 0), 0)
  const activeLines = lines.filter((l) => (l.mode === 'existing' ? l.itemId : l.newName.trim()) && l.quantity > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] w-[95vw] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Package className="w-4 h-4 text-blue-600" />
            </div>
            Add Purchase
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">
            Select existing items OR add new items directly. Stock will be updated automatically.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 px-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <div className="col-span-4">Item</div>
            <div className="col-span-2 text-center">Qty Received</div>
            <div className="col-span-2 text-center">Cost Price</div>
            <div className="col-span-2 text-center">Sell Price</div>
            <div className="col-span-2 text-center">Total Cost</div>
          </div>

          {/* Lines */}
          {lines.map((line, idx) => {
            const item = items.find((i) => i.id === line.itemId)
            return (
              <div
                key={idx}
                className={`rounded-lg border p-2 ${line.mode === 'new' ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-slate-50/60'}`}
              >
                {/* Mode toggle */}
                <div className="flex items-center gap-1 mb-2">
                  <button
                    onClick={() => updateLine(idx, { mode: 'existing', itemId: '', newName: '' })}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${line.mode === 'existing' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-500'}`}
                  >
                    Existing Item
                  </button>
                  <button
                    onClick={() => updateLine(idx, { mode: 'new', itemId: '' })}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${line.mode === 'new' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}
                  >
                    + New Item
                  </button>
                  {lines.length > 1 && (
                    <button
                      onClick={() => removeLine(idx)}
                      className="ml-auto p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors"
                      title="Remove row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* EXISTING ITEM MODE */}
                {line.mode === 'existing' && (
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Select value={line.itemId} onValueChange={(v) => handleItemSelect(idx, v)}>
                        <SelectTrigger className="h-9 text-sm bg-white">
                          <SelectValue placeholder="Select item..." />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              <span className="truncate">
                                {i.name}
                                {i.sku ? <span className="text-slate-400 ml-1">· {i.sku}</span> : null}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {item && (
                        <p className="text-[10px] text-slate-400 mt-0.5 pl-1">
                          Current stock: <span className="font-medium text-slate-600">{item.quantity} {item.unit || 'pcs'}</span>
                        </p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(idx, { quantity: Math.max(1, Number(e.target.value)) })} className="h-9 text-center bg-white" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={0} step={0.01} value={line.costPrice} onChange={(e) => updateLine(idx, { costPrice: Number(e.target.value) })} className="h-9 text-center bg-white" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={0} step={0.01} value={line.sellingPrice} onChange={(e) => updateLine(idx, { sellingPrice: Number(e.target.value) })} className="h-9 text-center bg-white" />
                    </div>
                    <div className="col-span-2 flex items-center pl-1">
                      <span className="text-sm font-semibold text-slate-800">{formatCurrency(line.quantity * line.costPrice)}</span>
                    </div>
                  </div>
                )}

                {/* NEW ITEM MODE */}
                {line.mode === 'new' && (
                  <div className="space-y-2">
                    {/* Row 1: Name + SKU + Category */}
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-5">
                        <Label className="text-[9px] text-slate-500">Item Name *</Label>
                        <Input value={line.newName} onChange={(e) => updateLine(idx, { newName: e.target.value })} placeholder="e.g. HP Laptop 15s" className="h-8 text-sm bg-white" />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-[9px] text-slate-500">SKU / Code</Label>
                        <Input value={line.newSku} onChange={(e) => updateLine(idx, { newSku: e.target.value })} placeholder="HP-15S-001" className="h-8 text-sm bg-white" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[9px] text-slate-500">Category</Label>
                        <Input value={line.newCategory} onChange={(e) => updateLine(idx, { newCategory: e.target.value })} placeholder="General" className="h-8 text-sm bg-white" list="purchase-categories" />
                        <datalist id="purchase-categories">
                          <option value="Laptop" />
                          <option value="Desktop PC" />
                          <option value="RAM / Memory" />
                          <option value="SSD / Hard Drive" />
                          <option value="Printer & Scanner" />
                          <option value="General" />
                          <option value="Accessories" />
                          <option value="Networking" />
                        </datalist>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[9px] text-slate-500">Barcode</Label>
                        <Input value={line.newBarcode} onChange={(e) => updateLine(idx, { newBarcode: e.target.value })} placeholder="Scan / type" className="h-8 text-sm bg-white" />
                      </div>
                    </div>
                    {/* Row 2: Qty + Cost + Sell + GST + Unit + HSN */}
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-2">
                        <Label className="text-[9px] text-slate-500">Qty Received *</Label>
                        <Input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(idx, { quantity: Math.max(1, Number(e.target.value)) })} className="h-8 text-center text-sm bg-white" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[9px] text-slate-500">Cost Price</Label>
                        <Input type="number" min={0} step={0.01} value={line.costPrice} onChange={(e) => updateLine(idx, { costPrice: Number(e.target.value) })} className="h-8 text-center text-sm bg-white" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[9px] text-slate-500">Sell Price</Label>
                        <Input type="number" min={0} step={0.01} value={line.sellingPrice} onChange={(e) => updateLine(idx, { sellingPrice: Number(e.target.value) })} className="h-8 text-center text-sm bg-white" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[9px] text-slate-500">GST %</Label>
                        <div className="flex items-center gap-1">
                          <Checkbox checked={line.newGstApplicable} onCheckedChange={(v) => updateLine(idx, { newGstApplicable: !!v })} className="h-3.5 w-3.5" />
                          <Input type="number" min={0} max={100} value={line.newGstRate} onChange={(e) => updateLine(idx, { newGstRate: Number(e.target.value), newGstApplicable: true })} className="h-8 text-center text-sm bg-white" disabled={!line.newGstApplicable} />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[9px] text-slate-500">Unit</Label>
                        <Input value={line.newUnit} onChange={(e) => updateLine(idx, { newUnit: e.target.value })} placeholder="pcs" className="h-8 text-center text-sm bg-white" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[9px] text-slate-500">HSN Code</Label>
                        <Input value={line.newHsnCode} onChange={(e) => updateLine(idx, { newHsnCode: e.target.value })} placeholder="8471" className="h-8 text-center text-sm bg-white" />
                      </div>
                    </div>
                    {/* Total cost for this line */}
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500">Line total: </span>
                      <span className="text-sm font-bold text-slate-800">{formatCurrency(line.quantity * line.costPrice)}</span>
                      {line.sellingPrice > line.costPrice && (
                        <span className="text-[10px] text-green-600 ml-2">
                          Profit: {formatCurrency((line.sellingPrice - line.costPrice) * line.quantity)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Add row button */}
          <Button
            variant="outline"
            size="sm"
            onClick={addLine}
            className="w-full border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Another Item
          </Button>
        </div>

        {/* Summary */}
        {activeLines.length > 0 && (
          <div className="border-t border-slate-200 pt-3 grid grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-slate-100 p-2">
              <p className="text-[10px] text-slate-500 uppercase font-medium">Total Items</p>
              <p className="text-lg font-bold text-slate-800">{activeLines.length}</p>
            </div>
            <div className="rounded-lg bg-orange-50 border border-orange-100 p-2">
              <p className="text-[10px] text-orange-600 uppercase font-medium">Purchase Cost</p>
              <p className="text-lg font-bold text-orange-700">{formatCurrency(totalCost)}</p>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-100 p-2">
              <p className="text-[10px] text-green-600 uppercase font-medium">Potential Profit</p>
              <p className="text-lg font-bold text-green-700">{formatCurrency(totalSell - totalCost)}</p>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-2">
              <p className="text-[10px] text-blue-600 uppercase font-medium">New / Existing</p>
              <p className="text-lg font-bold text-blue-700">
                {activeLines.filter((l) => l.mode === 'new').length} / {activeLines.filter((l) => l.mode === 'existing').length}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || activeLines.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <><span className="animate-spin mr-2">⏳</span> Saving...</>
            ) : (
              <><Package className="w-4 h-4 mr-1.5" /> Add to Stock</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
