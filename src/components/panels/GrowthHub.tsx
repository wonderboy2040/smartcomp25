'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/calc'
import { useFetch, apiPost } from '@/lib/api'
import { BUSINESS_GROWTH } from '@/lib/business-growth'
import {
  Brain, Star, Bell, TrendingUp, Users, RefreshCw, Send, Zap,
  AlertTriangle, Package, Crown, Gift, ExternalLink,
  Clock, CheckCircle2, Sparkles, ArrowUp, ArrowDown,
} from 'lucide-react'

type Tab = 'overview' | 'reminders' | 'reorder' | 'loyalty' | 'snapshot' | 'sla'

export function GrowthHubPanel() {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-900 via-purple-800 to-fuchsia-900 rounded-2xl p-4 sm:p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
            <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold truncate flex items-center gap-2">
              Superintelligence Growth Hub
              <Badge className="bg-amber-400 text-amber-900 text-[10px] font-bold">PRO</Badge>
            </h1>
            <p className="text-xs sm:text-sm text-purple-200 truncate">
              AI-powered business growth engine • Customer acquisition + retention + viral marketing
            </p>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        {[
          { id: 'overview', label: 'Overview', icon: Brain },
          { id: 'reminders', label: 'Reminders', icon: Bell },
          { id: 'reorder', label: 'Reorder', icon: Package },
          { id: 'loyalty', label: 'Loyalty', icon: Crown },
          { id: 'snapshot', label: 'Snapshot', icon: TrendingUp },
          { id: 'sla', label: 'SLA Tracker', icon: Clock },
        ].map((t) => {
          const Icon = t.icon
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 px-2 py-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${
                isActive
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="truncate">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab onNavigate={setTab} />}
      {tab === 'reminders' && <RemindersTab />}
      {tab === 'reorder' && <ReorderTab />}
      {tab === 'loyalty' && <LoyaltyTab />}
      {tab === 'snapshot' && <SnapshotTab />}
      {tab === 'sla' && <SlaTab />}
    </div>
  )
}

// ===== Overview Tab =====
function OverviewTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { data, loading, refetch } = useFetch<any>('/api/growth', undefined)
  const { toast } = useToast()

  if (loading && !data) {
    return <Card><CardContent className="text-center py-8 text-slate-500">Loading growth insights…</CardContent></Card>
  }
  if (!data) {
    return <Card><CardContent className="text-center py-8 text-slate-500">No data available</CardContent></Card>
  }

  const g = data
  // Defensive: ensure all nested objects exist to prevent crashes
  const revenue = g?.revenue || { thisMonth: 0, lastMonth: 0, growthPct: 0, invoicesThisMonth: 0 }
  const customers = g?.customers || { newThisMonth: 0, totalActive: 0, repeatCustomers: 0, repeatRate: 0, vipCount: 0, goldCount: 0, silverCount: 0 }
  const opportunities = g?.opportunities || { winbackTargets: 0, reviewTargets: 0, overdueCount: 0 }
  const actions = g?.actions || [{ priority: 'low', title: 'No data available', description: 'Connect Google Sheets to see insights.' }]
  const googleReviewUrl = g?.googleReviewUrl || BUSINESS_GROWTH.googleReviewUrl
  const revenueUp = (revenue.growthPct || 0) >= 0

  return (
    <div className="space-y-4">
      {/* Top KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Revenue (Month)</p>
                <p className="text-base sm:text-lg font-bold text-emerald-700 truncate">{formatCurrency(revenue.thisMonth)}</p>
              </div>
              {revenueUp ? <ArrowUp className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <ArrowDown className="w-4 h-4 text-red-600 flex-shrink-0" />}
            </div>
            <p className={`text-[10px] mt-1 ${revenueUp ? 'text-emerald-600' : 'text-red-600'}`}>
              {revenueUp ? '↑' : '↓'} {Math.abs(revenue.growthPct).toFixed(1)}% vs last month ({formatCurrency(revenue.lastMonth)})
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">New Customers</p>
                <p className="text-base sm:text-lg font-bold text-blue-700 truncate">{customers.newThisMonth}</p>
              </div>
              <Users className="w-4 h-4 text-blue-600 flex-shrink-0" />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{customers.totalActive} total active</p>
          </CardContent>
        </Card>

        <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">Repeat Rate</p>
                <p className="text-base sm:text-lg font-bold text-violet-700 truncate">{customers.repeatRate.toFixed(1)}%</p>
              </div>
              <RefreshCw className="w-4 h-4 text-violet-600 flex-shrink-0" />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{customers.repeatCustomers} repeat / {customers.totalActive} total</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">VIP Customers</p>
                <p className="text-base sm:text-lg font-bold text-amber-700 truncate">{customers.vipCount}</p>
              </div>
              <Crown className="w-4 h-4 text-amber-600 flex-shrink-0" />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{customers.goldCount} Gold • {customers.silverCount} Silver</p>
          </CardContent>
        </Card>
      </div>

      {/* Google Review CTA */}
      <Card className="border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50">
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Star className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900">Google Review Engine</p>
            <p className="text-[11px] text-amber-700">
              Auto-embedded in PDF footers + WhatsApp messages. {opportunities.reviewTargets} customer(s) ready for review request this week.
            </p>
          </div>
          <a
            href={googleReviewUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold"
          >
            <ExternalLink className="w-3.5 h-3.5" /> View
          </a>
        </CardContent>
      </Card>

      {/* Suggested Actions — AI insights */}
      <Card className="border-violet-200 shadow-md">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-violet-600" />
            </div>
            Smart Action Recommendations
          </CardTitle>
          <CardDescription>AI-prioritised actions to grow your business</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {actions.map((a: any, i: number) => (
            <div
              key={i}
              className={`p-3 rounded-lg border flex items-start gap-3 ${
                a.priority === 'high'
                  ? 'border-red-200 bg-red-50'
                  : a.priority === 'medium'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                a.priority === 'high' ? 'bg-red-100' : a.priority === 'medium' ? 'bg-amber-100' : 'bg-emerald-100'
              }`}>
                {a.priority === 'high' ? <Zap className="w-3.5 h-3.5 text-red-600" /> : a.priority === 'medium' ? <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">{a.title}</p>
                <p className="text-[11px] text-slate-600">{a.description}</p>
              </div>
              {a.cta && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-shrink-0 text-[10px] h-7"
                  onClick={() => {
                    if (a.cta === 'reminders') onNavigate('reminders')
                    if (a.cta === 'reviews') window.open(BUSINESS_GROWTH.googleReviewUrl, '_blank')
                    if (a.cta === 'winback') {
                      navigator.clipboard?.writeText(BUSINESS_GROWTH.campaigns.winback)
                      onNavigate('loyalty')
                    }
                    if (a.cta === 'campaigns') {
                      navigator.clipboard?.writeText(BUSINESS_GROWTH.campaigns.newCustomer)
                    }
                    if (a.cta === 'referral') {
                      navigator.clipboard?.writeText(BUSINESS_GROWTH.referralOffer)
                    }
                    toast({ title: 'Action triggered ✓', duration: 2500 })
                  }}
                >
                  Act Now →
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Opportunity counts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-red-200">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><Bell className="w-5 h-5 text-red-600" /></div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase">Overdue Invoices</p>
              <p className="text-base font-bold text-red-700">{opportunities.overdueCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><Star className="w-5 h-5 text-amber-600" /></div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase">Review Requests</p>
              <p className="text-base font-bold text-amber-700">{opportunities.reviewTargets}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-violet-200">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center"><Gift className="w-5 h-5 text-violet-600" /></div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase">Win-Back Targets</p>
              <p className="text-base font-bold text-violet-700">{opportunities.winbackTargets}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" onClick={() => refetch()} className="w-full h-10">
        <RefreshCw className="w-4 h-4 mr-2" /> Refresh Insights
      </Button>
    </div>
  )
}

// ===== Reminders Tab =====
function RemindersTab() {
  const [days, setDays] = useState(7)
  const { data, loading, refetch } = useFetch<any>(`/api/reminders?days=${days}`, undefined)
  const { toast } = useToast()

  const reminders = data?.reminders || []
  const totalDue = data?.totalDue || 0

  const sendAll = async () => {
    if (reminders.length === 0) return
    if (!confirm(`Send ${reminders.length} WhatsApp reminders one by one?`)) return
    for (const r of reminders) {
      window.open(r.waUrl, '_blank')
      await new Promise((res) => setTimeout(res, 1200))
    }
    toast({ title: `Opened ${reminders.length} reminder chats ✓`, duration: 4000 })
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardContent className="p-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Overdue by (days)</label>
            <Input type="number" value={days} onChange={(e) => setDays(Number(e.target.value) || 0)} min={0} className="h-10 w-32" />
          </div>
          <Button onClick={() => refetch()} className="h-10 bg-slate-900 hover:bg-slate-800">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          {reminders.length > 0 && (
            <Button onClick={sendAll} className="h-10 bg-green-600 hover:bg-green-700">
              <Send className="w-4 h-4 mr-1" /> Send All ({reminders.length})
            </Button>
          )}
          <div className="ml-auto text-right">
            <p className="text-[10px] text-slate-500 uppercase">Total Overdue</p>
            <p className="text-base font-bold text-red-700">{formatCurrency(totalDue)}</p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="text-center py-8 text-slate-500">Loading reminders…</CardContent></Card>
      ) : reminders.length === 0 ? (
        <Card><CardContent className="text-center py-8 text-slate-500">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-300" />
          No overdue invoices in this range 🎉
        </CardContent></Card>
      ) : (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right">Due</TableHead>
                  <TableHead className="text-xs text-center">Age</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reminders.map((r: any) => (
                  <TableRow key={r.id} className={r.ageDays > 30 ? 'bg-red-50/50' : ''}>
                    <TableCell className="text-xs font-bold">{r.number}</TableCell>
                    <TableCell>
                      <p className="text-xs font-medium">{r.customerName}</p>
                      <p className="text-[10px] text-slate-500">{r.customerPhone || 'No phone'}</p>
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold text-red-700">{formatCurrency(r.amountDue)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={r.ageDays > 30 ? 'bg-red-50 text-red-700 border-red-200 text-[10px]' : 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'}>
                        {r.ageDays}d
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <a
                        href={r.waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-[11px] font-bold"
                      >
                        <Send className="w-3 h-3" /> WhatsApp
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ===== Reorder Tab =====
function ReorderTab() {
  const { data, loading, refetch } = useFetch<any>('/api/reorder', undefined)
  const suggestions = data?.suggestions || []
  const summary = data?.summary || { total: 0, critical: 0, urgent: 0, soon: 0, totalReorderCost: 0 }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-red-200">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">Critical</p>
            <p className="text-lg font-bold text-red-700">{summary.critical}</p>
            <p className="text-[10px] text-slate-500">Out of stock / below min</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">Urgent (&lt;7d)</p>
            <p className="text-lg font-bold text-orange-700">{summary.urgent}</p>
            <p className="text-[10px] text-slate-500">Will run out within a week</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">Soon (&lt;14d)</p>
            <p className="text-lg font-bold text-amber-700">{summary.soon}</p>
            <p className="text-[10px] text-slate-500">Reorder within 2 weeks</p>
          </CardContent>
        </Card>
        <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">Total Reorder Cost</p>
            <p className="text-lg font-bold text-violet-700">{formatCurrency(summary.totalReorderCost)}</p>
            <p className="text-[10px] text-slate-500">At cost price</p>
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" onClick={() => refetch()} className="h-10">
        <RefreshCw className="w-4 h-4 mr-2" /> Refresh Suggestions
      </Button>

      {loading ? (
        <Card><CardContent className="text-center py-8 text-slate-500">Analyzing sales velocity…</CardContent></Card>
      ) : suggestions.length === 0 ? (
        <Card><CardContent className="text-center py-8 text-slate-500">
          <Package className="w-12 h-12 mx-auto mb-2 text-emerald-300" />
          All stock levels healthy 🎉
        </CardContent></Card>
      ) : (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Item</TableHead>
                  <TableHead className="text-xs text-center">Current</TableHead>
                  <TableHead className="text-xs text-center">Min</TableHead>
                  <TableHead className="text-xs text-center">30d Sold</TableHead>
                  <TableHead className="text-xs text-center">Days Left</TableHead>
                  <TableHead className="text-xs text-center">Reorder Qty</TableHead>
                  <TableHead className="text-xs text-right">Cost</TableHead>
                  <TableHead className="text-xs text-center">Urgency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p className="text-xs font-bold">{s.name}</p>
                      <p className="text-[10px] text-slate-500">{s.sku} • {s.category}</p>
                    </TableCell>
                    <TableCell className="text-center text-xs font-bold">{s.currentQty}</TableCell>
                    <TableCell className="text-center text-xs text-slate-500">{s.minQty || '-'}</TableCell>
                    <TableCell className="text-center text-xs">{s.velocity30d}</TableCell>
                    <TableCell className="text-center text-xs">
                      {s.daysUntilOut !== null ? `${s.daysUntilOut}d` : '∞'}
                    </TableCell>
                    <TableCell className="text-center text-xs font-bold text-violet-700">{s.suggestedReorderQty}</TableCell>
                    <TableCell className="text-right text-xs">{formatCurrency(s.reorderCost)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={
                        s.urgency === 'critical' ? 'bg-red-50 text-red-700 border-red-200 text-[10px] font-bold'
                        : s.urgency === 'urgent' ? 'bg-orange-50 text-orange-700 border-orange-200 text-[10px] font-bold'
                        : 'bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold'
                      }>
                        {s.urgency}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ===== Loyalty Tab =====
function LoyaltyTab() {
  const { data, loading, refetch } = useFetch<any>('/api/loyalty', undefined)
  const customers = data?.customers || []
  const summary = data?.summary || {}

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-amber-200">
          <CardContent className="p-3">
            <Crown className="w-4 h-4 text-amber-600 mb-1" />
            <p className="text-lg font-bold text-amber-700">{summary.vip || 0}</p>
            <p className="text-[10px] text-slate-500">VIP (top 20%)</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200">
          <CardContent className="p-3">
            <Star className="w-4 h-4 text-yellow-600 mb-1" />
            <p className="text-lg font-bold text-yellow-700">{summary.gold || 0}</p>
            <p className="text-[10px] text-slate-500">Gold (21-50%)</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <Users className="w-4 h-4 text-slate-600 mb-1" />
            <p className="text-lg font-bold text-slate-700">{summary.silver || 0}</p>
            <p className="text-[10px] text-slate-500">Silver (others)</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardContent className="p-3">
            <Sparkles className="w-4 h-4 text-emerald-600 mb-1" />
            <p className="text-lg font-bold text-emerald-700">{summary.newCustomers || 0}</p>
            <p className="text-[10px] text-slate-500">New (&lt;30d)</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white">
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-violet-900">Avg Lifetime Value (LTV)</p>
            <p className="text-[11px] text-violet-700">{formatCurrency(summary.avgLTV || 0)} per customer • Total LTV: {formatCurrency(summary.totalLTV || 0)}</p>
          </div>
          <Badge className="bg-violet-100 text-violet-700">Repeat rate: {customers.length > 0 ? ((summary.active / customers.length) * 100).toFixed(1) : 0}%</Badge>
          <Badge className="bg-red-100 text-red-700">Win-back: {summary.winbackTargets || 0}</Badge>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={() => refetch()} className="h-10">
        <RefreshCw className="w-4 h-4 mr-2" /> Refresh Loyalty Data
      </Button>

      {loading ? (
        <Card><CardContent className="text-center py-8 text-slate-500">Computing customer loyalty…</CardContent></Card>
      ) : customers.length === 0 ? (
        <Card><CardContent className="text-center py-8 text-slate-500">No customer data yet</CardContent></Card>
      ) : (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-center">Tier</TableHead>
                  <TableHead className="text-xs text-center">Invoices</TableHead>
                  <TableHead className="text-xs text-right">LTV</TableHead>
                  <TableHead className="text-xs text-center">Avg Order</TableHead>
                  <TableHead className="text-xs text-center">Last Visit</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.slice(0, 100).map((c: any) => (
                  <TableRow key={c.customerId}>
                    <TableCell>
                      <p className="text-xs font-bold">{c.customerName || 'Walk-in'}</p>
                      <p className="text-[10px] text-slate-500">{c.phone || ''}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={
                        c.tier === 'VIP' ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold'
                        : c.tier === 'Gold' ? 'bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px] font-bold'
                        : c.tier === 'New' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold'
                        : 'bg-slate-50 text-slate-700 border-slate-200 text-[10px] font-bold'
                      }>
                        {c.tier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-xs">{c.totalInvoices}</TableCell>
                    <TableCell className="text-right text-xs font-bold">{formatCurrency(c.lifetimeValue)}</TableCell>
                    <TableCell className="text-center text-xs">{formatCurrency(c.avgOrderValue)}</TableCell>
                    <TableCell className="text-center text-xs">
                      {c.daysSinceLastVisit === 0 ? 'Today' : c.daysSinceLastVisit < 30 ? `${c.daysSinceLastVisit}d ago` : `${Math.floor(c.daysSinceLastVisit / 30)}mo ago`}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={
                        c.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                        : c.status === 'inactive' ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                        : 'bg-red-50 text-red-700 border-red-200 text-[10px]'
                      }>
                        {c.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ===== Snapshot Tab =====
function SnapshotTab() {
  const { data, loading, refetch } = useFetch<any>('/api/snapshot', undefined)
  const { toast } = useToast()
  const [sending, setSending] = useState(false)

  const snapshot = data?.snapshot
  // Defensive: ensure nested objects exist
  const snapSales = snapshot?.sales || { count: 0, value: 0, profit: 0 }
  const snapPayments = snapshot?.payments || { total: 0, upi: 0, cash: 0 }
  const snapCustomers = snapshot?.customers || { newToday: 0 }
  const snapJobs = snapshot?.jobs || { newToday: 0, completedToday: 0, pending: 0 }
  const snapStock = snapshot?.stock || { lowStockCount: 0 }
  const snapOverdue = snapshot?.overdue || { count: 0, value: 0 }
  const snapTopItem = snapshot?.topItem || null
  const snapDate = snapshot?.date || new Date().toISOString()
  const sendWhatsApp = async () => {
    setSending(true)
    try {
      const res = await apiPost('/api/snapshot/send', {})
      if (res.waUrl) {
        window.open(res.waUrl, '_blank')
        toast({ title: 'Snapshot ready on WhatsApp ✓', duration: 3000 })
      }
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  if (loading && !snapshot) {
    return <Card><CardContent className="text-center py-8 text-slate-500">Generating today's snapshot…</CardContent></Card>
  }
  if (!snapshot) {
    return <Card><CardContent className="text-center py-8 text-slate-500">No data</CardContent></Card>
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-900 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] text-slate-400 uppercase">Daily Snapshot</p>
              <p className="text-lg font-bold">{new Date(snapDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <Button onClick={sendWhatsApp} disabled={sending} className="bg-green-500 hover:bg-green-600 text-white">
              {sending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : <><Send className="w-4 h-4 mr-2" /> Send WhatsApp</>}
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/10 rounded-lg p-2">
              <p className="text-[10px] text-slate-300">Sales</p>
              <p className="text-base font-bold">{formatCurrency(snapSales.value)}</p>
              <p className="text-[10px] text-emerald-300">{snapSales.count} invoices • Profit {formatCurrency(snapSales.profit)}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2">
              <p className="text-[10px] text-slate-300">Payments</p>
              <p className="text-base font-bold">{formatCurrency(snapPayments.total)}</p>
              <p className="text-[10px] text-slate-300">UPI {formatCurrency(snapPayments.upi)} • Cash {formatCurrency(snapPayments.cash)}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2">
              <p className="text-[10px] text-slate-300">New Customers</p>
              <p className="text-base font-bold">{snapCustomers.newToday}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2">
              <p className="text-[10px] text-slate-300">Service Jobs</p>
              <p className="text-base font-bold">{snapJobs.newToday} new</p>
              <p className="text-[10px] text-slate-300">{snapJobs.completedToday} done • {snapJobs.pending} pending</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {snapTopItem && (
        <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-white">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center"><Star className="w-4 h-4 text-emerald-600" /></div>
            <div className="flex-1">
              <p className="text-[10px] text-slate-500 uppercase">Top Item Today</p>
              <p className="text-sm font-bold text-slate-900">{snapTopItem.name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-emerald-700">{snapTopItem.qty} sold</p>
              <p className="text-[10px] text-slate-500">{formatCurrency(snapTopItem.revenue)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className={`border-slate-200 ${snapStock.lowStockCount > 0 ? 'ring-2 ring-red-200' : ''}`}>
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">Low Stock Items</p>
            <p className="text-lg font-bold text-red-700">{snapStock.lowStockCount}</p>
          </CardContent>
        </Card>
        <Card className={`border-slate-200 ${snapOverdue.count > 0 ? 'ring-2 ring-red-200' : ''}`}>
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">Overdue Invoices</p>
            <p className="text-lg font-bold text-red-700">{snapOverdue.count}</p>
            <p className="text-[10px] text-slate-500">{formatCurrency(snapOverdue.value)}</p>
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" onClick={() => refetch()} className="h-10 w-full">
        <RefreshCw className="w-4 h-4 mr-2" /> Refresh Snapshot
      </Button>
    </div>
  )
}

// ===== SLA Tab =====
function SlaTab() {
  const { data, loading, refetch } = useFetch<any>('/api/sla', undefined)
  const jobs = data?.jobs || []
  const summary = data?.summary || { total: 0, red: 0, amber: 0, green: 0, overdue: 0 }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-red-200">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">Critical (Red)</p>
            <p className="text-lg font-bold text-red-700">{summary.red}</p>
            <p className="text-[10px] text-red-500">2x over SLA target</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">Warning (Amber)</p>
            <p className="text-lg font-bold text-amber-700">{summary.amber}</p>
            <p className="text-[10px] text-amber-500">Over SLA target</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-500 uppercase">Healthy (Green)</p>
            <p className="text-lg font-bold text-emerald-700">{summary.green}</p>
            <p className="text-[10px] text-emerald-500">Within target</p>
          </CardContent>
        </Card>
        <Card className="border-slate-900 bg-slate-900 text-white">
          <CardContent className="p-3">
            <p className="text-[10px] text-slate-300 uppercase">Active Jobs</p>
            <p className="text-lg font-bold">{summary.total}</p>
            <p className="text-[10px] text-slate-300">{summary.overdue} overdue</p>
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" onClick={() => refetch()} className="h-10">
        <RefreshCw className="w-4 h-4 mr-2" /> Refresh SLA Status
      </Button>

      {loading ? (
        <Card><CardContent className="text-center py-8 text-slate-500">Loading SLA status…</CardContent></Card>
      ) : jobs.length === 0 ? (
        <Card><CardContent className="text-center py-8 text-slate-500">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-300" />
          No active service jobs 🎉
        </CardContent></Card>
      ) : (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Job ID</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Device</TableHead>
                  <TableHead className="text-xs text-center">Priority</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs text-center">In Stage</TableHead>
                  <TableHead className="text-xs text-center">Total Age</TableHead>
                  <TableHead className="text-xs text-center">SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j: any) => (
                  <TableRow key={j.id} className={j.slaHealth === 'red' ? 'bg-red-50/40' : j.slaHealth === 'amber' ? 'bg-amber-50/40' : ''}>
                    <TableCell className="text-xs font-mono font-bold">{j.jobId}</TableCell>
                    <TableCell>
                      <p className="text-xs font-medium">{j.customerName}</p>
                      <p className="text-[10px] text-slate-500">{j.customerMobile}</p>
                    </TableCell>
                    <TableCell className="text-xs">{j.deviceType} {j.brandModel ? `- ${j.brandModel}` : ''}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={
                        j.priority === 'High' ? 'bg-red-50 text-red-700 border-red-200 text-[10px]'
                        : j.priority === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                      }>
                        {j.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-xs">{j.status}</TableCell>
                    <TableCell className="text-center text-xs">
                      {j.timeInStageHours > 24 ? `${(j.timeInStageHours / 24).toFixed(1)}d` : `${j.timeInStageHours.toFixed(1)}h`}
                      <span className="text-[10px] text-slate-400 block">/ {j.targetHours}h target</span>
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {j.totalAgeHours > 24 ? `${(j.totalAgeHours / 24).toFixed(1)}d` : `${j.totalAgeHours.toFixed(1)}h`}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={
                        j.slaHealth === 'red' ? 'bg-red-100 text-red-700 border-red-300 text-[10px] font-bold'
                        : j.slaHealth === 'amber' ? 'bg-amber-100 text-amber-700 border-amber-300 text-[10px] font-bold'
                        : 'bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px] font-bold'
                      }>
                        {j.slaHealth.toUpperCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
