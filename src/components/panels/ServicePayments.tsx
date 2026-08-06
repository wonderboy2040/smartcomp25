'use client'

import { useState } from 'react'
import { useFetch } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Wallet, IndianRupee, Smartphone, Banknote, Filter } from 'lucide-react'

export function ServicePaymentsPanel() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [filterKey, setFilterKey] = useState('')

  // Build query string for refetch
  const query = filterKey ? `/api/service-payments?${filterKey}` : '/api/service-payments'
  const { data, loading } = useFetch<any>(query, undefined)

  const applyFilter = () => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    setFilterKey(params.toString())
  }

  const payments = data?.payments || []
  const totals = data?.totals || { upi: 0, cash: 0, total: 0 }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
            <span className="truncate">Service Payments</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            UPI/Cash payment history for service jobs
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[10px] text-slate-500 block mb-1">From Date</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10" />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 block mb-1">To Date</label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10" />
        </div>
        <Button onClick={applyFilter} className="bg-blue-600 hover:bg-blue-700 h-10">
          <Filter className="w-4 h-4 mr-1" /> Filter
        </Button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-600 uppercase">UPI Total</span>
              <Smartphone className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-lg sm:text-xl font-bold text-green-600">Rs.{totals.upi}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-600 uppercase">Cash Total</span>
              <Banknote className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-lg sm:text-xl font-bold text-blue-600">Rs.{totals.cash}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-300 uppercase">Grand Total</span>
              <IndianRupee className="w-4 h-4 text-white" />
            </div>
            <p className="text-lg sm:text-xl font-bold text-white">Rs.{totals.total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Job ID</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Customer</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-center">Mode</TableHead>
                  <TableHead className="text-xs text-center hidden sm:table-cell">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">Loading...</TableCell></TableRow>
                ) : payments.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    <Wallet className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    No payments yet. Complete a service job to record payments.
                  </TableCell></TableRow>
                ) : (
                  payments.map((p: any) => (
                    <TableRow key={p.id} className="hover:bg-slate-50">
                      <TableCell className="text-xs">
                        {p.date ? new Date(p.date).toLocaleDateString('en-IN') : '-'}
                        <div className="text-[10px] text-slate-400">
                          {p.date ? new Date(p.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.jobId}</TableCell>
                      <TableCell className="text-sm hidden sm:table-cell">{p.customerName}</TableCell>
                      <TableCell className="text-right font-semibold text-sm">Rs.{p.amount}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`text-[9px] ${String(p.mode).toLowerCase() === 'upi' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                          {p.mode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-xs hidden sm:table-cell">{p.type}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
