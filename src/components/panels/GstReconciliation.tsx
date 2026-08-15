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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/calc'
import { FileCheck2, Upload, CheckCircle2, AlertCircle, XCircle, IndianRupee } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function GstReconciliationPanel() {
  const { toast } = useToast()
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`)
  const [type, setType] = useState('2b')
  const [showUpload, setShowUpload] = useState(false)
  const [pasteData, setPasteData] = useState('')
  const [uploading, setUploading] = useState(false)

  const reconUrl = `/api/gst-reconciliation?month=${month}&type=${type}`
  const { data: recon, loading, refetch } = useFetch<any>(reconUrl, undefined)

  const handleUpload = async () => {
    if (!pasteData.trim()) {
      toast({ title: 'Paste 2B data first', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      // Parse pasted data — expect CSV-like or JSON
      const entries = parsePasteData(pasteData)
      if (entries.length === 0) {
        toast({ title: 'No valid entries found', description: 'Check format — need GSTIN, invoice, taxable, tax', variant: 'destructive' })
        return
      }
      const res = await apiPost('/api/gst-reconciliation', { month, type, entries })
      toast({ title: `${res.saved} entries saved ✓`, duration: 3500 })
      setShowUpload(false)
      setPasteData('')
      refetch()
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const summary = recon?.summary || {}

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 sm:w-6 sm:h-6 text-rose-600 flex-shrink-0" />
            <span className="truncate">GST-2A/2B Reconciliation</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Match purchase bills with GST portal data to claim Input Tax Credit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40 h-11" />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-24 h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2b">2B</SelectItem>
              <SelectItem value="2a">2A</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowUpload(true)} variant="outline" className="h-11">
            <Upload className="w-4 h-4 mr-1.5" /> Upload 2B
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1"><CheckCircle2 className="w-4 h-4 text-green-600" /><p className="text-[10px] font-medium text-slate-600">Matched</p></div>
            <p className="text-lg font-bold text-green-700">{summary.matched || 0}</p>
            <p className="text-[9px] text-slate-500">ITC: Rs.{formatCurrency(summary.totalMatchedTax || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1"><AlertCircle className="w-4 h-4 text-amber-600" /><p className="text-[10px] font-medium text-slate-600">In Books, Not in 2B</p></div>
            <p className="text-lg font-bold text-amber-700">{summary.unmatchedInBooks || 0}</p>
            <p className="text-[9px] text-slate-500">At Risk: Rs.{formatCurrency(summary.totalUnmatchedTax || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1"><XCircle className="w-4 h-4 text-red-600" /><p className="text-[10px] font-medium text-slate-600">In 2B, Not in Books</p></div>
            <p className="text-lg font-bold text-red-700">{summary.extraIn2B || 0}</p>
            <p className="text-[9px] text-slate-500">Missed ITC: Rs.{formatCurrency(summary.totalExtraTax || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1"><IndianRupee className="w-4 h-4 text-blue-600" /><p className="text-[10px] font-medium text-slate-600">ITC Available</p></div>
            <p className="text-lg font-bold text-blue-700">Rs.{formatCurrency(summary.itcAvailable || 0)}</p>
            <p className="text-[9px] text-slate-500">From {summary.matched || 0} matched bills</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="p-4">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading reconciliation...</p>
          ) : !recon ? (
            <p className="text-sm text-slate-400 text-center py-8">No data. Upload 2B data to start reconciliation.</p>
          ) : (
            <div className="space-y-4">
              {/* Matched */}
              <div>
                <h3 className="text-sm font-bold text-green-700 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Matched ({recon.matched?.length || 0})
                </h3>
                {recon.matched?.length > 0 && (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs">PO Number</TableHead>
                      <TableHead className="text-xs">Supplier</TableHead>
                      <TableHead className="text-xs text-right">PO Amount</TableHead>
                      <TableHead className="text-xs text-right">2B Taxable</TableHead>
                      <TableHead className="text-xs text-right">2B Tax</TableHead>
                      <TableHead className="text-xs text-right">Variance</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {recon.matched.map((m: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono">{m.poNumber}</TableCell>
                          <TableCell className="text-xs">{m.supplierName}</TableCell>
                          <TableCell className="text-xs text-right">Rs.{formatCurrency(m.poAmount)}</TableCell>
                          <TableCell className="text-xs text-right">Rs.{formatCurrency(m.reconTaxable)}</TableCell>
                          <TableCell className="text-xs text-right font-bold text-green-600">Rs.{formatCurrency(m.reconTax)}</TableCell>
                          <TableCell className={`text-xs text-right ${Math.abs(m.variance) < 1 ? 'text-green-600' : 'text-amber-600'}`}>Rs.{formatCurrency(m.variance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Unmatched in Books */}
              <div>
                <h3 className="text-sm font-bold text-amber-700 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> In Books, Not in 2B ({recon.unmatchedInBooks?.length || 0})
                </h3>
                {recon.unmatchedInBooks?.length > 0 && (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs">PO Number</TableHead>
                      <TableHead className="text-xs">Supplier</TableHead>
                      <TableHead className="text-xs text-right">PO Amount</TableHead>
                      <TableHead className="text-xs text-right">Est. GST</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {recon.unmatchedInBooks.map((m: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono">{m.poNumber}</TableCell>
                          <TableCell className="text-xs">{m.supplierName}</TableCell>
                          <TableCell className="text-xs text-right">Rs.{formatCurrency(m.poAmount)}</TableCell>
                          <TableCell className="text-xs text-right font-bold text-amber-600">Rs.{formatCurrency(m.estimatedGst)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Extra in 2B */}
              <div>
                <h3 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> In 2B, Not in Books ({recon.extraIn2B?.length || 0})
                </h3>
                {recon.extraIn2B?.length > 0 && (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs">2B Invoice</TableHead>
                      <TableHead className="text-xs">Supplier GSTIN</TableHead>
                      <TableHead className="text-xs text-right">Taxable</TableHead>
                      <TableHead className="text-xs text-right">Tax</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {recon.extraIn2B.map((m: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono">{m.reconInvoiceNumber}</TableCell>
                          <TableCell className="text-xs font-mono">{m.supplierGstin}</TableCell>
                          <TableCell className="text-xs text-right">Rs.{formatCurrency(m.reconTaxable)}</TableCell>
                          <TableCell className="text-xs text-right font-bold text-red-600">Rs.{formatCurrency(m.reconTax)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl">
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-bold flex items-center gap-2"><Upload className="w-5 h-5" /> Upload GST-{type.toUpperCase()} Data</h2>
              <p className="text-xs text-slate-500">
                Paste your GST-{type.toUpperCase()} data from the portal. Format: one entry per line, comma-separated:
                <br /><code className="text-[10px] bg-slate-100 px-1 rounded">GSTIN, InvoiceNumber, TaxableAmount, TaxAmount</code>
                <br />Example: <code className="text-[10px] bg-slate-100 px-1 rounded">29ABCDE1234F1Z5, INV-001, 10000, 1800</code>
              </p>
              <Textarea
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                placeholder="29ABCDE1234F1Z5, INV-001, 10000, 1800&#10;29XYZAB5678C1Z9, INV-002, 5000, 900"
                className="h-40 font-mono text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
                <Button onClick={handleUpload} disabled={uploading} className="bg-rose-600 hover:bg-rose-700">
                  {uploading ? 'Uploading...' : 'Upload & Reconcile'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function parsePasteData(data: string): any[] {
  const lines = data.trim().split('\n').filter(Boolean)
  const entries: any[] = []
  for (const line of lines) {
    const parts = line.split(',').map((s) => s.trim())
    if (parts.length >= 4) {
      entries.push({
        supplierGstin: parts[0],
        invoiceNumber: parts[1],
        taxableAmount: Number(parts[2]) || 0,
        taxAmount: Number(parts[3]) || 0,
      })
    }
  }
  return entries
}
