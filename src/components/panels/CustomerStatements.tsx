'use client'

import { useState } from 'react'
import { useFetch } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/calc'
import { FileText, Download, Wrench, Wallet, Receipt, IndianRupee } from 'lucide-react'

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
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
      return
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
  }

  const renderTypeBadge = (type: string) => {
    if (type === 'Invoice') {
      return (
        <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-700 border-slate-300 font-medium">
          <Receipt className="w-3 h-3 mr-1 text-slate-500" /> Invoice
        </Badge>
      )
    }
    if (type === 'Service Job') {
      return (
        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 font-medium">
          <Wrench className="w-3 h-3 mr-1 text-blue-600" /> Service Job
        </Badge>
      )
    }
    if (type === 'Payment (Service)') {
      return (
        <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 font-medium">
          <Wallet className="w-3 h-3 mr-1 text-purple-600" /> Service Pay
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">
        <IndianRupee className="w-3 h-3 mr-0.5 text-emerald-600" /> Payment
      </Badge>
    )
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
            Account ledger: Invoices, Service Jobs, Payments & Opening/Closing Balance
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
                <p className="text-[10px] text-slate-400 mt-0.5">Before {statement.period?.from}</p>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-slate-600">Total Invoiced & Services</p>
                <p className="text-lg font-bold text-green-700">
                  Rs.{formatCurrency((statement.summary?.totalBilled ?? (statement.summary?.totalInvoiced + (statement.summary?.totalJobs || 0))) || 0)}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Inv: Rs.{formatCurrency(statement.summary?.totalInvoiced || 0)} | Svc: Rs.{formatCurrency(statement.summary?.totalJobs || 0)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50/50">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-slate-600">Total Paid</p>
                <p className="text-lg font-bold text-purple-700">Rs.{formatCurrency(statement.summary?.totalPaid || 0)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Inv: Rs.{formatCurrency(statement.summary?.totalInvoicePaid || 0)} | Svc: Rs.{formatCurrency(statement.summary?.totalJobPaid || 0)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-slate-600">Closing Balance</p>
                <p className="text-lg font-bold text-red-700">Rs.{formatCurrency(statement.closingBalance || 0)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">As of {statement.period?.to}</p>
              </CardContent>
            </Card>
          </div>

          {/* Ledger */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {statement.customer?.name}
                    {statement.customer?.phone && <span className="text-xs text-slate-500 ml-2 font-normal">{statement.customer.phone}</span>}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    {statement.counts?.invoices > 0 && (
                      <Badge variant="outline" className="text-[9px] bg-slate-50 text-slate-600">
                        {statement.counts.invoices} Invoice{statement.counts.invoices > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {statement.counts?.jobs > 0 && (
                      <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-600">
                        {statement.counts.jobs} Service Job{statement.counts.jobs > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {(statement.counts?.invoicePayments > 0 || statement.counts?.servicePayments > 0) && (
                      <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-600">
                        {(statement.counts?.invoicePayments || 0) + (statement.counts?.servicePayments || 0)} Payment{((statement.counts?.invoicePayments || 0) + (statement.counts?.servicePayments || 0)) > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">{statement.period?.from} to {statement.period?.to}</Badge>
              </div>

              {(!statement.ledger || statement.ledger.length === 0) ? (
                <p className="text-sm text-slate-400 text-center py-4">No transactions in this period.</p>
              ) : (
                <div className="overflow-x-auto">
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
                        <TableRow key={i} className="hover:bg-slate-50/70">
                          <TableCell className="text-xs whitespace-nowrap">
                            {entry.date ? new Date(entry.date).toLocaleDateString('en-IN') : '-'}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {renderTypeBadge(entry.type)}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-slate-800">
                            {entry.description}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold text-red-600 whitespace-nowrap">
                            {entry.debit > 0 ? `Rs.${formatCurrency(entry.debit)}` : '-'}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold text-green-600 whitespace-nowrap">
                            {entry.credit > 0 ? `Rs.${formatCurrency(entry.credit)}` : '-'}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold text-slate-900 whitespace-nowrap">
                            Rs.{formatCurrency(entry.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-slate-100">
                        <TableCell colSpan={5} className="text-xs font-bold text-slate-700">Closing Balance</TableCell>
                        <TableCell className="text-xs text-right font-bold text-slate-900">Rs.{formatCurrency(statement.closingBalance || 0)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function escapeHtml(s: any): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildStatementHtml(s: any): string {
  const rows = (s.ledger || []).map((e: any) => `
    <tr>
      <td>${escapeHtml(e.date ? new Date(e.date).toLocaleDateString('en-IN') : '-')}</td>
      <td><strong>${escapeHtml(e.type)}</strong></td>
      <td>${escapeHtml(e.description)}</td>
      <td style="text-align:right;color:#dc2626">${e.debit > 0 ? formatCurrency(e.debit) : '-'}</td>
      <td style="text-align:right;color:#16a34a">${e.credit > 0 ? formatCurrency(e.credit) : '-'}</td>
      <td style="text-align:right;font-weight:bold">${formatCurrency(e.balance)}</td>
    </tr>
  `).join('')

  const totalBilled = (s.summary?.totalBilled ?? ((s.summary?.totalInvoiced || 0) + (s.summary?.totalJobs || 0))) || 0

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Statement — ${escapeHtml(s.customer?.name)}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
  h1 { font-size: 18px; margin: 0 0 5px; }
  h2 { font-size: 14px; margin: 15px 0 10px; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 15px; }
  .customer { font-size: 13px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #e2e8f0; padding: 5px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 15px 0; }
  .summary-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center; }
  .summary-card .label { font-size: 10px; color: #64748b; }
  .summary-card .value { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .summary-card .sub { font-size: 9px; color: #94a3b8; margin-top: 2px; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="header">
    <div>
      <h1>Smart Computers</h1>
      <p style="font-size:11px;color:#64748b">Customer Account Statement (Invoices & Service Jobs)</p>
    </div>
    <div style="text-align:right;font-size:11px">
      Period: ${escapeHtml(s.period?.from)} to ${escapeHtml(s.period?.to)}<br>
      Generated: ${escapeHtml(new Date().toLocaleString('en-IN'))}
    </div>
  </div>
  <div class="customer">
    <strong>${escapeHtml(s.customer?.name)}</strong><br>
    ${escapeHtml(s.customer?.phone || '')} ${s.customer?.email ? '• ' + escapeHtml(s.customer.email) : ''}<br>
    ${escapeHtml(s.customer?.address || '')} ${s.customer?.gstNumber ? '• GST: ' + escapeHtml(s.customer.gstNumber) : ''}
  </div>
  <div class="summary">
    <div class="summary-card">
      <div class="label">Opening Balance</div>
      <div class="value" style="color:#2563eb">Rs.${formatCurrency(s.openingBalance || 0)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Invoiced & Services</div>
      <div class="value" style="color:#16a34a">Rs.${formatCurrency(totalBilled)}</div>
      <div class="sub">Inv: Rs.${formatCurrency(s.summary?.totalInvoiced || 0)} | Svc: Rs.${formatCurrency(s.summary?.totalJobs || 0)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Paid</div>
      <div class="value" style="color:#7c3aed">Rs.${formatCurrency(s.summary?.totalPaid || 0)}</div>
      <div class="sub">Inv: Rs.${formatCurrency(s.summary?.totalInvoicePaid || 0)} | Svc: Rs.${formatCurrency(s.summary?.totalJobPaid || 0)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Closing Balance</div>
      <div class="value" style="color:#dc2626">Rs.${formatCurrency(s.closingBalance || 0)}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Description</th>
        <th style="text-align:right">Debit</th>
        <th style="text-align:right">Credit</th>
        <th style="text-align:right">Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#f8fafc">
        <td colspan="5" style="font-weight:bold">Opening Balance</td>
        <td style="text-align:right;font-weight:bold">Rs.${formatCurrency(s.openingBalance || 0)}</td>
      </tr>
      ${rows}
      <tr style="background:#f1f5f9">
        <td colspan="5" style="font-weight:bold">Closing Balance</td>
        <td style="text-align:right;font-weight:bold">Rs.${formatCurrency(s.closingBalance || 0)}</td>
      </tr>
    </tbody>
  </table>
  <script>
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

