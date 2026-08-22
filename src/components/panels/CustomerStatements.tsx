'use client'

import { useState, useMemo } from 'react'
import { useFetch, apiPost } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/calc'
import { FileText, Download, Eye, IndianRupee, TrendingUp } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function CustomerStatementsPanel() {
  const { toast } = useToast()
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)
  const defaultTo = now.toISOString().slice(0, 10)

  const [customerId, setCustomerId] = useState('')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)

  const { data: customers } = useFetch<any[]>('/api/customers', undefined)
  const statementUrl = customerId ? `/api/customer-statements?customerId=${customerId}&from=${from}&to=${to}` : null
  const { data: statement, loading } = useFetch<any>(statementUrl, undefined)

  const handlePrint = () => {
    if (!statement) return
    const html = buildStatementHtml(statement)
    // v12.7 FIX: Previously used window.open('', '_blank', 'noopener,noreferrer')
    // — `noopener` makes the parent window unable to access w.document, so the
    // new tab stayed at about:blank and the print dialog never opened. The
    // user saw a "Popup blocked" toast even when popups were allowed.
    //
    // Solution: build a Blob URL with the full HTML content and open THAT.
    // No `noopener` flag, no document.write (which is deprecated and blocked
    // by some browsers after cross-origin navigations). The browser opens a
    // real document with our HTML, the auto-print script inside it fires,
    // and the user gets the print dialog (with "Save as PDF" as a destination).
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    const w = window.open(blobUrl, '_blank')
    if (!w) {
      toast({
        title: 'Popup blocked',
        description: 'Allow popups for this site and click Print / PDF again.',
        variant: 'destructive',
        duration: 7000,
      })
      // Revoke the URL so we don't leak memory even if popup is blocked.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
      return
    }
    // Revoke the blob URL after 60s — the new tab has already loaded by then.
    // The auto-print script inside the HTML handles opening the print dialog.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 flex-shrink-0" />
            <span className="truncate">Customer Statements</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Account ledger: invoices, payments, opening/closing balance
          </p>
        </div>
        {statement && (
          <Button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700 text-white h-11">
            <Download className="w-4 h-4 mr-1.5" /> Print / PDF
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-medium">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer..." /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {(customers || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">From Date</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-medium">To Date</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statement */}
      {loading ? (
        <Card><CardContent className="p-8 text-center"><p className="text-sm text-slate-400">Loading statement...</p></CardContent></Card>
      ) : !customerId ? (
        <Card><CardContent className="p-8 text-center"><FileText className="w-12 h-12 text-slate-200 mx-auto mb-2" /><p className="text-sm text-slate-400">Select a customer to view their statement.</p></CardContent></Card>
      ) : !statement ? (
        <Card><CardContent className="p-8 text-center"><p className="text-sm text-slate-400">No data found.</p></CardContent></Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-slate-600">Opening Balance</p>
                <p className="text-lg font-bold text-blue-700">Rs.{formatCurrency(statement.openingBalance || 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-slate-600">Total Invoiced</p>
                <p className="text-lg font-bold text-green-700">Rs.{formatCurrency(statement.summary?.totalInvoiced || 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-purple-200 bg-purple-50/50">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-slate-600">Total Paid</p>
                <p className="text-lg font-bold text-purple-700">Rs.{formatCurrency(statement.summary?.totalPaid || 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-slate-600">Closing Balance</p>
                <p className="text-lg font-bold text-red-700">Rs.{formatCurrency(statement.closingBalance || 0)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Ledger */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900">
                  {statement.customer?.name}
                  {statement.customer?.phone && <span className="text-xs text-slate-500 ml-2">{statement.customer.phone}</span>}
                </h2>
                <Badge variant="outline" className="text-[10px]">{statement.period?.from} to {statement.period?.to}</Badge>
              </div>
              {(!statement.ledger || statement.ledger.length === 0) ? (
                <p className="text-sm text-slate-400 text-center py-4">No transactions in this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-right">Debit</TableHead>
                      <TableHead className="text-xs text-right">Credit</TableHead>
                      <TableHead className="text-xs text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-slate-50">
                      <TableCell colSpan={5} className="text-xs font-bold text-slate-600">Opening Balance</TableCell>
                      <TableCell className="text-xs text-right font-bold">Rs.{formatCurrency(statement.openingBalance || 0)}</TableCell>
                    </TableRow>
                    {statement.ledger.map((entry: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{new Date(entry.date).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{entry.type}</Badge></TableCell>
                        <TableCell className="text-xs">{entry.description}</TableCell>
                        <TableCell className="text-xs text-right font-bold text-red-600">{entry.debit > 0 ? `Rs.${formatCurrency(entry.debit)}` : '-'}</TableCell>
                        <TableCell className="text-xs text-right font-bold text-green-600">{entry.credit > 0 ? `Rs.${formatCurrency(entry.credit)}` : '-'}</TableCell>
                        <TableCell className="text-xs text-right font-bold">Rs.{formatCurrency(entry.balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-100">
                      <TableCell colSpan={5} className="text-xs font-bold text-slate-700">Closing Balance</TableCell>
                      <TableCell className="text-xs text-right font-bold text-slate-900">Rs.{formatCurrency(statement.closingBalance || 0)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function buildStatementHtml(s: any): string {
  const rows = (s.ledger || []).map((e: any) => `
    <tr>
      <td>${new Date(e.date).toLocaleDateString('en-IN')}</td>
      <td>${e.type}</td>
      <td>${e.description}</td>
      <td style="text-align:right">${e.debit > 0 ? formatCurrency(e.debit) : '-'}</td>
      <td style="text-align:right">${e.credit > 0 ? formatCurrency(e.credit) : '-'}</td>
      <td style="text-align:right;font-weight:bold">${formatCurrency(e.balance)}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Statement — ${s.customer?.name}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
  h1 { font-size: 18px; margin: 0 0 5px; }
  h2 { font-size: 14px; margin: 15px 0 10px; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 15px; }
  .customer { font-size: 13px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 15px 0; }
  .summary-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center; }
  .summary-card .label { font-size: 10px; color: #64748b; }
  .summary-card .value { font-size: 16px; font-weight: 700; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="header">
    <div>
      <h1>Smart Computers</h1>
      <p style="font-size:11px;color:#64748b">Customer Account Statement</p>
    </div>
    <div style="text-align:right;font-size:11px">
      Period: ${s.period?.from} to ${s.period?.to}<br>
      Generated: ${new Date().toLocaleString('en-IN')}
    </div>
  </div>
  <div class="customer">
    <strong>${s.customer?.name}</strong><br>
    ${s.customer?.phone || ''} ${s.customer?.email ? '• ' + s.customer.email : ''}<br>
    ${s.customer?.address || ''} ${s.customer?.gstNumber ? '• GST: ' + s.customer.gstNumber : ''}
  </div>
  <div class="summary">
    <div class="summary-card"><div class="label">Opening Balance</div><div class="value" style="color:#2563eb">Rs.${formatCurrency(s.openingBalance || 0)}</div></div>
    <div class="summary-card"><div class="label">Total Invoiced</div><div class="value" style="color:#16a34a">Rs.${formatCurrency(s.summary?.totalInvoiced || 0)}</div></div>
    <div class="summary-card"><div class="label">Total Paid</div><div class="value" style="color:#7c3aed">Rs.${formatCurrency(s.summary?.totalPaid || 0)}</div></div>
    <div class="summary-card"><div class="label">Closing Balance</div><div class="value" style="color:#dc2626">Rs.${formatCurrency(s.closingBalance || 0)}</div></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th>Description</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
    <tbody>
      <tr style="background:#f8fafc"><td colspan="5" style="font-weight:bold">Opening Balance</td><td style="text-align:right;font-weight:bold">Rs.${formatCurrency(s.openingBalance || 0)}</td></tr>
      ${rows}
      <tr style="background:#f1f5f9"><td colspan="5" style="font-weight:bold">Closing Balance</td><td style="text-align:right;font-weight:bold">Rs.${formatCurrency(s.closingBalance || 0)}</td></tr>
    </tbody>
  </table>
  <script>
    // v12.7: Auto-fire the print dialog after the page loads so the user
    // gets "Save as PDF" as a destination without an extra click.
    (function() {
      function firePrint() {
        try { window.print(); } catch (e) {}
      }
      if (document.readyState === 'complete') {
        setTimeout(firePrint, 350);
      } else {
        window.addEventListener('load', function() { setTimeout(firePrint, 350); });
      }
    })();
  </script>
</body></html>`
}
