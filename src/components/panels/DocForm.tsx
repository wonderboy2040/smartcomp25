'use client'

import { useState, useEffect, useMemo } from 'react'
import { useFetch, apiPost, apiPut } from '@/lib/api'
import { safeJsonParse } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { computeInvoice, formatCurrency, calculateProfitMargin, type LineItem } from '@/lib/calc'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Search, FileText, AlertTriangle, TrendingUp, Package, IndianRupee, User, CreditCard, UserPlus } from 'lucide-react'

interface DocFormProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  docType: 'invoice' | 'quotation'
  editing?: any | null
  onSaved: (doc: any) => void
}

// ─────────────────────────────────────────────────────────────
// Inline New-Customer Dialog (opened from DocForm)
// ─────────────────────────────────────────────────────────────
function NewCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (customer: any) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', gstNumber: '', state: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm({ name: '', phone: '', email: '', address: '', gstNumber: '', state: '' })
  }, [open])

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Customer name is required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const customer = await apiPost('/api/customers', form)
      toast({ title: `Customer "${form.name}" added ✓`, description: 'Now selected in the form', duration: 3000 })
      onCreated(customer)
      onOpenChange(false)
    } catch (e: any) {
      toast({ title: 'Error adding customer', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            Add New Customer
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs font-bold text-slate-700">Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Customer or business name"
              className="mt-1 h-10 bg-white border-slate-200"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-700">Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="9876543210"
              className="mt-1 h-10 bg-white border-slate-200"
            />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-700">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="customer@example.com"
              className="mt-1 h-10 bg-white border-slate-200"
            />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-700">State</Label>
            <Input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              placeholder="e.g. Maharashtra"
              className="mt-1 h-10 bg-white border-slate-200"
            />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-700">GSTIN</Label>
            <Input
              value={form.gstNumber}
              onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
              placeholder="29ABCDE1234F1Z5"
              className="mt-1 h-10 bg-white border-slate-200"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-bold text-slate-700">Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Full address"
              className="mt-1 h-10 bg-white border-slate-200"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto border-slate-200">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto font-bold">
            {saving ? 'Adding...' : 'Add Customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────
// Main DocForm
// ─────────────────────────────────────────────────────────────
export function DocForm({ open, onOpenChange, docType, editing, onSaved }: DocFormProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const [customerId, setCustomerId] = useState('')
  const [localCustomers, setLocalCustomers] = useState<any[]>([])
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [items, setItems] = useState<LineItem[]>([])
  const [courierCharges, setCourierCharges] = useState(0)
  const [otherCharges, setOtherCharges] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [discountPercent, setDiscountPercent] = useState(0)
  const [paymentType, setPaymentType] = useState('cash')
  const [amountPaid, setAmountPaid] = useState(0)
  const [notes, setNotes] = useState('')
  const [validTill, setValidTill] = useState<string>('')
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [selectedTemplate, setSelectedTemplate] = useState('tally-classic')
  const [roundOff, setRoundOff] = useState(false)
  const [gstMode, setGstMode] = useState<'gst' | 'non-gst'>('gst')

  const { data: customers } = useFetch<any[]>('/api/customers', undefined)

  // Merge fetched customers with any newly created ones
  const allCustomers = useMemo(() => {
    const fetched = customers || []
    const ids = new Set(fetched.map((c: any) => c.id))
    const extras = localCustomers.filter((c) => !ids.has(c.id))
    return [...extras, ...fetched]
  }, [customers, localCustomers])

  // Debounced item search
  const [itemSearch, setItemSearch] = useState('')
  const [debouncedItemSearch, setDebouncedItemSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedItemSearch(itemSearch), 250)
    return () => clearTimeout(t)
  }, [itemSearch])
  const itemsUrl = debouncedItemSearch
    ? `/api/items?search=${encodeURIComponent(debouncedItemSearch)}&limit=30`
    : '/api/items?limit=30'
  const { data: stockItems } = useFetch<any[]>(itemsUrl, undefined)
  const [showItemPicker, setShowItemPicker] = useState(false)

  // Custom item state — now includes description & specification
  const [customItem, setCustomItem] = useState({
    name: '', description: '', specification: '', rate: 0, qty: 1, gst: false, gstRate: 18,
  })

  useEffect(() => {
    if (open) {
      if (editing) {
        setCustomerId(editing.customerId)
        const parsedItems = (safeJsonParse<any[]>(editing.itemsJson, []) as any[]).map((i) => ({
          ...i,
          discount: i.discount || 0,
        }))
        setItems(parsedItems)
        setCourierCharges(editing.courierCharges || 0)
        setOtherCharges(editing.otherCharges || 0)
        setDiscount(editing.discount || 0)
        setDiscountPercent(0)
        setPaymentType(editing.paymentType || 'cash')
        setAmountPaid(editing.amountPaid || 0)
        setNotes(editing.notes || '')
        setValidTill(editing.validTill ? new Date(editing.validTill).toISOString().slice(0, 10) : '')
        setDate(editing.date ? new Date(editing.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
        setSelectedTemplate(editing.template || editing.templateId || 'tally-classic')
        setRoundOff(editing.roundOff === true || editing.roundOff === 'true')
        setGstMode(editing.gstMode === 'non-gst' ? 'non-gst' : 'gst')
      } else {
        setCustomerId('')
        setItems([])
        setCourierCharges(0)
        setOtherCharges(0)
        setDiscount(0)
        setDiscountPercent(0)
        setPaymentType('cash')
        setAmountPaid(0)
        setNotes('')
        setValidTill(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        setDate(new Date().toISOString().slice(0, 10))
        setSelectedTemplate('tally-classic')
        setRoundOff(false)
        setGstMode('gst')
      }
    }
  }, [open, editing])

  const calc = useMemo(() => {
    let baseCalc = computeInvoice(items, { courierCharges, otherCharges, discount })
    if (roundOff) {
      const rounded = Math.round(baseCalc.grandTotal)
      const diff = rounded - baseCalc.grandTotal
      baseCalc = { ...baseCalc, grandTotal: rounded, otherCharges: baseCalc.otherCharges + diff }
    }
    return baseCalc
  }, [items, courierCharges, otherCharges, discount, roundOff])

  const selectedCustomer = useMemo(() => {
    return allCustomers.find((c: any) => c.id === customerId)
  }, [allCustomers, customerId])

  const filteredStock = useMemo(() => {
    const all = stockItems || []
    if (!itemSearch) return all.slice(0, 20)
    const q = itemSearch.toLowerCase()
    return all.filter((i: any) =>
      String(i?.name || '').toLowerCase().includes(q) ||
      String(i?.sku || '').toLowerCase().includes(q) ||
      String(i?.category || '').toLowerCase().includes(q)
    ).slice(0, 30)
  }, [stockItems, itemSearch])

  useEffect(() => {
    if (discountPercent > 0) {
      const disc = (calc.subtotal * discountPercent) / 100
      setDiscount(Math.round(disc))
    }
  }, [discountPercent, calc.subtotal])

  const addStockItem = (item: any) => {
    if (docType === 'invoice' && Number(item.quantity) <= 0) {
      toast({ title: 'Out of stock!', description: `${item.name} has 0 quantity`, variant: 'destructive' })
      return
    }
    setItems([
      ...items,
      {
        itemId: item?.id,
        name: item?.name || '',
        description: item?.description || '',
        specification: item?.specification || '',
        sku: item?.sku || '',
        hsnCode: item?.hsnCode || '',
        quantity: 1,
        rate: Number(item?.sellingPrice) || 0,
        gstApplicable: item?.gstApplicable === true || item?.gstApplicable === 'true',
        gstRate: Number(item?.gstRate) || 18,
        costPrice: Number(item?.costPrice) || 0,
        discount: 0,
      },
    ])
    setShowItemPicker(false)
    setItemSearch('')
    const stockNote = Number(item.quantity) <= 0
      ? `⚠️ Stock 0 (quotation only)`
      : `Stock ${item.quantity}`
    toast({
      title: `Added: ${item.name}`,
      description: `Price Rs.${item.sellingPrice} | ${stockNote} | Profit ${calculateProfitMargin(Number(item.costPrice), Number(item.sellingPrice))}%`,
    })
  }

  const addCustomItem = () => {
    if (!customItem.name) {
      toast({ title: 'Enter item name', variant: 'destructive' })
      return
    }
    setItems([
      ...items,
      {
        name: customItem.name,
        description: customItem.description,
        specification: customItem.specification,
        quantity: customItem.qty,
        rate: customItem.rate,
        gstApplicable: customItem.gst,
        gstRate: customItem.gstRate,
        discount: 0,
      },
    ])
    setCustomItem({ name: '', description: '', specification: '', rate: 0, qty: 1, gst: false, gstRate: 18 })
  }

  const updateItem = (idx: number, updates: Partial<LineItem>) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...updates } : it)))
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!customerId) {
      toast({ title: 'Please select a customer', variant: 'destructive' })
      return
    }
    if (items.length === 0) {
      toast({ title: 'Add at least one item', variant: 'destructive' })
      return
    }
    if (docType === 'invoice' && selectedCustomer && Number(selectedCustomer.creditLimit) > 0) {
      const newCredit = (Number(selectedCustomer.creditBalance) || 0) + Math.max(0, calc.grandTotal - amountPaid)
      if (newCredit > Number(selectedCustomer.creditLimit)) {
        if (!confirm(`Customer credit limit exceeded!\nLimit: Rs.${selectedCustomer.creditLimit}\nNew balance: Rs.${newCredit}\nContinue?`)) return
      }
    }
    setSaving(true)
    const saveStart = Date.now()
    try {
      const payload: any = {
        customerId,
        items,
        courierCharges,
        otherCharges,
        discount,
        notes,
        date,
        template: selectedTemplate,
        gstMode,
      }
      if (gstMode === 'non-gst') {
        payload.items = items.map((i) => ({ ...i, gstApplicable: false, gstRate: 0 }))
      }
      if (docType === 'invoice') {
        payload.paymentType = paymentType
        payload.amountPaid = amountPaid
      } else {
        payload.validTill = validTill
      }

      const { apiPostUltraFast } = await import('@/lib/api')
      const url = `/api/${docType === 'invoice' ? 'invoices' : 'quotations'}`

      const tempNumber = docType === 'invoice'
        ? `SCSS/${new Date().getMonth() >= 3 ? `${String(new Date().getFullYear()).slice(2)}-${String(new Date().getFullYear() + 1).slice(2)}` : `${String(new Date().getFullYear() - 1).slice(2)}-${String(new Date().getFullYear()).slice(2)}`}/${Date.now().toString().slice(-6)}`
        : `SCSS/QT/${Date.now().toString().slice(-6)}`

      if (editing) {
        const result = await apiPut(url + `/${editing.id}`, payload)
        const elapsed = Date.now() - saveStart
        toast({
          title: `${docType === 'invoice' ? 'Invoice' : 'Quotation'} updated ✓`,
          description: `${result.number || ''} | ${elapsed}ms | Ultra fast`,
          duration: 4000,
        })
        onSaved(result)
      } else {
        toast({
          title: `Creating ${docType}... ⚡`,
          description: `Client number ${tempNumber} generated instantly - syncing to Google Sheets`,
          duration: 2000,
        })

        const tempResult = await apiPostUltraFast(url, payload, { instantClose: true })

        const elapsed = Date.now() - saveStart
        toast({
          title: `${docType === 'invoice' ? 'Invoice' : 'Quotation'} created instantly! ✓ ${elapsed}ms`,
          description: `${tempResult.number} | Profit Rs.${calc.profit.toFixed(2)} | Syncing in background`,
          duration: 5000,
        })

        onSaved(tempResult)
      }
    } catch (e: any) {
      toast({
        title: 'Error saving document',
        description: e.message || 'Unknown error',
        variant: 'destructive',
        duration: 6000,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[95vh] overflow-y-auto bg-white p-0">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-6 pb-3 border-b bg-slate-50 sticky top-0 z-10">
          <DialogTitle className="flex items-center gap-3 text-base sm:text-lg text-slate-900">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <span className="truncate font-bold">{editing ? `Edit ${docType === 'invoice' ? 'Invoice' : 'Quotation'}` : `Create New ${docType === 'invoice' ? 'Invoice' : 'Quotation'}`}</span>
              <p className="text-xs font-normal text-slate-500">v3.1 • Profit Tracking • GST • Stock Linked • New Customer on-the-fly</p>
            </div>
            <div className="ml-auto flex gap-2">
              <Badge variant="outline" className="bg-white text-slate-700 border-slate-200 font-semibold text-[10px]">Template: {selectedTemplate}</Badge>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-[10px]">Profit: {formatCurrency(calc.profit)}</Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 sm:p-6 space-y-5">
          {/* Customer + Date + Template */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5">
              <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />Customer *
                {selectedCustomer && (
                  <span className="ml-2 text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                    Credit: Rs.{selectedCustomer.creditBalance || 0} / Rs.{selectedCustomer.creditLimit || 'No limit'}
                  </span>
                )}
              </Label>
              <div className="flex gap-2 mt-1.5">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="flex-1 h-11 bg-white border-slate-200">
                    <SelectValue placeholder="Select customer - Search by name/phone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {allCustomers.map((c: any) => (
                      <SelectItem key={c.id} value={c.id} className="py-2.5">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">{c.name}</span>
                          <span className="text-[11px] text-slate-500">
                            {c.phone || 'No phone'} {c.gstNumber ? `• GST: ${c.gstNumber}` : ''} {c._count ? `• ${c._count.invoices} invoices` : ''}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* ✅ NEW: Add Customer button */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-11 px-3 bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 flex-shrink-0 font-semibold"
                  onClick={() => setShowNewCustomer(true)}
                  title="Add new customer"
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">New</span>
                </Button>
              </div>
              {selectedCustomer && Number(selectedCustomer.creditBalance) > 0 && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800 text-xs">
                  <AlertTriangle className="w-4 h-4" />Outstanding: Rs.{selectedCustomer.creditBalance}
                  {selectedCustomer.creditLimit ? ` (Limit Rs.${selectedCustomer.creditLimit})` : ''}
                </div>
              )}
            </div>
            <div className="lg:col-span-2">
              <Label className="text-xs font-bold text-slate-700">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 h-11 bg-white border-slate-200" />
            </div>
            <div className="lg:col-span-3">
              <Label className="text-xs font-bold text-slate-700">PDF Template <span className="text-[10px] text-indigo-600 font-semibold">10 Premium</span></Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger className="mt-1.5 h-11 bg-white border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tally-classic">⭐ Tally Classic (White + Blue)</SelectItem>
                  <SelectItem value="tally-modern">Tally Modern (Dark + Emerald)</SelectItem>
                  <SelectItem value="tally-corporate">Corporate Elite (Navy + Gold)</SelectItem>
                  <SelectItem value="tally-elegant">Royal Executive (Maroon + Gold)</SelectItem>
                  <SelectItem value="tally-bold">Tech Store Pro (Teal + Orange)</SelectItem>
                  <SelectItem value="gst-premium-dark">Premium Dark Elite (Black + Gold)</SelectItem>
                  <SelectItem value="gst-classic-plus">GST Classic Plus (White + Blue)</SelectItem>
                  <SelectItem value="gst-executive-formal">Executive Formal (Slate)</SelectItem>
                  <SelectItem value="gst-vibrant-bold">Vibrant Bold Offer (Orange)</SelectItem>
                  <SelectItem value="gst-minimal-white">Minimal White Pro (Eco Print)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-2">
              <Label className="text-xs font-bold text-slate-700">Invoice Type</Label>
              <Select value={gstMode} onValueChange={(v) => setGstMode(v as 'gst' | 'non-gst')}>
                <SelectTrigger className="mt-1.5 h-11 bg-white border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gst">🧾 GST Tax Invoice (with GSTIN)</SelectItem>
                  <SelectItem value="non-gst">🛍️ Retail Invoice (Non-GST, walk-in)</SelectItem>
                </SelectContent>
              </Select>
              {gstMode === 'non-gst' && (
                <p className="text-[10px] text-amber-700 mt-1 font-medium">
                  ⚠️ Non-GST mode: HSN, GST columns, CGST/SGST hidden. For walk-in customers only.
                </p>
              )}
            </div>
            <div className="lg:col-span-2">
              <Label className="text-xs font-bold text-slate-700">{docType === 'quotation' ? 'Valid Till' : 'Payment'}</Label>
              {docType === 'quotation' ? (
                <Input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} className="mt-1.5 h-11 bg-white border-slate-200" />
              ) : (
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger className="mt-1.5 h-11 bg-white border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="border-2 border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-b-2 border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center"><Package className="w-4 h-4 text-white" /></div>
                <div><span className="text-sm font-bold text-slate-900">Items ({items.length})</span><p className="text-[11px] text-slate-500">Stock linked • Profit tracking • GST • Description + Spec</p></div>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-white text-slate-700 border-slate-200 font-bold">Subtotal: {formatCurrency(calc.subtotal)}</Badge>
                <Button size="sm" onClick={() => setShowItemPicker(true)} className="h-9 bg-slate-900 hover:bg-slate-800 text-white font-semibold"><Plus className="w-4 h-4 mr-1" /> Add from Stock</Button>
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="font-bold text-slate-700">Item / Description / Spec</TableHead>
                    <TableHead className="w-20 font-bold text-slate-700">Qty</TableHead>
                    <TableHead className="w-28 font-bold text-slate-700">Rate / Cost</TableHead>
                    <TableHead className="w-20 font-bold text-slate-700">Disc</TableHead>
                    <TableHead className="w-20 text-center font-bold text-slate-700">GST</TableHead>
                    <TableHead className="w-28 text-right font-bold text-slate-700">Amount</TableHead>
                    <TableHead className="w-28 text-right font-bold text-slate-700">Total</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10">
                        <div className="flex flex-col items-center gap-2">
                          <Package className="w-10 h-10 text-slate-300" />
                          <p className="text-sm font-medium text-slate-600">No items added</p>
                          <p className="text-xs text-slate-500">Click &quot;Add from Stock&quot; - profit &amp; GST auto calculated</p>
                          <Button size="sm" variant="outline" onClick={() => setShowItemPicker(true)} className="mt-2 bg-white">
                            <Plus className="w-4 h-4 mr-1" />Add First Item from Stock
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : items.map((item, idx) => {
                    const computed = computeInvoice([item]).items[0]
                    const margin = item.costPrice ? calculateProfitMargin(Number(item.costPrice), Number(item.rate)) : 0
                    return (
                      <TableRow key={idx} className="hover:bg-slate-50">
                        <TableCell>
                          <div className="font-semibold text-sm text-slate-900">{item?.name}</div>
                          {/* Description inline edit */}
                          <Input
                            value={item.description || ''}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                            placeholder="Description (optional)"
                            className="h-7 text-xs mt-1 bg-slate-50 border-slate-200 text-slate-600"
                          />
                          {/* Specification inline edit */}
                          <Input
                            value={item.specification || ''}
                            onChange={(e) => updateItem(idx, { specification: e.target.value })}
                            placeholder="Specification (optional)"
                            className="h-7 text-xs mt-1 bg-slate-50 border-slate-200 text-slate-600"
                          />
                          <div className="flex gap-2 mt-1">
                            {item.sku && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded font-mono">{item.sku}</span>}
                            {item.itemId && <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">Stock linked</span>}
                            {margin > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${margin > 30 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : margin > 15 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{margin}% margin</span>}
                          </div>
                        </TableCell>
                        <TableCell><Input type="number" min={0.1} step={0.1} value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} className="h-9 text-sm font-semibold bg-white border-slate-200" /></TableCell>
                        <TableCell>
                          <Input type="number" value={item.rate} onChange={(e) => updateItem(idx, { rate: Number(e.target.value) })} className="h-9 text-sm font-bold bg-white border-slate-200" />
                          <div className="text-[10px] text-slate-500 mt-1">Cost: Rs.{item.costPrice || 0}</div>
                        </TableCell>
                        <TableCell><Input type="number" value={item.discount || 0} onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })} className="h-9 text-sm bg-white border-slate-200" /></TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Checkbox checked={item.gstApplicable} onCheckedChange={(v) => updateItem(idx, { gstApplicable: v === true })} />
                            {item.gstApplicable ? (
                              <select value={item.gstRate} onChange={(e) => updateItem(idx, { gstRate: Number(e.target.value) })} className="text-[10px] font-bold text-slate-700 bg-white border border-slate-200 rounded px-1 py-0.5 w-14 text-center cursor-pointer">
                                <option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option>
                              </select>
                            ) : <span className="text-[10px] font-bold text-slate-400">No GST</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-slate-900">{formatCurrency(computed.amount)}</TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm font-bold text-slate-900">{formatCurrency(computed.total)}</div>
                          <div className="text-[10px] text-emerald-600 font-semibold">Profit: {formatCurrency(computed.profit)}</div>
                        </TableCell>
                        <TableCell><Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-8 w-8 p-0 hover:bg-red-50"><Trash2 className="w-4 h-4 text-red-500" /></Button></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-slate-200">
              {items.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />No items - Add from stock
                </div>
              ) : items.map((item, idx) => {
                const computed = computeInvoice([item]).items[0]
                return (
                  <div key={idx} className="p-3 space-y-2 bg-white">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-slate-900 truncate">{item.name}</div>
                        <div className="text-[11px] text-slate-500">{item.sku} {item.itemId ? '• Stock' : ''}</div>
                        <Input
                          value={item.description || ''}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          placeholder="Description (optional)"
                          className="h-7 text-xs mt-1 bg-slate-50 border-slate-200"
                        />
                        <Input
                          value={item.specification || ''}
                          onChange={(e) => updateItem(idx, { specification: e.target.value })}
                          placeholder="Specification (optional)"
                          className="h-7 text-xs mt-1 bg-slate-50 border-slate-200"
                        />
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label className="text-[10px] font-bold text-slate-600">Qty</Label><Input type="number" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} className="h-10 text-sm font-bold bg-white" /></div>
                      <div><Label className="text-[10px] font-bold text-slate-600">Rate</Label><Input type="number" value={item.rate} onChange={(e) => updateItem(idx, { rate: Number(e.target.value) })} className="h-10 text-sm font-bold bg-white" /></div>
                      <div><Label className="text-[10px] font-bold text-slate-600">Disc</Label><Input type="number" value={item.discount || 0} onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })} className="h-10 text-sm bg-white" /></div>
                    </div>
                    <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Checkbox checked={item.gstApplicable} onCheckedChange={(v) => updateItem(idx, { gstApplicable: v === true })} />
                        <span className="text-xs font-bold text-slate-700">GST</span>
                        {item.gstApplicable && (
                          <select value={item.gstRate} onChange={(e) => updateItem(idx, { gstRate: Number(e.target.value) })} className="text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5 w-16 cursor-pointer">
                            <option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option>
                          </select>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Total</div>
                        <div className="text-sm font-bold text-slate-900">{formatCurrency(computed.total)}</div>
                        <div className="text-[10px] text-emerald-600 font-bold">Profit {formatCurrency(computed.profit)}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ✅ Quick Add Custom Item — now with Description & Specification */}
            <div className="bg-gradient-to-r from-slate-50 to-white p-3 border-t-2 border-slate-200">
              <Label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                <Plus className="w-3.5 h-3.5" />Quick Add Custom Item (Non-stock) — with Description &amp; Specification
              </Label>
              <div className="flex flex-wrap items-end gap-2">
                {/* Row 1: Name + Qty + Rate + GST + Add */}
                <div className="flex-1 min-w-[160px]">
                  <Label className="text-[10px] text-slate-500">Item Name *</Label>
                  <Input
                    value={customItem.name}
                    onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                    className="h-10 text-sm bg-white border-slate-200"
                    placeholder="e.g. Service Charge"
                  />
                </div>
                <div className="w-20">
                  <Label className="text-[10px] text-slate-500">Qty</Label>
                  <Input type="number" value={customItem.qty} onChange={(e) => setCustomItem({ ...customItem, qty: Number(e.target.value) })} className="h-10 text-sm bg-white border-slate-200" placeholder="Qty" />
                </div>
                <div className="w-28">
                  <Label className="text-[10px] text-slate-500">Rate Rs.</Label>
                  <Input type="number" value={customItem.rate} onChange={(e) => setCustomItem({ ...customItem, rate: Number(e.target.value) })} className="h-10 text-sm font-bold bg-white border-slate-200" placeholder="Rate Rs." />
                </div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-3 h-10 self-end">
                  <input type="checkbox" checked={customItem.gst} onChange={(e) => setCustomItem({ ...customItem, gst: e.target.checked })} className="rounded" />GST
                </label>
                {customItem.gst && (
                  <select value={customItem.gstRate} onChange={(e) => setCustomItem({ ...customItem, gstRate: Number(e.target.value) })} className="h-10 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 w-20 cursor-pointer self-end">
                    <option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option>
                  </select>
                )}
                <Button size="sm" onClick={addCustomItem} className="h-10 bg-slate-900 hover:bg-slate-800 text-white font-bold self-end"><Plus className="w-4 h-4 mr-1" /> Add</Button>
              </div>
              {/* ✅ NEW: Description + Specification inputs for custom item */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <div>
                  <Label className="text-[10px] text-slate-500">Description (printed on invoice)</Label>
                  <Input
                    value={customItem.description}
                    onChange={(e) => setCustomItem({ ...customItem, description: e.target.value })}
                    className="h-9 text-xs bg-white border-slate-200"
                    placeholder="e.g. Annual maintenance charge for HP printer"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500">Specification (printed on invoice)</Label>
                  <Input
                    value={customItem.specification}
                    onChange={(e) => setCustomItem({ ...customItem, specification: e.target.value })}
                    className="h-9 text-xs bg-white border-slate-200"
                    placeholder="e.g. Model: HP LaserJet Pro, Serial: ABC123"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 space-y-3">
              {docType === 'invoice' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 border-2 border-blue-200 rounded-xl">
                  <div>
                    <Label className="text-xs font-bold text-blue-900 flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" />Payment Type</Label>
                    <Select value={paymentType} onValueChange={setPaymentType}>
                      <SelectTrigger className="h-11 bg-white border-blue-200 mt-1.5 font-semibold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash - Immediate</SelectItem>
                        <SelectItem value="credit">Credit - Outstanding</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-blue-900 flex items-center gap-1"><IndianRupee className="w-3.5 h-3.5" />Amount Paid</Label>
                    <Input type="number" value={amountPaid} onChange={(e) => setAmountPaid(Number(e.target.value))} className="h-11 bg-white border-blue-200 mt-1.5 font-bold" placeholder="0" />
                  </div>
                  {amountPaid < calc.grandTotal && amountPaid > 0 && (
                    <div className="col-span-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-800 font-bold">
                      Partial Payment: Due Rs.{(calc.grandTotal - amountPaid).toFixed(2)} will be added to customer credit
                    </div>
                  )}
                  {amountPaid === 0 && (
                    <div className="col-span-2 text-xs bg-red-50 border border-red-200 rounded-lg p-2.5 text-red-700 font-bold">
                      Unpaid: Full Rs.{calc.grandTotal.toFixed(2)} will be outstanding
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs font-bold text-slate-700">Courier Charges</Label><Input type="number" value={courierCharges} onChange={(e) => setCourierCharges(Number(e.target.value))} className="h-10 bg-white border-slate-200 mt-1" placeholder="0" /></div>
                <div><Label className="text-xs font-bold text-slate-700">Other Charges</Label><Input type="number" value={otherCharges} onChange={(e) => setOtherCharges(Number(e.target.value))} className="h-10 bg-white border-slate-200 mt-1" placeholder="0" /></div>
                <div><Label className="text-xs font-bold text-slate-700">Discount Rs.</Label><Input type="number" value={discount} onChange={(e) => { setDiscount(Number(e.target.value)); setDiscountPercent(0) }} className="h-10 bg-white border-slate-200 mt-1 font-bold" placeholder="0" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs font-bold text-slate-700">Discount % (auto calculates Rs.)</Label><Input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} className="h-10 bg-white border-slate-200 mt-1" placeholder="0%" /></div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border-2 border-slate-200 rounded-xl px-4 h-10 cursor-pointer hover:bg-slate-50 flex-1">
                    <input type="checkbox" checked={roundOff} onChange={(e) => setRoundOff(e.target.checked)} className="rounded" />Round Off Grand Total
                  </label>
                </div>
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700">Notes (visible on invoice)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Thank you for your business! Warranty as per manufacturer..." rows={2} className="bg-white border-slate-200 mt-1" />
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 text-white sticky top-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold flex items-center gap-2"><TrendingUp className="w-4 h-4" />Order Summary</span>
                  <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px]">v3.1</Badge>
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-slate-300">Subtotal ({items.length} items):</span><span className="font-bold text-white">{formatCurrency(calc.subtotal)}</span></div>
                  {calc.items.reduce((s, i) => s + (Number(i.discount) || 0), 0) > 0 && <div className="flex justify-between text-amber-300"><span>Item Discounts:</span><span>- {formatCurrency(calc.items.reduce((s, i) => s + (Number(i.discount) || 0), 0))}</span></div>}
                  {discount > 0 && <div className="flex justify-between text-red-300"><span>Bill Discount:</span><span>- {formatCurrency(discount)}</span></div>}
                  <div className="flex justify-between"><span className="text-slate-300">GST Amount:</span><span className="font-semibold text-emerald-300">{formatCurrency(calc.gstAmount)}</span></div>
                  <div className="text-[10px] text-slate-400 pl-2">SGST: {formatCurrency(calc.sgstAmount)} | CGST: {formatCurrency(calc.cgstAmount)}</div>
                  {courierCharges > 0 && <div className="flex justify-between"><span className="text-slate-300">Courier:</span><span>{formatCurrency(courierCharges)}</span></div>}
                  {otherCharges > 0 && <div className="flex justify-between"><span className="text-slate-300">Other:</span><span>{formatCurrency(otherCharges)}</span></div>}
                  <div className="border-t border-white/10 my-2"></div>
                  <div className="flex justify-between text-base font-bold"><span>Grand Total:</span><span className="text-lg text-white">{formatCurrency(calc.grandTotal)}</span></div>
                  {docType === 'invoice' && (
                    <>
                      <div className="flex justify-between text-emerald-300 font-bold"><span>Profit:</span><span>{formatCurrency(calc.profit)} ({calc.subtotal > 0 ? ((calc.profit / calc.subtotal) * 100).toFixed(1) : 0}%)</span></div>
                      <div className="flex justify-between text-xs"><span className="text-slate-400">Total Cost:</span><span className="text-slate-300">{formatCurrency(calc.totalCost)}</span></div>
                      {amountPaid > 0 && <div className="flex justify-between text-xs"><span className="text-slate-400">Paid:</span><span className="text-green-300">{formatCurrency(amountPaid)}</span></div>}
                      {calc.grandTotal - amountPaid > 0 && <div className="flex justify-between text-amber-300 font-bold"><span>Due:</span><span>{formatCurrency(calc.grandTotal - amountPaid)}</span></div>}
                    </>
                  )}
                  <div className="flex justify-between text-xs text-slate-400 pt-2 border-t border-white/10"><span>Items:</span><span>{items.reduce((s, i) => s + Number(i.quantity), 0)} pcs</span></div>
                </div>
                {selectedCustomer && docType === 'invoice' && (
                  <div className="mt-3 p-2.5 bg-white/5 rounded-lg border border-white/10">
                    <p className="text-[11px] font-bold text-white">Customer: {selectedCustomer.name}</p>
                    <p className="text-[10px] text-slate-300">Current Outstanding: Rs.{selectedCustomer.creditBalance || 0} {Number(selectedCustomer.creditLimit) > 0 ? `| Limit: Rs.${selectedCustomer.creditLimit}` : ''}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-6 pt-3 border-t bg-slate-50 flex-col sm:flex-row gap-2 sticky bottom-0">
          <div className="flex-1 text-[11px] text-slate-500 hidden sm:block">
            <span className="font-bold text-slate-700">v3.1 Tips:</span> ➕ New Customer button next to dropdown • Description &amp; Spec per item • Stock search shows profit • Round off • {docType === 'invoice' ? 'Payment type affects outstanding' : 'Valid till for quote'}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto bg-white border-slate-200 h-11 font-semibold">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || items.length === 0} className="bg-slate-900 hover:bg-slate-800 text-white w-full sm:w-auto h-11 font-bold min-w-[140px]">
            {saving ? 'Saving...' : editing ? 'Update' : `Create ${docType === 'invoice' ? 'Invoice' : 'Quotation'}`}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Stock item picker dialog */}
      <Dialog open={showItemPicker} onOpenChange={setShowItemPicker}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto bg-white p-0">
          <DialogHeader className="p-4 pb-2 border-b bg-slate-50 sticky top-0 z-10">
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2"><Package className="w-5 h-5" />Select Item from Stock - Profit Visible</DialogTitle>
            <div className="relative mt-3">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input placeholder="Search by name, SKU, category..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} className="pl-10 h-11 bg-white border-slate-200 font-medium" autoFocus />
            </div>
          </DialogHeader>
          <div className="p-0">
            <div className="max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-50 z-10">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700">Item / Stock / Profit</TableHead>
                    <TableHead className="text-center font-bold text-slate-700">GST</TableHead>
                    <TableHead className="text-right font-bold text-slate-700">Price / Cost</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStock.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                        No items found for &quot;{itemSearch}&quot; - Try different keyword or add custom item
                      </TableCell>
                    </TableRow>
                  ) : filteredStock.map((item: any) => {
                    const margin = calculateProfitMargin(Number(item.costPrice), Number(item.sellingPrice))
                    const isLow = Number(item.quantity) <= Number(item.minQuantity)
                    const isZeroStock = Number(item.quantity) <= 0
                    const isQuotation = docType === 'quotation'
                    const stockBadgeClass = isZeroStock
                      ? (isQuotation ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-red-50 text-red-700 border-red-200')
                      : (isLow ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                    const stockBadgeText = isZeroStock
                      ? (isQuotation ? `Stock: 0 ${item.unit || 'pcs'} • Quote OK` : `Stock: 0 ${item.unit || 'pcs'} • ❌ Blocked`)
                      : `Stock: ${item.quantity} ${item.unit || 'pcs'} ${isLow ? '⚠️ LOW' : '✓'}`
                    return (
                      <TableRow key={item.id} className={`hover:bg-slate-50 ${isLow ? 'bg-amber-50/50' : ''}`}>
                        <TableCell>
                          <div className="font-bold text-sm text-slate-900">{item.name}</div>
                          {(item.description || item.specification) && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {item.description && <span>{item.description}</span>}
                              {item.description && item.specification && <span> | </span>}
                              {item.specification && <span className="text-blue-600">{item.specification}</span>}
                            </div>
                          )}
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded font-mono">{item.sku}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">{item.category}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${stockBadgeClass}`}>{stockBadgeText}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${margin > 30 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : margin > 15 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>Margin: {margin}%</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">HSN: {item.hsnCode || '-'} | Min: {item.minQuantity} | Supplier: {item.supplier?.name || '-'}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full border ${item.gstApplicable ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                            {item.gstApplicable ? `${item.gstRate}%` : 'No GST'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm font-bold text-slate-900">Rs.{item.sellingPrice}</div>
                          <div className="text-[11px] text-slate-500">Cost Rs.{item.costPrice}</div>
                          <div className="text-[10px] font-bold text-emerald-600">Profit Rs.{Number(item.sellingPrice) - Number(item.costPrice)} ({margin}%)</div>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => addStockItem(item)} disabled={isZeroStock && !isQuotation} className={`font-bold h-9 w-full ${isZeroStock && !isQuotation ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}>
                            <Plus className="w-4 h-4 mr-1" /> Add
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="p-3 bg-blue-50 border-t border-blue-200 text-[11px] text-blue-800">
              <span className="font-bold">💡 Pro Tip:</span> Green margin &gt;30% = Good profit | Amber 15-30% = Okay | Red &lt;15% = Low profit. Low stock items show ⚠️.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ✅ NEW: Inline New Customer dialog */}
      <NewCustomerDialog
        open={showNewCustomer}
        onOpenChange={setShowNewCustomer}
        onCreated={(customer) => {
          setLocalCustomers((prev) => [customer, ...prev])
          setCustomerId(customer.id)
        }}
      />
    </Dialog>
  )
}
