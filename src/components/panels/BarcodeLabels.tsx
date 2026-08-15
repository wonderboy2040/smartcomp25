'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Printer, QrCode, ScanLine, Package, ExternalLink } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function BarcodeLabelsPanel() {
  const { toast } = useToast()
  const [mode, setMode] = useState<'all' | 'single'>('all')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState(10)
  const [generating, setGenerating] = useState(false)

  const { data: items } = useFetch<any[]>('/api/items', undefined)

  const handlePrint = async () => {
    setGenerating(true)
    try {
      let url = '/api/barcode-labels?format=html'
      if (mode === 'single' && itemId) {
        url += `&itemId=${encodeURIComponent(itemId)}&qty=${qty}`
      }
      window.open(url, '_blank', 'noopener,noreferrer')
      toast({ title: 'Labels opened ✓', description: 'Use Ctrl+P or the Print button to print', duration: 5000 })
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  const itemsWithBarcode = (items || []).filter((i) => String(i.barcode || '').trim() || String(i.sku || '').trim())

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Printer className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600 flex-shrink-0" />
            <span className="truncate">Barcode Labels</span>
            <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 border-teal-200">
              {itemsWithBarcode.length} items
            </Badge>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Print shelf labels with barcode + price (A4 sheet, 65 labels per page)
          </p>
        </div>
        <Button onClick={handlePrint} disabled={generating} className="bg-teal-600 hover:bg-teal-700 text-white h-11">
          <Printer className="w-4 h-4 mr-1.5" /> Generate Labels
        </Button>
      </div>

      {/* Info Card */}
      <Card className="border-teal-200 bg-teal-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <ScanLine className="w-5 h-5 text-teal-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">How it works</p>
              <p className="text-xs text-slate-600 mt-1">
                Generates a printable A4 sheet with barcode labels (38×21mm each, 65 per sheet — standard Avery L7651 layout).
                Open the sheet, press <kbd className="px-1 py-0.5 bg-white border rounded text-[10px]">Ctrl+P</kbd> or click the
                "Print Labels" button. Use a barcode scanner at billing counter for instant item lookup.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <Label className="text-xs font-medium">Print Mode</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                className={`p-3 rounded-lg border-2 text-left transition-colors ${mode === 'all' ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}
                onClick={() => setMode('all')}
              >
                <Package className="w-5 h-5 text-teal-600 mb-1" />
                <p className="text-sm font-bold">All Items</p>
                <p className="text-[10px] text-slate-500">1 label per item ({itemsWithBarcode.length} labels)</p>
              </button>
              <button
                className={`p-3 rounded-lg border-2 text-left transition-colors ${mode === 'single' ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}
                onClick={() => setMode('single')}
              >
                <QrCode className="w-5 h-5 text-teal-600 mb-1" />
                <p className="text-sm font-bold">Single Item</p>
                <p className="text-[10px] text-slate-500">Multiple labels for one item</p>
              </button>
            </div>
          </div>

          {mode === 'single' && (
            <>
              <div>
                <Label className="text-xs font-medium">Select Item</Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Search item with barcode/SKU..." /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {itemsWithBarcode.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name} — {i.barcode || i.sku}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium">Number of Labels</Label>
                <Input type="number" value={qty} onChange={(e) => setQty(Math.min(Math.max(Number(e.target.value), 1), 100))} className="mt-1" min={1} max={100} />
                <p className="text-[10px] text-slate-500 mt-1">Max 100 labels per sheet (2 pages)</p>
              </div>
            </>
          )}

          {mode === 'all' && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-600 mb-2">
                Will print <strong>{itemsWithBarcode.length} labels</strong> — one for each item that has a barcode or SKU.
                Items without barcode/SKU will be skipped.
              </p>
              {itemsWithBarcode.length === 0 ? (
                <p className="text-xs text-amber-600 font-medium">⚠ No items with barcode/SKU found. Add barcodes in Stock panel first.</p>
              ) : (
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {itemsWithBarcode.slice(0, 30).map((i) => (
                    <Badge key={i.id} variant="outline" className="text-[10px] bg-white">
                      {i.name.slice(0, 15)} — {i.barcode || i.sku}
                    </Badge>
                  ))}
                  {itemsWithBarcode.length > 30 && <Badge variant="outline" className="text-[10px]">+{itemsWithBarcode.length - 30} more</Badge>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Link */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-slate-500 mb-2">Direct link (bookmark this):</p>
          <a
            href={mode === 'single' && itemId ? `/api/barcode-labels?itemId=${itemId}&qty=${qty}` : '/api/barcode-labels'}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-teal-600 hover:text-teal-700 inline-flex items-center gap-1 font-mono"
          >
            <ExternalLink className="w-3 h-3" />
            {mode === 'single' && itemId ? `/api/barcode-labels?itemId=${itemId}&qty=${qty}` : '/api/barcode-labels'}
          </a>
        </CardContent>
      </Card>
    </div>
  )
}

// Lazy import to avoid circular dep
import { useFetch } from '@/lib/api'
