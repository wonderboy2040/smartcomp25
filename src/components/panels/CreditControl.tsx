'use client'

import { useMemo } from 'react'
import { useFetch } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/calc'
import { ShieldAlert, ShieldCheck, Clock, IndianRupee, Users, Ban } from 'lucide-react'

const SCORE_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-700',
  'A': 'bg-emerald-50 text-emerald-600',
  'B': 'bg-blue-50 text-blue-600',
  'C': 'bg-amber-50 text-amber-600',
  'D': 'bg-red-50 text-red-600',
}

const BUCKET_COLORS: Record<string, string> = {
  '0-30': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '31-60': 'bg-blue-50 text-blue-700 border-blue-200',
  '61-90': 'bg-amber-50 text-amber-700 border-amber-200',
  '90+': 'bg-red-50 text-red-700 border-red-200',
}

export function CreditControlPanel() {
  const { data, loading } = useFetch<any>('/api/credit-control', undefined)

  const customers = data?.customers || []
  const summary = data?.summary || { totalOutstanding: 0, customersWithDues: 0, onHoldCount: 0, bucketCounts: {}, bucketAmounts: {} }

  const dueCustomers = useMemo(() => {
    return customers.filter((c: any) => c.creditBalance > 0 || c.onHold)
  }, [customers])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 flex-shrink-0" />
            <span className="truncate">Credit Control</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Outstanding management, credit limits, aging, customer credit scores
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-red-700 uppercase">Total Outstanding</span>
              <IndianRupee className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-base sm:text-xl font-bold text-red-700">{formatCurrency(summary.totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-600 uppercase">Customers w/ Dues</span>
              <Users className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-base sm:text-xl font-bold text-slate-700">{summary.customersWithDues}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-amber-700 uppercase">On Hold</span>
              <Ban className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-base sm:text-xl font-bold text-amber-700">{summary.onHoldCount}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-600 uppercase">90+ Days</span>
              <Clock className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-base sm:text-xl font-bold text-red-600">{summary.bucketCounts?.['90+'] || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging buckets */}
      <div className="grid grid-cols-4 gap-2">
        {['0-30', '31-60', '61-90', '90+'].map((bucket) => (
          <Card key={bucket} className={`border-2 ${BUCKET_COLORS[bucket]}`}>
            <CardContent className="p-2 text-center">
              <p className="text-[10px] font-medium uppercase">{bucket} Days</p>
              <p className="text-sm font-bold">{summary.bucketCounts?.[bucket] || 0} cust</p>
              <p className="text-[10px]">{formatCurrency(summary.bucketAmounts?.[bucket] || 0)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Customers table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right">Outstanding</TableHead>
                  <TableHead className="text-xs text-center hidden sm:table-cell">Credit Limit</TableHead>
                  <TableHead className="text-xs text-center">Score</TableHead>
                  <TableHead className="text-xs text-center">Aging</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">Loading...</TableCell></TableRow>
                ) : dueCustomers.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-emerald-300" />
                    No outstanding dues. All customers are clear!
                  </TableCell></TableRow>
                ) : (
                  dueCustomers.map((c: any) => (
                    <TableRow key={c.id} className={c.onHold ? 'bg-red-50' : ''}>
                      <TableCell>
                        <p className="font-medium text-sm">{c.name}</p>
                        <p className="text-[10px] text-slate-500">{c.phone}</p>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">{formatCurrency(c.creditBalance)}</TableCell>
                      <TableCell className="text-center text-xs hidden sm:table-cell">
                        {c.creditLimit > 0 ? (
                          <div>
                            <p>{formatCurrency(c.creditLimit)}</p>
                            <p className={`text-[9px] ${c.utilization > 80 ? 'text-red-500' : 'text-slate-400'}`}>{c.utilization}% used</p>
                          </div>
                        ) : <span className="text-slate-300">No limit</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`text-[9px] ${SCORE_COLORS[c.creditScore] || 'bg-slate-100'}`}>{c.creditScore}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {c.agingBucket !== 'none' ? (
                          <Badge variant="outline" className={`text-[9px] ${BUCKET_COLORS[c.agingBucket] || ''}`}>
                            {c.oldestDays}d
                          </Badge>
                        ) : <span className="text-slate-300 text-xs">-</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {c.onHold ? (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[9px]"><Ban className="w-3 h-3 mr-0.5 inline" />HOLD</Badge>
                        ) : (
                          <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 text-[9px]"><ShieldCheck className="w-3 h-3 mr-0.5 inline" />OK</Badge>
                        )}
                      </TableCell>
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
