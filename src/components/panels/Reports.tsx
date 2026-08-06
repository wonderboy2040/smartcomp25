'use client'

import { useState } from 'react'
import { useFetch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/calc'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { TrendingUp, Package, AlertTriangle, Wallet, BarChart3, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react'


export function ReportsPanel() {
  const [range, setRange] = useState('monthly')
  const [months, setMonths] = useState('6')
  const [cashDate, setCashDate] = useState(new Date().toISOString().slice(0, 10))
  const [activeReport, setActiveReport] = useState<'sales' | 'topitems' | 'aging' | 'cashflow'>('sales')

  const trendQuery = activeReport === 'sales' ? `/api/reports/sales-trend?range=${range}&months=${months}` : null
  const topItemsQuery = activeReport === 'topitems' ? `/api/reports/top-items?months=${months}&limit=20` : null
  const agingQuery = activeReport === 'aging' ? `/api/reports/receivables-aging` : null
  const cashQuery = activeReport === 'cashflow' ? `/api/reports/cash-flow?date=${cashDate}` : null

  const { data: trendData, loading: trendLoading } = useFetch<any>(trendQuery, undefined)
  const { data: topItemsData, loading: topLoading } = useFetch<any>(topItemsQuery, undefined)
  const { data: agingData, loading: agingLoading } = useFetch<any>(agingQuery, undefined)
  const { data: cashData, loading: cashLoading } = useFetch<any>(cashQuery, undefined)

  const tabs = [
    { id: 'sales', label: 'Sales Trend', icon: TrendingUp },
    { id: 'topitems', label: 'Top Items', icon: Package },
    { id: 'aging', label: 'Receivables', icon: AlertTriangle },
    { id: 'cashflow', label: 'Cash Flow', icon: Wallet },
  ] as const

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
            <span className="truncate">Reports & Analytics</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Sales trends, top items, receivables aging, and daily cash flow
          </p>
        </div>
      </div>

      {/* Report tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveReport(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeReport === t.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ===== SALES TREND ===== */}
      {activeReport === 'sales' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Range</label>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="w-36 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Last N months</label>
              <Select value={months} onValueChange={setMonths}>
                <SelectTrigger className="w-32 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 months</SelectItem>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base">Sales & Profit Trend</CardTitle></CardHeader>
            <CardContent>
              {trendLoading ? (
                <p className="text-center py-8 text-slate-500">Loading...</p>
              ) : trendData?.trend?.length === 0 ? (
                <p className="text-center py-8 text-slate-500">No sales data in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData?.trend || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    <Legend />
                    <Line type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2} name="Sales" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2} name="Profit" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base">Invoice Count per Period</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData?.trend || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Invoices" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== TOP ITEMS ===== */}
      {activeReport === 'topitems' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Period</label>
              <Select value={months} onValueChange={setMonths}>
                <SelectTrigger className="w-32 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last month</SelectItem>
                  <SelectItem value="3">Last 3 months</SelectItem>
                  <SelectItem value="6">Last 6 months</SelectItem>
                  <SelectItem value="12">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-base">Top 10 by Quantity</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow className="bg-slate-50">
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Revenue</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {topLoading ? <TableRow><TableCell colSpan={4} className="text-center py-4 text-slate-500">Loading...</TableCell></TableRow> :
                     (topItemsData?.byQty || []).slice(0, 10).map((i: any) => (
                      <TableRow key={i.rank}>
                        <TableCell className="text-xs font-bold">{i.rank}</TableCell>
                        <TableCell className="text-sm font-medium truncate max-w-[150px]">{i.name}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{i.qty}</TableCell>
                        <TableCell className="text-right text-xs text-slate-600">{formatCurrency(i.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-base">Top 10 by Revenue</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow className="bg-slate-50">
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs text-right">Revenue</TableHead>
                    <TableHead className="text-xs text-right">Profit</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {topLoading ? <TableRow><TableCell colSpan={4} className="text-center py-4 text-slate-500">Loading...</TableCell></TableRow> :
                     (topItemsData?.byRevenue || []).slice(0, 10).map((i: any) => (
                      <TableRow key={i.rank}>
                        <TableCell className="text-xs font-bold">{i.rank}</TableCell>
                        <TableCell className="text-sm font-medium truncate max-w-[150px]">{i.name}</TableCell>
                        <TableCell className="text-right text-sm font-semibold text-emerald-600">{formatCurrency(i.revenue)}</TableCell>
                        <TableCell className="text-right text-xs text-blue-600">{formatCurrency(i.profit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base">Revenue by Item (Top 8)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={(topItemsData?.byRevenue || []).slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                  <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== RECEIVABLES AGING ===== */}
      {activeReport === 'aging' && (
        <div className="space-y-4">
          <Card className="bg-slate-800 border-slate-800">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400 uppercase mb-1">Total Outstanding</p>
              <p className="text-3xl font-bold text-white">{formatCurrency(agingData?.totalOutstanding || 0)}</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            {[
              { key: '0-30', label: '0-30 Days', color: 'text-emerald-600' },
              { key: '31-60', label: '31-60 Days', color: 'text-blue-600' },
              { key: '61-90', label: '61-90 Days', color: 'text-amber-600' },
              { key: '90+', label: '90+ Days', color: 'text-red-600' },
            ].map((b) => {
              const data = agingData?.buckets?.[b.key] || { count: 0, amount: 0 }
              return (
                <Card key={b.key} className="border-slate-200">
                  <CardContent className="p-3">
                    <p className="text-[10px] font-medium text-slate-600 uppercase">{b.label}</p>
                    <p className={`text-lg sm:text-xl font-bold ${b.color}`}>{formatCurrency(data.amount)}</p>
                    <p className="text-[10px] text-slate-400">{data.count} invoice{data.count !== 1 ? 's' : ''}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {agingLoading ? (
            <Card><CardContent className="text-center py-8 text-slate-500">Loading...</CardContent></Card>
          ) : agingData?.totalOutstanding === 0 ? (
            <Card><CardContent className="text-center py-8 text-slate-500">
              <Clock className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              No outstanding receivables. All invoices are paid!
            </CardContent></Card>
          ) : (
            <Card className="border-slate-200">
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow className="bg-slate-50">
                    <TableHead className="text-xs">Invoice</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs text-right">Amount Due</TableHead>
                    <TableHead className="text-xs text-center">Age</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {Object.entries(agingData?.buckets || {}).flatMap(([bucket, data]: any) =>
                      (data.invoices || []).map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                          <TableCell className="text-sm">{inv.customerName}</TableCell>
                          <TableCell className="text-xs text-slate-500">{inv.date ? new Date(inv.date).toLocaleDateString('en-IN') : '-'}</TableCell>
                          <TableCell className="text-right font-semibold text-red-600">{formatCurrency(inv.amountDue)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[9px] ${
                              bucket === '0-30' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              bucket === '31-60' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              bucket === '61-90' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {inv.days}d
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ===== CASH FLOW ===== */}
      {activeReport === 'cashflow' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Date</label>
              <Input type="date" value={cashDate} onChange={(e) => setCashDate(e.target.value)} className="h-10" />
            </div>
          </div>

          {cashLoading ? (
            <Card><CardContent className="text-center py-8 text-slate-500">Loading...</CardContent></Card>
          ) : cashData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                <Card className="bg-slate-800 border-slate-800">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">Opening Cash</p>
                    <p className="text-lg sm:text-xl font-bold text-white">{formatCurrency(cashData.openingCash)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-emerald-50 border-emerald-200">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-medium text-emerald-700 uppercase">Cash In</p>
                      <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                    </div>
                    <p className="text-lg sm:text-xl font-bold text-emerald-700">{formatCurrency(cashData.cashIn.total)}</p>
                    <p className="text-[9px] text-emerald-600">Sales: {formatCurrency(cashData.cashIn.sales)} · Service: {formatCurrency(cashData.cashIn.service)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-medium text-red-700 uppercase">Cash Out</p>
                      <ArrowDownRight className="w-4 h-4 text-red-500" />
                    </div>
                    <p className="text-lg sm:text-xl font-bold text-red-700">{formatCurrency(cashData.cashOut.total)}</p>
                    <p className="text-[9px] text-red-600">Expenses: {formatCurrency(cashData.cashOut.expenses)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-blue-600 border-blue-600">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-blue-100 uppercase mb-1">Closing Cash</p>
                    <p className="text-lg sm:text-xl font-bold text-white">{formatCurrency(cashData.closingCash)}</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-200">
                <CardHeader><CardTitle className="text-base">UPI Summary for {cashData.date}</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-[10px] text-slate-500">UPI In</p>
                      <p className="font-bold text-green-600">{formatCurrency(cashData.upi.in)}</p>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <p className="text-[10px] text-slate-500">UPI Out</p>
                      <p className="font-bold text-red-600">{formatCurrency(cashData.upi.out)}</p>
                    </div>
                    <div className="text-center p-3 bg-slate-100 rounded-lg">
                      <p className="text-[10px] text-slate-500">Net UPI</p>
                      <p className="font-bold text-slate-700">{formatCurrency(cashData.upi.net)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
