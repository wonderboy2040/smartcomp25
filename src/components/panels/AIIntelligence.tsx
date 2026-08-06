'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useFetch } from '@/lib/api'

import { generateSuperIntelligence, processNaturalLanguageQuery, type IntelligenceInput } from '@/lib/super-intelligence'
import { Brain, Sparkles, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, Lightbulb, Search, MessageCircle, Zap, Target, Users, Package, Crown, ArrowUpRight, Loader2, Bot, Cpu, LineChart, Activity, Rocket, Eye, ThumbsUp, DollarSign } from 'lucide-react'

export function AIIntelligencePanel() {
  const { data: invoicesData } = useFetch<any[]>('/api/invoices?limit=500', undefined)
  const { data: itemsData } = useFetch<any[]>('/api/items', undefined)
  const { data: customersData } = useFetch<any[]>('/api/customers', undefined)
  const { data: jobsData } = useFetch<any[]>('/api/jobs', undefined)
  const { data: paymentsData } = useFetch<any[]>('/api/payments?limit=200', undefined)
  const { data: expensesData } = useFetch<any[]>('/api/expenses', undefined)
  const { data: quotationsData } = useFetch<any[]>('/api/quotations?limit=200', undefined)

  const [aiQuery, setAiQuery] = useState('')
  const [queryResult, setQueryResult] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'forecast' | 'customers' | 'stock' | 'insights' | 'chat'>('overview')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const intelligenceInput = useMemo<IntelligenceInput>(() => ({
    invoices: invoicesData || [],
    items: itemsData || [],
    customers: customersData || [],
    jobs: jobsData || [],
    payments: paymentsData || [],
    expenses: expensesData || [],
    quotations: quotationsData || [],
  }), [invoicesData, itemsData, customersData, jobsData, paymentsData, expensesData, quotationsData])

  const superIntelligence = useMemo(() => {
    if (!invoicesData || !itemsData) return null
    try {
      return generateSuperIntelligence(intelligenceInput)
    } catch (e) {
      console.error('Super intelligence error', e)
      return null
    }
  }, [intelligenceInput, invoicesData, itemsData])

  const handleAIQuery = (queryOverride?: string) => {
    const q = (queryOverride ?? aiQuery).trim()
    if (!q || !superIntelligence) return
    if (queryOverride) setAiQuery(queryOverride)
    setIsAnalyzing(true)
    try {
      const result = processNaturalLanguageQuery(q, intelligenceInput)
      setQueryResult(result)
    } catch (e) {
      console.error('AI query error', e)
      setQueryResult(null)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const exampleQueries = [
    "sales this month",
    "low stock items",
    "top customers",
    "profit this month",
    "pending jobs",
    "today sales",
  ]

  if (!superIntelligence) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center animate-pulse">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <p className="text-sm text-slate-500">Super Intelligence Engine booting...</p>
          <p className="text-xs text-slate-400">Analyzing {invoicesData?.length || 0} invoices, {itemsData?.length || 0} items, {customersData?.length || 0} customers</p>
        </div>
      </div>
    )
  }

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'from-emerald-500 to-teal-600'
      case 'good': return 'from-blue-500 to-indigo-600'
      case 'needs_attention': return 'from-amber-500 to-orange-600'
      case 'critical': return 'from-red-500 to-rose-600'
      default: return 'from-slate-500 to-slate-600'
    }
  }

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'excellent': return <Crown className="w-5 h-5" />
      case 'good': return <ThumbsUp className="w-5 h-5" />
      case 'needs_attention': return <Eye className="w-5 h-5" />
      case 'critical': return <AlertTriangle className="w-5 h-5" />
      default: return <Activity className="w-5 h-5" />
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-10">
      {/* HEADER */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-700 p-5 sm:p-7 text-white">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-blue-300/20 rounded-full blur-2xl" />
        
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <Brain className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
                  Super Intelligence
                  <Badge className="bg-amber-400 text-amber-900 border-0 text-[10px] font-bold px-2 py-0.5">PRO v7.0</Badge>
                </h1>
                <p className="text-violet-100 text-xs sm:text-sm mt-1">AI-powered business brain • No API cost • Privacy-first • Local intelligence</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px]"><Cpu className="w-3 h-3 mr-1" /> Pure TypeScript</Badge>
              <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px]"><ShieldCheck className="w-3 h-3 mr-1" /> Offline Capable</Badge>
              <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px]"><Zap className="w-3 h-3 mr-1" /> {intelligenceInput.invoices.length + intelligenceInput.items.length + intelligenceInput.customers.length} records analyzed</Badge>
            </div>
          </div>

          <div className="flex gap-3">
            <div className={`rounded-2xl bg-gradient-to-br ${getHealthColor(superIntelligence.healthStatus)} p-[1px] shadow-xl`}>
              <div className="rounded-[15px] bg-white/10 backdrop-blur-xl px-5 py-3 border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">{getHealthIcon(superIntelligence.healthStatus)}</div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-violet-200">AI Health Score</p>
                    <p className="text-2xl font-bold">{superIntelligence.aiScore}/100</p>
                    <p className="text-[11px] text-violet-100 capitalize">{superIntelligence.healthStatus.replace('_', ' ')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick summary */}
        <div className="relative mt-5 grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
          <div className="rounded-xl bg-white/10 backdrop-blur border border-white/10 p-3">
            <p className="text-[10px] text-violet-200 uppercase">Insights</p>
            <p className="text-lg font-bold">{superIntelligence.summary.totalInsights}</p>
            <p className="text-[10px] text-violet-200">actionable</p>
          </div>
          <div className="rounded-xl bg-white/10 backdrop-blur border border-white/10 p-3">
            <p className="text-[10px] text-violet-200 uppercase">Anomalies</p>
            <p className="text-lg font-bold">{superIntelligence.anomalies.length}</p>
            <p className="text-[10px] text-rose-200">{superIntelligence.summary.criticalAnomalies} critical</p>
          </div>
          <div className="rounded-xl bg-white/10 backdrop-blur border border-white/10 p-3">
            <p className="text-[10px] text-violet-200 uppercase">At-Risk Customers</p>
            <p className="text-lg font-bold">{superIntelligence.summary.highRiskCustomers}</p>
            <p className="text-[10px] text-amber-200">need winback</p>
          </div>
          <div className="rounded-xl bg-white/10 backdrop-blur border border-white/10 p-3">
            <p className="text-[10px] text-violet-200 uppercase">Stock Risk</p>
            <p className="text-lg font-bold">{superIntelligence.summary.stockoutRiskItems}</p>
            <p className="text-[10px] text-blue-200">need reorder</p>
          </div>
          <div className="rounded-xl bg-white/10 backdrop-blur border border-white/10 p-3 col-span-2 lg:col-span-1">
            <p className="text-[10px] text-violet-200 uppercase">Profit Leaks</p>
            <p className="text-lg font-bold">Rs.{(superIntelligence.summary.totalLeakAmount / 1000).toFixed(1)}k</p>
            <p className="text-[10px] text-emerald-200">recoverable</p>
          </div>
        </div>
      </div>

      {/* AI CHAT BAR */}
      <Card className="border-violet-200 shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500" />
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Ask AI Anything (Natural Language)</p>
              <p className="text-[11px] text-slate-500">e.g. "sales this month", "low stock items", "top customers", "profit"</p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAIQuery()}
                placeholder="Ask: sales today, low stock, top customers, pending jobs..."
                className="pl-10 h-11 bg-slate-50 border-slate-200"
              />
            </div>
            <Button onClick={() => handleAIQuery()} disabled={isAnalyzing || !aiQuery.trim()} className="h-11 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-6">
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4 mr-1" /> Ask AI</>}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {exampleQueries.map(q => (
              <button key={q} onClick={() => handleAIQuery(q)} className="text-[11px] px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors">
                {q}
              </button>
            ))}
          </div>
          {queryResult && (
            <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-violet-50/50 border border-violet-100">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="w-4 h-4 text-violet-600" />
                <span className="text-xs font-semibold text-violet-900">AI Response • {queryResult.intent}</span>
                <Badge variant="outline" className="text-[10px]">{Object.keys(queryResult.entities).length > 0 ? JSON.stringify(queryResult.entities) : 'general'}</Badge>
              </div>
              <p className="text-sm text-slate-800 font-medium">{queryResult.answer}</p>
              {queryResult.suggestedActions && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {queryResult.suggestedActions.map((a: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px] bg-white">{a}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* TABS */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto scrollbar-hide">
        {[
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'forecast', label: 'Forecast', icon: TrendingUp },
          { id: 'insights', label: 'Smart Insights', icon: Lightbulb },
          { id: 'customers', label: 'Customers AI', icon: Users },
          { id: 'stock', label: 'Stock AI', icon: Package },
          { id: 'chat', label: 'Anomalies', icon: AlertTriangle },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-white shadow text-violet-700 border border-violet-100' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="grid gap-4">
          <div className="grid md:grid-cols-3 gap-4">
            {/* Forecast mini */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><LineChart className="w-4 h-4 text-blue-600" /> Revenue Forecast (Next 3M)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {superIntelligence.forecasts.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                    <div>
                      <p className="text-xs font-semibold">{f.period}</p>
                      <p className="text-[10px] text-slate-500">{f.confidence}% confidence • {f.trend}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">Rs.{(f.predictedSales / 1000).toFixed(0)}k</p>
                      <p className="text-[10px] text-emerald-600">+{f.predictedProfit > 0 ? `Rs.${(f.predictedProfit/1000).toFixed(1)}k profit` : ''}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Insights summary */}
            <Card className="border-slate-200 md:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-600" /> Top Actionable Insights</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-[280px] overflow-y-auto">
                {superIntelligence.insights.slice(0, 4).map(ins => (
                  <div key={ins.id} className="p-3 rounded-xl border bg-white hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-[9px] px-1.5 py-0 ${ins.priority === 'urgent' ? 'bg-red-100 text-red-700' : ins.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{ins.priority}</Badge>
                          <p className="text-xs font-semibold truncate">{ins.title}</p>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{ins.message}</p>
                        {ins.suggestedAction && <p className="text-[11px] text-violet-700 mt-1 font-medium">→ {ins.suggestedAction}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold">{ins.metric}</p>
                        <p className={`text-[10px] ${ins.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{ins.change > 0 ? '+' : ''}{ins.change}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-600" /> Critical Anomalies</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {superIntelligence.anomalies.length === 0 ? (
                  <div className="text-center py-6">
                    <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500" />
                    <p className="text-xs text-slate-600 mt-2">No anomalies detected • Business healthy ✓</p>
                  </div>
                ) : superIntelligence.anomalies.slice(0, 3).map((a, i) => (
                  <div key={i} className={`p-3 rounded-xl border-l-4 ${a.severity === 'critical' ? 'border-red-500 bg-red-50' : a.severity === 'high' ? 'border-orange-500 bg-orange-50' : 'border-amber-400 bg-amber-50'}`}>
                    <p className="text-xs font-bold text-slate-900">{a.title}</p>
                    <p className="text-[11px] text-slate-700 mt-1">{a.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-[10px]">{a.type.replace('_', ' ')}</Badge>
                      <span className="text-[10px] text-slate-600">{a.action}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-600" /> Profit Leak Detector</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {superIntelligence.profitLeaks.length === 0 ? (
                  <div className="text-center py-6">
                    <Target className="w-10 h-10 mx-auto text-emerald-500" />
                    <p className="text-xs text-slate-600 mt-2">No major leaks found • Optimal ✓</p>
                  </div>
                ) : superIntelligence.profitLeaks.slice(0, 3).map((leak, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-50 border">
                    <div className="flex justify-between">
                      <p className="text-xs font-semibold">{leak.area}</p>
                      <p className="text-xs font-bold text-red-600">-Rs.{leak.leakAmount.toLocaleString()}</p>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">{leak.description}</p>
                    <p className="text-[11px] text-emerald-700 mt-1 font-medium">Fix: {leak.fix}</p>
                  </div>
                ))}
                {superIntelligence.profitLeaks.length > 0 && (
                  <div className="p-2 rounded-lg bg-gradient-to-r from-red-50 to-orange-50 border border-red-200">
                    <p className="text-xs font-bold text-red-800">Total recoverable: Rs.{superIntelligence.summary.totalLeakAmount.toLocaleString()}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'forecast' && (
        <div className="grid gap-4">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Rocket className="w-5 h-5 text-violet-600" /> 90-Day Revenue Intelligence</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                {superIntelligence.forecasts.map((f, i) => (
                  <div key={i} className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white to-slate-50 p-4">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 to-blue-500" />
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">{f.period} • {f.confidence}% confident</p>
                        <p className="text-xl font-bold mt-1">Rs.{f.predictedSales.toLocaleString()}</p>
                        <p className="text-xs text-slate-600">Profit Rs.{f.predictedProfit.toLocaleString()}</p>
                      </div>
                      <Badge className={f.trend === 'up' ? 'bg-emerald-100 text-emerald-700' : f.trend === 'down' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}>{f.trend === 'up' ? <TrendingUp className="w-3 h-3 mr-1" /> : f.trend === 'down' ? <TrendingDown className="w-3 h-3 mr-1" /> : null}{f.trend}</Badge>
                    </div>
                    <div className="mt-3 flex justify-between text-[10px] text-slate-500">
                      <span>Min: Rs.{f.lowerBound.toLocaleString()}</span>
                      <span>Max: Rs.{f.upperBound.toLocaleString()}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500" style={{ width: `${f.confidence}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200">
                <p className="text-sm font-semibold text-violet-900">🧠 AI Recommendation</p>
                <p className="text-xs text-slate-700 mt-1">
                  {superIntelligence.forecasts[0].trend === 'up'
                    ? `Strong upward trend detected! Forecast shows growth. Double inventory of top 5 sellers, increase marketing budget 15% to capitalize.`
                    : superIntelligence.forecasts[0].trend === 'down'
                      ? `Downtrend alert! Predicted dip. Launch win-back campaign, offer bundle discounts, focus on high-margin services.`
                      : `Stable forecast. Good time to optimize - clear slow-moving stock, negotiate supplier better rates, introduce AMC upsell.`}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'insights' && (
        <div className="grid gap-3">
          {superIntelligence.insights.map(ins => (
            <Card key={ins.id} className="border-slate-200 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ins.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' : ins.color === 'red' ? 'bg-red-100 text-red-600' : ins.color === 'blue' ? 'bg-blue-100 text-blue-600' : ins.color === 'violet' ? 'bg-violet-100 text-violet-600' : 'bg-amber-100 text-amber-600'}`}>
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sm">{ins.title}</p>
                      <Badge className={`${ins.priority === 'urgent' ? 'bg-red-600 text-white' : ins.priority === 'high' ? 'bg-orange-500 text-white' : ins.priority === 'medium' ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700'} text-[10px]`}>{ins.priority}</Badge>
                      <Badge variant="outline" className="text-[10px]">{ins.category}</Badge>
                    </div>
                    <p className="text-xs text-slate-700 mt-1">{ins.message}</p>
                    {ins.suggestedAction && (
                      <div className="mt-2 p-2 rounded-lg bg-violet-50 border border-violet-100">
                        <p className="text-[11px] font-medium text-violet-800">💡 Action: {ins.suggestedAction}</p>
                        {ins.estimatedImpact && <p className="text-[11px] text-emerald-700 mt-1">Impact: {ins.estimatedImpact}</p>}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{ins.metric}</p>
                    <div className={`flex items-center text-[11px] ${ins.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {ins.change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} {ins.change > 0 ? '+' : ''}{ins.change}%
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'customers' && (
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="w-5 h-5 text-pink-600" /> Customer Intelligence • LTV & Churn AI</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-[11px] text-slate-500"><th className="text-left p-2">Customer</th><th className="text-left p-2">Segment</th><th className="text-right p-2">LTV / Pred</th><th className="text-center p-2">Health</th><th className="text-center p-2">Churn Risk</th><th className="text-left p-2">Action</th></tr></thead>
                <tbody>
                  {superIntelligence.customerIntel.map(c => (
                    <tr key={c.customerId} className="border-b hover:bg-slate-50">
                      <td className="p-2"><p className="font-medium">{c.name}</p><p className="text-[10px] text-slate-500">{c.totalOrders} orders • {c.lastPurchaseDays === -1 ? 'new' : `${c.lastPurchaseDays}d ago`}</p></td>
                      <td className="p-2"><Badge className={`${c.segment === 'champion' ? 'bg-amber-100 text-amber-800' : c.segment === 'loyal' ? 'bg-emerald-100 text-emerald-700' : c.segment === 'at_risk' ? 'bg-red-100 text-red-700' : c.segment === 'churned' ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-700'} text-[10px]`}>{c.segment}</Badge></td>
                      <td className="p-2 text-right"><p className="font-bold">Rs.{c.totalSpent.toLocaleString()}</p><p className="text-[10px] text-slate-500">→ Rs.{c.predictedLtv.toLocaleString()}</p></td>
                      <td className="p-2 text-center"><div className="w-10 h-2 bg-slate-200 rounded-full mx-auto overflow-hidden"><div className={`h-full ${c.healthScore > 70 ? 'bg-emerald-500' : c.healthScore > 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${c.healthScore}%` }} /></div><span className="text-[10px]">{c.healthScore}</span></td>
                      <td className="p-2 text-center"><Badge variant="outline" className={`${c.churnRisk > 60 ? 'border-red-300 text-red-700 bg-red-50' : c.churnRisk > 30 ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-emerald-300 text-emerald-700 bg-emerald-50'} text-[10px]`}>{c.churnRisk}%</Badge></td>
                      <td className="p-2"><p className="text-[11px] max-w-[200px] truncate" title={c.recommendation}>{c.recommendation}</p></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'stock' && (
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="w-5 h-5 text-blue-600" /> Stock Intelligence • Demand Prediction AI</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-[11px] text-slate-500"><th className="text-left p-2">Item</th><th className="text-center p-2">Current</th><th className="text-center p-2">Demand 30d</th><th className="text-center p-2">Stockout Risk</th><th className="text-center p-2">Days Left</th><th className="text-left p-2">Action</th></tr></thead>
                <tbody>
                  {superIntelligence.stockIntel.map(s => (
                    <tr key={s.itemId} className="border-b hover:bg-slate-50">
                      <td className="p-2"><p className="font-medium truncate max-w-[150px]">{s.name}</p><p className="text-[10px] text-slate-500">{s.demandTrend} • {s.profitScore} profit score</p></td>
                      <td className="p-2 text-center font-bold">{s.currentStock}</td>
                      <td className="p-2 text-center">{s.predictedDemand30d}</td>
                      <td className="p-2 text-center"><div className="flex flex-col items-center"><div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full ${s.stockoutRisk > 70 ? 'bg-red-500' : s.stockoutRisk > 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${s.stockoutRisk}%` }} /></div><span className="text-[10px] mt-0.5">{s.stockoutRisk}%</span></div></td>
                      <td className="p-2 text-center">{s.daysOfStockLeft >= 999 ? '∞' : `${s.daysOfStockLeft}d`}</td>
                      <td className="p-2"><Badge className={`${s.action === 'reorder_now' ? 'bg-red-600 text-white animate-pulse' : s.action === 'reorder_soon' ? 'bg-amber-500 text-white' : s.action === 'overstock' ? 'bg-blue-100 text-blue-700' : s.action === 'discontinue' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'} text-[10px]`}>{s.action.replace('_', ' ')}</Badge>{s.suggestedOrderQty > 0 && <span className="ml-1 text-[10px] text-slate-600">• Order {s.suggestedOrderQty}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'chat' && (
        <div className="grid gap-4">
          {superIntelligence.anomalies.map((a, i) => (
            <Card key={i} className={`border-l-4 ${a.severity === 'critical' ? 'border-l-red-600' : a.severity === 'high' ? 'border-l-orange-500' : a.severity === 'medium' ? 'border-l-amber-400' : 'border-l-blue-400'}`}>
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.severity === 'critical' ? 'bg-red-100 text-red-600' : a.severity === 'high' ? 'bg-orange-100 text-orange-600' : 'bg-amber-100 text-amber-600'}`}><AlertTriangle className="w-5 h-5" /></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><p className="font-bold text-sm">{a.title}</p><Badge variant="outline" className="text-[10px]">{a.severity}</Badge><Badge variant="outline" className="text-[10px]">{a.type}</Badge></div>
                    <p className="text-xs text-slate-700 mt-1">{a.description}</p>
                    <div className="grid sm:grid-cols-3 gap-2 mt-3">
                      <div className="p-2 rounded-lg bg-slate-50"><p className="text-[10px] text-slate-500">Impact</p><p className="text-xs font-medium">{a.impact}</p></div>
                      <div className="p-2 rounded-lg bg-blue-50"><p className="text-[10px] text-blue-600">Expected</p><p className="text-xs font-medium">{typeof a.expected === 'number' ? (a.expected > 1000 ? `Rs.${Math.round(a.expected).toLocaleString()}` : a.expected) : a.expected}</p></div>
                      <div className="p-2 rounded-lg bg-emerald-50"><p className="text-[10px] text-emerald-600">Fix</p><p className="text-xs font-medium">{a.action}</p></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {superIntelligence.anomalies.length === 0 && (
            <Card className="border-emerald-200 bg-emerald-50"><CardContent className="p-8 text-center"><ShieldCheck className="w-12 h-12 mx-auto text-emerald-600" /><p className="font-bold mt-3">All Clear! No Anomalies</p><p className="text-xs text-slate-600 mt-1">Your business is running smoothly. AI will alert you if anything unusual happens.</p></CardContent></Card>
          )}
        </div>
      )}
    </div>
  )
}
