'use client'

import { useState, useMemo } from 'react'
import { useFetch } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/calc'
import {
  ShieldAlert, ShieldCheck, Clock, IndianRupee, Users, Ban,
  Search, ChevronDown, ChevronRight, MessageSquare, TrendingDown,
  ArrowUpDown, AlertTriangle, FileText, Phone
} from 'lucide-react'

const SCORE_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-700 border-emerald-300',
  'A': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  'B': 'bg-blue-50 text-blue-600 border-blue-200',
  'C': 'bg-amber-50 text-amber-600 border-amber-200',
  'D': 'bg-red-50 text-red-600 border-red-200',
}

const BUCKET_COLORS: Record<string, string> = {
  '0-30': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '31-60': 'bg-blue-50 text-blue-700 border-blue-200',
  '61-90': 'bg-amber-50 text-amber-700 border-amber-200',
  '90+': 'bg-red-50 text-red-700 border-red-200',
}

const UTILIZATION_COLORS = (pct: number) => {
  if (pct >= 90) return { bar: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' }
  if (pct >= 70) return { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' }
  if (pct >= 40) return { bar: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' }
  return { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' }
}

type SortField = 'outstanding' | 'days' | 'score' | 'name'

export function CreditControlPanel() {
  const { data, loading } = useFetch<any>('/api/credit-control', undefined)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('outstanding')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const customers = data?.customers || []
  const summary = data?.summary || { totalOutstanding: 0, customersWithDues: 0, onHoldCount: 0, bucketCounts: {}, bucketAmounts: {} }

  const scoreOrder: Record<string, number> = { 'D': 0, 'C': 1, 'B': 2, 'A': 3, 'A+': 4 }

  const dueCustomers = useMemo(() => {
    let list = customers.filter((c: any) => c.creditBalance > 0 || c.onHold)

    // Search
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((c: any) =>
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.phone || '').includes(q) ||
        String(c.gstNumber || '').toLowerCase().includes(q)
      )
    }

    // Sort
    list = [...list].sort((a: any, b: any) => {
      if (sortBy === 'outstanding') return (b.creditBalance || 0) - (a.creditBalance || 0)
      if (sortBy === 'days') return (b.oldestDays || 0) - (a.oldestDays || 0)
      if (sortBy === 'score') return (scoreOrder[a.creditScore] ?? 2) - (scoreOrder[b.creditScore] ?? 2)
      if (sortBy === 'name') return String(a.name || '').localeCompare(String(b.name || ''))
      return 0
    })

    return list
  }, [customers, search, sortBy])

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const sendWhatsAppReminder = (c: any) => {
    const phone = String(c.phone || '').replace(/\D/g, '')
    const num = phone.length === 10 ? `91${phone}` : phone
    const msg = `Dear ${c.name},\n\nThis is a friendly reminder regarding your outstanding balance of Rs.${formatCurrency(c.creditBalance)}.\n\nPlease clear the dues at your earliest convenience.\n\nThank you,\nSmart Computers`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 flex-shrink-0" />
            <span className="truncate">Credit Ledger</span>
            <span className="text-[10px] px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full">Enhanced</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Outstanding management, credit limits, aging analysis, credit scores, WhatsApp reminders
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <Card className="bg-gradient-to-br from-red-50 to-red-100/50 border-red-200 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-red-700 uppercase tracking-wide">Total Outstanding</span>
              <IndianRupee className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-base sm:text-xl font-bold text-red-700">{formatCurrency(summary.totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-600 uppercase tracking-wide">Customers w/ Dues</span>
              <Users className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-base sm:text-xl font-bold text-slate-700">{summary.customersWithDues}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">On Hold</span>
              <Ban className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-base sm:text-xl font-bold text-amber-700">{summary.onHoldCount}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-600 uppercase tracking-wide">90+ Days</span>
              <Clock className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-base sm:text-xl font-bold text-red-600">{summary.bucketCounts?.['90+'] || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Buckets */}
      <div className="grid grid-cols-4 gap-2">
        {['0-30', '31-60', '61-90', '90+'].map((bucket) => (
          <Card key={bucket} className={`border-2 ${BUCKET_COLORS[bucket]} shadow-sm`}>
            <CardContent className="p-2 text-center">
              <p className="text-[10px] font-medium uppercase">{bucket} Days</p>
              <p className="text-sm font-bold">{summary.bucketCounts?.[bucket] || 0} cust</p>
              <p className="text-[10px]">{formatCurrency(summary.bucketAmounts?.[bucket] || 0)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Sort */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
          <Input
            placeholder="Search customer name, phone, GST..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 bg-white"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
          <SelectTrigger className="w-full sm:w-48 h-11 bg-white">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="outstanding">Highest Outstanding</SelectItem>
            <SelectItem value="days">Most Overdue</SelectItem>
            <SelectItem value="score">Worst Score First</SelectItem>
            <SelectItem value="name">Name A→Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <Card><CardContent className="text-center py-8 text-slate-500">Loading...</CardContent></Card>
        ) : dueCustomers.length === 0 ? (
          <Card><CardContent className="text-center py-8 text-slate-500">
            <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-emerald-300" />
            {search ? `No customers match "${search}"` : 'No outstanding dues. All customers are clear!'}
          </CardContent></Card>
        ) : dueCustomers.map((c: any) => {
          const isExpanded = expandedId === c.id
          const utilColors = UTILIZATION_COLORS(c.utilization || 0)
          return (
            <Card key={c.id} className={`${c.onHold ? 'border-red-300 bg-red-50/30' : 'border-slate-200'} shadow-sm`}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2" onClick={() => toggleExpand(c.id)}>
                  <div className="min-w-0 flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{c.name}</p>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <p className="font-bold text-red-600 text-sm">{formatCurrency(c.creditBalance)}</p>
                    <Badge className={`text-[9px] ${SCORE_COLORS[c.creditScore] || 'bg-slate-100'}`}>{c.creditScore}</Badge>
                  </div>
                </div>

                {/* Credit utilization bar */}
                {c.creditLimit > 0 && (
                  <div className="mb-2">
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-slate-500">Credit Limit: {formatCurrency(c.creditLimit)}</span>
                      <span className={`font-semibold ${utilColors.text}`}>{Math.round(c.utilization)}% used</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${utilColors.bar} rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, c.utilization)}%` }} />
                    </div>
                  </div>
                )}

                {c.oldestDays > 0 && (
                  <div className="flex items-center gap-1.5 mb-2">
                    {c.oldestDays > 90 && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                    <Badge variant="outline" className={`text-[9px] ${BUCKET_COLORS[c.agingBucket] || ''}`}>
                      {c.oldestDays}d overdue
                    </Badge>
                    {c.onHold && <Badge className="bg-red-100 text-red-700 text-[9px]"><Ban className="w-3 h-3 mr-0.5 inline" />HOLD</Badge>}
                  </div>
                )}

                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-[11px] bg-green-50 text-green-700 border-green-200 hover:bg-green-100" onClick={() => sendWhatsAppReminder(c)}>
                    <MessageSquare className="w-3.5 h-3.5 mr-1" /> Remind
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-[11px] bg-white" onClick={() => toggleExpand(c.id)}>
                    <FileText className="w-3.5 h-3.5 mr-1" /> {c.unpaidInvoices} Invoice{c.unpaidInvoices !== 1 ? 's' : ''}
                  </Button>
                </div>

                {/* Expanded: unpaid invoices */}
                {isExpanded && c.unpaidInvoicesList && c.unpaidInvoicesList.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-700 uppercase">Unpaid Invoices ({c.unpaidInvoicesList.length})</p>
                    {c.unpaidInvoicesList.map((inv: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-white border rounded-lg p-2 text-xs">
                        <div>
                          <p className="font-semibold text-slate-900">{inv.number || `INV-${String(inv.id).slice(0, 6)}`}</p>
                          <p className="text-[10px] text-slate-500">{inv.date ? new Date(inv.date).toLocaleDateString('en-IN') : '-'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600">{formatCurrency(inv.amountDue)}</p>
                          <p className={`text-[10px] font-semibold ${inv.days > 90 ? 'text-red-500' : inv.days > 60 ? 'text-amber-600' : inv.days > 30 ? 'text-blue-600' : 'text-slate-500'}`}>
                            {inv.days}d overdue
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Desktop Table */}
      <Card className="hidden sm:block border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right">Outstanding</TableHead>
                  <TableHead className="text-xs text-center">Credit Limit / Utilization</TableHead>
                  <TableHead className="text-xs text-center">Score</TableHead>
                  <TableHead className="text-xs text-center">Aging</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">Loading...</TableCell></TableRow>
                ) : dueCustomers.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-emerald-300" />
                    {search ? `No customers match "${search}"` : 'No outstanding dues. All customers are clear!'}
                  </TableCell></TableRow>
                ) : (
                  dueCustomers.map((c: any) => {
                    const isExpanded = expandedId === c.id
                    const utilColors = UTILIZATION_COLORS(c.utilization || 0)
                    return (
                      <>
                        <TableRow key={c.id} className={`cursor-pointer hover:bg-slate-50 ${c.onHold ? 'bg-red-50/50' : ''}`} onClick={() => toggleExpand(c.id)}>
                          <TableCell className="w-8 px-2">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          </TableCell>
                          <TableCell>
                            <p className="font-semibold text-sm text-slate-900">{c.name}</p>
                            <p className="text-[10px] text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>
                            {c.gstNumber && <p className="text-[10px] text-slate-400">{c.gstNumber}</p>}
                          </TableCell>
                          <TableCell className="text-right">
                            <p className="font-bold text-red-600 text-sm">{formatCurrency(c.creditBalance)}</p>
                            <p className="text-[10px] text-slate-500">{c.unpaidInvoices} unpaid inv.</p>
                          </TableCell>
                          <TableCell className="text-center">
                            {c.creditLimit > 0 ? (
                              <div className="px-2">
                                <p className="text-xs font-medium text-slate-700">{formatCurrency(c.creditLimit)}</p>
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1 max-w-[120px] mx-auto">
                                  <div className={`h-full ${utilColors.bar} rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, c.utilization)}%` }} />
                                </div>
                                <p className={`text-[9px] font-semibold mt-0.5 ${utilColors.text}`}>{Math.round(c.utilization)}% used</p>
                              </div>
                            ) : <span className="text-slate-300 text-xs">No limit</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={`text-[10px] font-bold border ${SCORE_COLORS[c.creditScore] || 'bg-slate-100'}`}>{c.creditScore}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {c.agingBucket !== 'none' ? (
                              <div>
                                <Badge variant="outline" className={`text-[9px] font-semibold ${BUCKET_COLORS[c.agingBucket] || ''}`}>
                                  {c.oldestDays}d
                                </Badge>
                                {c.oldestDays > 90 && <p className="text-[9px] text-red-500 font-bold mt-0.5 flex items-center justify-center gap-0.5"><AlertTriangle className="w-3 h-3" />Critical</p>}
                              </div>
                            ) : <span className="text-slate-300 text-xs">-</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {c.onHold ? (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[9px] border border-red-300"><Ban className="w-3 h-3 mr-0.5 inline" />HOLD</Badge>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 text-[9px] border border-emerald-200"><ShieldCheck className="w-3 h-3 mr-0.5 inline" />OK</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="outline" className="h-8 px-2.5 bg-green-50 text-green-700 border-green-200 hover:bg-green-100 text-[11px]" onClick={() => sendWhatsAppReminder(c)}>
                              <MessageSquare className="w-3.5 h-3.5 mr-1" /> Remind
                            </Button>
                          </TableCell>
                        </TableRow>
                        {/* Expanded row: unpaid invoices breakdown */}
                        {isExpanded && (
                          <TableRow key={`${c.id}-expanded`} className="bg-slate-50/50">
                            <TableCell colSpan={8} className="p-0">
                              <div className="px-4 py-3 border-t border-slate-100">
                                <div className="flex items-center gap-2 mb-2">
                                  <TrendingDown className="w-4 h-4 text-red-500" />
                                  <p className="text-xs font-bold text-slate-700">Unpaid Invoices ({c.unpaidInvoicesList?.length || 0})</p>
                                  <div className="flex-1" />
                                  <p className="text-[10px] text-slate-500">
                                    Total: {c.totalInvoices} invoices · Paid: {c.paidInvoices} · Unpaid: {c.unpaidInvoices}
                                  </p>
                                </div>
                                {(!c.unpaidInvoicesList || c.unpaidInvoicesList.length === 0) ? (
                                  <p className="text-xs text-slate-400 italic">No unpaid invoices found</p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {c.unpaidInvoicesList.map((inv: any, i: number) => {
                                      const dayColor = inv.days > 90 ? 'text-red-600 bg-red-50 border-red-200'
                                        : inv.days > 60 ? 'text-amber-600 bg-amber-50 border-amber-200'
                                        : inv.days > 30 ? 'text-blue-600 bg-blue-50 border-blue-200'
                                        : 'text-slate-600 bg-slate-50 border-slate-200'
                                      return (
                                        <div key={i} className={`flex items-center justify-between border rounded-lg p-2.5 ${dayColor}`}>
                                          <div>
                                            <p className="text-xs font-bold">{inv.number || `INV-${String(inv.id).slice(0, 6)}`}</p>
                                            <p className="text-[10px] opacity-70">{inv.date ? new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</p>
                                          </div>
                                          <div className="text-right">
                                            <p className="text-sm font-black">{formatCurrency(inv.amountDue)}</p>
                                            <p className="text-[10px] font-bold">{inv.days}d overdue</p>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
