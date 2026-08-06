'use client'

import { useState } from 'react'
import { useFetch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { formatCurrency } from '@/lib/calc'
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { FileText, TrendingUp, IndianRupee, Package, ArrowUpRight, ArrowDownRight, Scale } from 'lucide-react'

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

export function FinancialsPanel() {
  const [activeTab, setActiveTab] = useState<'pnl' | 'balance'>('pnl')
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [asOnDate, setAsOnDate] = useState(new Date().toISOString().slice(0, 10))
  const [filterKey, setFilterKey] = useState(`from=${fromDate}&to=${toDate}`)

  const pnlQuery = activeTab === 'pnl' ? `/api/reports/pnl?${filterKey}` : null
  const balanceQuery = activeTab === 'balance' ? `/api/reports/balance-sheet?asOn=${asOnDate}` : null

  const { data: pnlData, loading: pnlLoading } = useFetch<any>(pnlQuery, undefined)
  const { data: balanceData, loading: balanceLoading } = useFetch<any>(balanceQuery, undefined)

  const applyFilter = () => {
    setFilterKey(`from=${fromDate}&to=${toDate}`)
  }

  const expensePieData = pnlData?.expenses?.byCategory
    ? Object.entries(pnlData.expenses.byCategory).map(([name, value]: any) => ({ name, value }))
    : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 flex-shrink-0" />
            <span className="truncate">Financials</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Profit & Loss Statement + Balance Sheet
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('pnl')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === 'pnl' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
        >
          <TrendingUp className="w-4 h-4" /> P&L Statement
        </button>
        <button
          onClick={() => setActiveTab('balance')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === 'balance' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
        >
          <Scale className="w-4 h-4" /> Balance Sheet
        </button>
      </div>

      {/* ===== P&L ===== */}
      {activeTab === 'pnl' && (
        <div className="space-y-4">
          {/* Date filter */}
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">From</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">To</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10" />
            </div>
            <Button onClick={applyFilter} className="bg-indigo-600 hover:bg-indigo-700 h-10">Apply</Button>
          </div>

          {pnlLoading ? (
            <Card><CardContent className="text-center py-8 text-slate-500">Loading...</CardContent></Card>
          ) : pnlData ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                <Card className="bg-emerald-50 border-emerald-200">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-emerald-700 uppercase">Total Revenue</span>
                      <IndianRupee className="w-4 h-4 text-emerald-500" />
                    </div>
                    <p className="text-base sm:text-xl font-bold text-emerald-700">{formatCurrency(pnlData.revenue.total)}</p>
                    <p className="text-[9px] text-emerald-600">Sales: {formatCurrency(pnlData.revenue.sales)} · Service: {formatCurrency(pnlData.revenue.service)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50 border-orange-200">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-orange-700 uppercase">COGS</span>
                      <Package className="w-4 h-4 text-orange-500" />
                    </div>
                    <p className="text-base sm:text-xl font-bold text-orange-700">{formatCurrency(pnlData.cogs)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-blue-700 uppercase">Gross Profit</span>
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                    </div>
                    <p className="text-base sm:text-xl font-bold text-blue-700">{formatCurrency(pnlData.grossProfit)}</p>
                    <p className="text-[9px] text-blue-600">{pnlData.grossMargin}% margin</p>
                  </CardContent>
                </Card>
                <Card className={`border-2 ${pnlData.netProfit >= 0 ? 'bg-emerald-100 border-emerald-300' : 'bg-red-100 border-red-300'}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-slate-700 uppercase">Net Profit</span>
                      {pnlData.netProfit >= 0 ? <ArrowUpRight className="w-4 h-4 text-emerald-500" /> : <ArrowDownRight className="w-4 h-4 text-red-500" />}
                    </div>
                    <p className={`text-base sm:text-xl font-bold ${pnlData.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {formatCurrency(pnlData.netProfit)}
                    </p>
                    <p className="text-[9px] text-slate-600">{pnlData.netMargin}% margin</p>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed P&L */}
              <Card className="border-slate-200">
                <CardHeader><CardTitle className="text-base">Profit & Loss Statement</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {/* Revenue */}
                  <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1">REVENUE</div>
                  <div className="flex justify-between"><span className="text-slate-600">Sales (Invoices)</span><span className="font-medium">{formatCurrency(pnlData.revenue.sales)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Service Income</span><span className="font-medium">{formatCurrency(pnlData.revenue.service)}</span></div>
                  <div className="flex justify-between font-bold border-b border-slate-200 pb-1"><span>Total Revenue</span><span className="text-emerald-600">{formatCurrency(pnlData.revenue.total)}</span></div>

                  {/* COGS */}
                  <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1 pt-2">COST OF GOODS SOLD</div>
                  <div className="flex justify-between"><span className="text-slate-600">COGS (Invoice Total Cost)</span><span className="font-medium text-orange-600">{formatCurrency(pnlData.cogs)}</span></div>

                  {/* Gross Profit */}
                  <div className="flex justify-between font-bold bg-blue-50 p-2 rounded"><span>Gross Profit</span><span className="text-blue-700">{formatCurrency(pnlData.grossProfit)}</span></div>

                  {/* Expenses */}
                  <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1 pt-2">EXPENSES (Shop)</div>
                  {Object.entries(pnlData.expenses.byCategory).map(([cat, amt]: any) => (
                    <div key={cat} className="flex justify-between text-xs"><span className="text-slate-600">{cat}</span><span>{formatCurrency(amt)}</span></div>
                  ))}
                  <div className="flex justify-between font-bold border-b border-slate-200 pb-1"><span>Total Expenses</span><span className="text-red-600">{formatCurrency(pnlData.expenses.total)}</span></div>

                  {/* Net Profit */}
                  <div className={`flex justify-between font-bold p-2 rounded ${pnlData.netProfit >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    <span>NET PROFIT</span>
                    <span className={pnlData.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}>{formatCurrency(pnlData.netProfit)}</span>
                  </div>

                  {/* Personal (info only) */}
                  <div className="pt-2 border-t border-slate-200">
                    <p className="text-[10px] text-slate-400 uppercase">Personal (not in business P&L)</p>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Personal Income</span><span className="text-emerald-500">{formatCurrency(pnlData.other.personalIncome)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Personal Expense</span><span className="text-red-500">{formatCurrency(pnlData.other.personalExpense)}</span></div>
                  </div>
                </CardContent>
              </Card>

              {/* Expense pie chart */}
              {expensePieData.length > 0 && (
                <Card className="border-slate-200">
                  <CardHeader><CardTitle className="text-base">Expense Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={expensePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => `${e.name}: ${formatCurrency(e.value)}`}>
                          {expensePieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ===== Balance Sheet ===== */}
      {activeTab === 'balance' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">As On Date</label>
              <Input type="date" value={asOnDate} onChange={(e) => setAsOnDate(e.target.value)} className="h-10" />
            </div>
          </div>

          {balanceLoading ? (
            <Card><CardContent className="text-center py-8 text-slate-500">Loading...</CardContent></Card>
          ) : balanceData ? (
            <>
              {/* Net Worth */}
              <Card className={`border-2 ${balanceData.netWorth >= 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-slate-500 uppercase">Net Worth (as on {asOnDate})</p>
                  <p className={`text-3xl font-bold ${balanceData.netWorth >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatCurrency(balanceData.netWorth)}
                  </p>
                  <p className="text-[10px] text-slate-400">Assets - Liabilities</p>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Assets */}
                <Card className="border-emerald-200">
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowUpRight className="w-5 h-5 text-emerald-600" /> Assets</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-600">Stock Value (at cost)</span><span className="font-medium">{formatCurrency(balanceData.assets.stockValueCost)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-400">Stock Value (at sell)</span><span className="text-slate-400">{formatCurrency(balanceData.assets.stockValueSelling)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">Receivables (Due Invoices)</span><span className="font-medium">{formatCurrency(balanceData.assets.receivables)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">Cash in Hand</span><span className="font-medium">{formatCurrency(balanceData.assets.cashInHand)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">UPI Balance</span><span className="font-medium">{formatCurrency(balanceData.assets.upiBalance)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">Bank/Card Balance</span><span className="font-medium">{formatCurrency(balanceData.assets.bankBalance)}</span></div>
                    <div className="flex justify-between font-bold border-t border-slate-200 pt-1"><span>Total Assets</span><span className="text-emerald-700">{formatCurrency(balanceData.assets.total)}</span></div>
                  </CardContent>
                </Card>

                {/* Liabilities */}
                <Card className="border-red-200">
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowDownRight className="w-5 h-5 text-red-600" /> Liabilities</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="text-xs text-slate-400 text-center py-4">No liabilities tracked. (Receivables are already counted as assets above.)</div>
                    <div className="flex justify-between font-bold border-t border-slate-200 pt-1"><span>Total Liabilities</span><span className="text-red-700">{formatCurrency(balanceData.liabilities.total)}</span></div>
                    <div className="pt-3 text-center">
                      <p className="text-[10px] text-slate-400">Net Worth</p>
                      <p className={`text-xl font-bold ${balanceData.netWorth >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(balanceData.netWorth)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
