'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { AUTOMATION_TEMPLATES, getAutomationEngine, type AutomationRule, type AutomationLog } from '@/lib/automation-engine'
import { Bot, Zap, Play, Plus, Settings, Clock, CheckCircle, AlertCircle, BarChart3, Sparkles, Brain, Workflow, Timer, Target, Activity, Package, Wallet, Users, Wrench, Megaphone, FileText, Heart, Cake, ShieldCheck, TrendingUp, Bell, Crown, Loader2, Search } from 'lucide-react'

const iconMap: Record<string, any> = {
  HandHeart: Heart,
  Package: Package,
  Bot: Bot,
  Clock: Clock,
  CheckCircle: CheckCircle,
  AlertTriangle: AlertCircle,
  Heart: Heart,
  BarChart3: BarChart3,
  Brain: Brain,
  Receipt: FileText,
  Cake: Cake,
  FileText: FileText,
  Wrench: Wrench,
  Wallet: Wallet,
}

/** Static class pairs so Tailwind's JIT emits them — dynamic `bg-${x}-100` is never detected. */
const RULE_TINTS: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/25',
  green: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300 border-green-200 dark:border-green-500/25',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300 border-orange-200 dark:border-orange-500/25',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 border-blue-200 dark:border-blue-500/25',
  red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300 border-red-200 dark:border-red-500/25',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200 dark:border-amber-500/25',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300 border-pink-200 dark:border-pink-500/25',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 border-violet-200 dark:border-violet-500/25',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/25',
  cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/25',
}

const CATEGORY_TINTS: Record<string, string> = {
  sales: RULE_TINTS.blue,
  stock: RULE_TINTS.orange,
  customer: RULE_TINTS.pink,
  service: RULE_TINTS.cyan,
  finance: RULE_TINTS.emerald,
  marketing: RULE_TINTS.violet,
}

const CATEGORY_ROWS = [
  { cat: 'sales', label: 'Sales Automation', icon: TrendingUp, tint: RULE_TINTS.blue },
  { cat: 'stock', label: 'Stock Management', icon: Package, tint: RULE_TINTS.orange },
  { cat: 'customer', label: 'Customer Engagement', icon: Users, tint: RULE_TINTS.pink },
  { cat: 'service', label: 'Service Operations', icon: Wrench, tint: RULE_TINTS.cyan },
  { cat: 'finance', label: 'Finance & Collections', icon: Wallet, tint: RULE_TINTS.emerald },
  { cat: 'marketing', label: 'Marketing & Winback', icon: Megaphone, tint: RULE_TINTS.violet },
]

const neutralTint = 'bg-muted text-muted-foreground border-border'

export function AutomationHubPanel() {
  const [rules, setRules] = useState<AutomationRule[]>(AUTOMATION_TEMPLATES)
  const [logs, setLogs] = useState<AutomationLog[]>([])
  const [activeTab, setActiveTab] = useState<'rules' | 'logs' | 'stats' | 'builder'>('rules')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [runningId, setRunningId] = useState<string | null>(null)

  useEffect(() => {
    const engine = getAutomationEngine()
    setRules([...engine.getRules()])
    setLogs(engine.getLogs(50))
  }, [])

  const engine = getAutomationEngine()

  // Derived from `rules` rather than the engine so the numbers re-render the
  // moment a workflow is toggled — engine.getStats() is not reactive.
  const stats = useMemo(() => {
    const enabled = rules.filter(r => r.enabled).length
    const totalRuns = rules.reduce((s, r) => s + (r.stats?.totalRuns || 0), 0)
    const avgSuccess = rules.length > 0
      ? rules.reduce((s, r) => s + (r.stats?.successRate ?? 100), 0) / rules.length
      : 0
    const within24h = (ts: string) => (Date.now() - new Date(ts).getTime()) / 3_600_000 <= 24
    return {
      totalRules: rules.length,
      enabledRules: enabled,
      totalRuns,
      avgSuccessRate: Math.round(avgSuccess),
      runsLast24h: logs.filter(l => within24h(l.timestamp)).length,
      successLast24h: logs.filter(l => l.status === 'success' && within24h(l.timestamp)).length,
    }
  }, [rules, logs])

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rules.filter(r => {
      const matchesSearch = !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
      const matchesCat = categoryFilter === 'all' || r.category === categoryFilter
      return matchesSearch && matchesCat
    })
  }, [rules, search, categoryFilter])

  const toggleRule = useCallback((id: string) => {
    const rule = engine.getRules().find(r => r.id === id)
    if (!rule) return
    if (rule.enabled) engine.disableRule(id)
    else engine.enableRule(id)
    setRules([...engine.getRules()])
  }, [engine])

  const setAll = useCallback((enabled: boolean) => {
    engine.getRules().forEach(r => (enabled ? engine.enableRule(r.id) : engine.disableRule(r.id)))
    setRules([...engine.getRules()])
  }, [engine])

  const runRuleNow = useCallback(async (id: string) => {
    setRunningId(id)
    try {
      await engine.executeRule(id, { manual: true, triggeredBy: 'user', timestamp: new Date().toISOString() })
      // executeRule already pushed the log into the engine — re-reading is
      // enough. Prepending the returned log as well duplicated every entry.
      setLogs(engine.getLogs(50))
      setRules([...engine.getRules()])
    } catch (e) {
      console.error('[AutomationHub] run failed', e)
    } finally {
      setRunningId(null)
    }
  }, [engine])

  const categories = useMemo(() => ([
    { id: 'all', label: 'All', count: rules.length },
    { id: 'sales', label: 'Sales', count: rules.filter(r => r.category === 'sales').length },
    { id: 'stock', label: 'Stock', count: rules.filter(r => r.category === 'stock').length },
    { id: 'customer', label: 'Customer', count: rules.filter(r => r.category === 'customer').length },
    { id: 'service', label: 'Service', count: rules.filter(r => r.category === 'service').length },
    { id: 'finance', label: 'Finance', count: rules.filter(r => r.category === 'finance').length },
    { id: 'marketing', label: 'Marketing', count: rules.filter(r => r.category === 'marketing').length },
  ]), [rules])

  return (
    <div className="space-y-4 sm:space-y-6 pb-10">
      {/* Header — intentionally dark in both themes */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 p-5 sm:p-7 text-white">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:28px_28px]" />
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-violet-500/15 rounded-full blur-2xl" />

        <div className="relative flex flex-col lg:flex-row justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <Workflow className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 text-white">Automation Hub <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 border-0 text-[10px] font-bold">PRO</Badge></h1>
                <p className="text-slate-300 text-xs sm:text-sm mt-1">No-code workflows • Save 10+ hours/week • Auto-pilot your shop</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline" className="bg-white/10 text-slate-200 border-white/10 text-[10px]"><Bot className="w-3 h-3 mr-1" /> {AUTOMATION_TEMPLATES.length} Pre-built Templates</Badge>
              <Badge variant="outline" className="bg-white/10 text-slate-200 border-white/10 text-[10px]"><Zap className="w-3 h-3 mr-1" /> Instant Triggers</Badge>
              <Badge variant="outline" className="bg-white/10 text-slate-200 border-white/10 text-[10px]"><ShieldCheck className="w-3 h-3 mr-1" /> No Coding Needed</Badge>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:gap-3">
            <div className="rounded-xl bg-white/10 backdrop-blur border border-white/10 p-3 text-center">
              <p className="text-[10px] text-slate-300 uppercase">Active</p>
              <p className="text-xl font-bold text-white">{stats.enabledRules}</p>
              <p className="text-[10px] text-emerald-300">{stats.totalRules} total</p>
            </div>
            <div className="rounded-xl bg-white/10 backdrop-blur border border-white/10 p-3 text-center">
              <p className="text-[10px] text-slate-300 uppercase">Runs</p>
              <p className="text-xl font-bold text-white">{stats.totalRuns}</p>
              <p className="text-[10px] text-blue-300">{stats.runsLast24h} today</p>
            </div>
            <div className="rounded-xl bg-white/10 backdrop-blur border border-white/10 p-3 text-center">
              <p className="text-[10px] text-slate-300 uppercase">Success</p>
              <p className="text-xl font-bold text-white">{stats.avgSuccessRate}%</p>
              <p className="text-[10px] text-violet-300">avg rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit max-w-full overflow-x-auto scrollbar-hide">
        {[
          { id: 'rules', label: 'Workflows', icon: Workflow },
          { id: 'logs', label: 'Activity Log', icon: Activity },
          { id: 'stats', label: 'Analytics', icon: BarChart3 },
          { id: 'builder', label: 'Builder', icon: Plus },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            aria-pressed={activeTab === t.id}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === t.id
                ? 'bg-card shadow-sm text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'rules' && (
        <div className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search workflows… e.g. low stock, payment, welcome" className="h-10 pl-9" />
                </div>
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors ${
                        categoryFilter === cat.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {cat.label} ({cat.count})
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border">
                <span className="text-[11px] text-muted-foreground mr-auto">
                  Showing {filteredRules.length} of {rules.length} workflows
                </span>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAll(true)}>Enable all</Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAll(false)}>Pause all</Button>
              </div>
            </CardContent>
          </Card>

          {/* Rules grid */}
          <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
            {filteredRules.map(rule => {
              const Icon = iconMap[rule.icon] || Bot
              const isEnabled = rule.enabled
              const isRunning = runningId === rule.id
              const actionCount = rule.actions?.length ?? 0
              return (
                <Card key={rule.id} className={`transition-shadow hover:shadow-md ${isEnabled ? '' : 'opacity-70'}`}>
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${isEnabled ? (RULE_TINTS[rule.color] ?? neutralTint) : neutralTint}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm flex flex-wrap items-center gap-2">
                              {rule.name}
                              {rule.isTemplate && <Badge variant="outline" className={`text-[9px] ${RULE_TINTS.amber}`}><Crown className="w-2.5 h-2.5 mr-0.5" /> TEMPLATE</Badge>}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{rule.description}</p>
                          </div>
                          <Switch checked={isEnabled} onCheckedChange={() => toggleRule(rule.id)} aria-label={`${isEnabled ? 'Pause' : 'Enable'} ${rule.name}`} />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-3">
                          <Badge variant="outline" className={`text-[10px] border ${CATEGORY_TINTS[rule.category] ?? neutralTint}`}>{rule.category}</Badge>
                          <Badge variant="outline" className="text-[10px]"><Timer className="w-3 h-3 mr-1" />{(rule.trigger?.type ?? 'manual').replace(/_/g, ' ')}</Badge>
                          <Badge variant="outline" className="text-[10px]"><Zap className="w-3 h-3 mr-1" />{actionCount} action{actionCount === 1 ? '' : 's'}</Badge>
                          <Badge variant="outline" className="text-[10px]">{rule.stats?.totalRuns ?? 0} runs • {rule.stats?.successRate ?? 100}% success</Badge>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-3">
                          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={isRunning} onClick={() => runRuleNow(rule.id)}>
                            {isRunning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                            {isRunning ? 'Running…' : 'Run Now'}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 text-xs" disabled title="Per-workflow configuration ships with the Builder">
                            <Settings className="w-3 h-3 mr-1" /> Configure
                          </Button>
                          {isEnabled
                            ? <Badge variant="outline" className={`ml-auto text-[10px] ${RULE_TINTS.emerald}`}>ACTIVE • Auto</Badge>
                            : <Badge variant="outline" className="ml-auto text-[10px]">Paused</Badge>}
                        </div>

                        {rule.stats?.lastRun && (
                          <p className="text-[10px] text-muted-foreground mt-2">Last run {new Date(rule.stats.lastRun).toLocaleString('en-IN')}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {filteredRules.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Bot className="w-10 h-10 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mt-2">No workflows match your filter</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => { setSearch(''); setCategoryFilter('all') }}>Clear filters</Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-300" /> Automation Activity Log • Last 50 Runs</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="text-center py-10">
                <Timer className="w-10 h-10 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mt-2">No activity yet. Enable workflows to see logs here.</p>
                <p className="text-xs text-muted-foreground/80 mt-1">Logs appear when automations trigger automatically or you Run Now</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin">
                {logs.map(log => {
                  const tint = log.status === 'success' ? RULE_TINTS.emerald
                    : log.status === 'failed' ? RULE_TINTS.red
                    : log.status === 'skipped' ? RULE_TINTS.amber
                    : neutralTint
                  return (
                    <div key={log.id} className={`p-3 rounded-xl border flex gap-3 ${tint}`}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-card/60">
                        {log.status === 'success' ? <CheckCircle className="w-4 h-4" /> : log.status === 'failed' ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-xs text-foreground">{log.ruleName}</p>
                          <Badge variant="outline" className="text-[10px]">{String(log.trigger).replace(/_/g, ' ')}</Badge>
                          <Badge variant="outline" className="text-[10px] uppercase">{log.status}</Badge>
                          <span className="text-[10px] text-muted-foreground ml-auto">{new Date(log.timestamp).toLocaleString('en-IN')}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{log.message} • {log.executionTimeMs}ms</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'stats' && (
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Automation Impact</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className={`p-3 rounded-xl border ${RULE_TINTS.violet}`}>
                <p className="text-[11px] uppercase">Time Saved (Est)</p>
                <p className="text-2xl font-bold">{stats.totalRuns * 3} min</p>
                <p className="text-[11px] opacity-80">Based on {stats.totalRuns} automated runs × 3 min avg manual</p>
              </div>
              <div className={`p-3 rounded-xl border ${RULE_TINTS.emerald}`}>
                <p className="text-[11px] uppercase">Success Rate</p>
                <p className="text-2xl font-bold">{stats.avgSuccessRate}%</p>
                <p className="text-[11px] opacity-80">{stats.successLast24h}/{stats.runsLast24h} successful last 24h</p>
              </div>
              <div className={`p-3 rounded-xl border ${RULE_TINTS.blue}`}>
                <p className="text-[11px] uppercase">Active Workflows</p>
                <p className="text-2xl font-bold">{stats.enabledRules}/{stats.totalRules}</p>
                <p className="text-[11px] opacity-80">Enable more to save more time</p>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-sm">Category Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {CATEGORY_ROWS.map(item => {
                  const count = rules.filter(r => r.category === item.cat).length
                  const enabled = rules.filter(r => r.category === item.cat && r.enabled).length
                  const pct = count > 0 ? (enabled / count) * 100 : 0
                  return (
                    <button
                      key={item.cat}
                      type="button"
                      onClick={() => { setCategoryFilter(item.cat); setActiveTab('rules') }}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent w-full text-left transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0 ${item.tint}`}><item.icon className="w-4 h-4" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                          <p className="text-xs font-medium truncate">{item.label}</p>
                          <p className="text-[11px] text-muted-foreground flex-shrink-0">{enabled}/{count} active</p>
                        </div>
                        <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-[width] duration-300" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'builder' && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Plus className="w-8 h-8 text-white" />
            </div>
            <h3 className="font-bold text-lg mt-4">Custom Workflow Builder (PRO)</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">Drag &amp; drop triggers, conditions, and actions to build your own automation. Not shipped yet — the {AUTOMATION_TEMPLATES.length} templates cover most shop workflows in the meantime.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 max-w-2xl mx-auto text-left">
              <div className="p-3 rounded-xl bg-muted/50 border border-border"><p className="text-xs font-bold flex items-center gap-1"><Bell className="w-3 h-3" /> Triggers (10+)</p><p className="text-[11px] text-muted-foreground mt-1">Invoice created, low stock, payment overdue, job completed, customer inactive, custom schedule…</p></div>
              <div className="p-3 rounded-xl bg-muted/50 border border-border"><p className="text-xs font-bold flex items-center gap-1"><Target className="w-3 h-3" /> Conditions</p><p className="text-[11px] text-muted-foreground mt-1">If amount {'>'} 5000, if customer VIP, if stock {'<'} min, days since etc…</p></div>
              <div className="p-3 rounded-xl bg-muted/50 border border-border"><p className="text-xs font-bold flex items-center gap-1"><Zap className="w-3 h-3" /> Actions (12+)</p><p className="text-[11px] text-muted-foreground mt-1">Send WhatsApp, email, create task, reorder, notify, webhook, generate report…</p></div>
            </div>
            <Button className="mt-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90"><Sparkles className="w-4 h-4 mr-2" /> Request Early Access</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
