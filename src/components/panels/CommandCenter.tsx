'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useFetch, asArray } from '@/lib/api'
import { universalSearch, generateContextActions, processVoiceCommand, KEYBOARD_SHORTCUTS, type SearchResult } from '@/lib/pro-command-engine'
import { Search, Command, Mic, MicOff, Keyboard, Zap, Package, FileText, Users, Wrench, Clock, ArrowRight, Brain, Crown, Bot, History, X, AlertTriangle, Building2, FileCheck2 } from 'lucide-react'

const RECENT_KEY = 'smartcomp_command_recent'
const MAX_RECENT = 6

function loadRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string').slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

/** Per-result icon + tint. Classes are static so Tailwind emits them. */
const RESULT_STYLES: Record<SearchResult['type'], { icon: typeof FileText; chip: string }> = {
  invoice: { icon: FileText, chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  customer: { icon: Users, chip: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300' },
  item: { icon: Package, chip: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  job: { icon: Wrench, chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  quotation: { icon: FileCheck2, chip: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300' },
  supplier: { icon: Building2, chip: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  payment: { icon: FileText, chip: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
}

export function CommandCenterPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const invoicesRes = useFetch<any>('/api/invoices?limit=200', undefined)
  const itemsRes = useFetch<any>('/api/items', undefined)
  const customersRes = useFetch<any>('/api/customers', undefined)
  const jobsRes = useFetch<any>('/api/jobs', undefined)
  // Matches the URL the dashboard prefetches, so opening this panel reuses that
  // cached response instead of firing a second Apps Script read for limit=100.
  const quotationsRes = useFetch<any>('/api/quotations?limit=200', undefined)
  const suppliersRes = useFetch<any>('/api/suppliers', undefined)
  const dashboardRes = useFetch<any>('/api/dashboard', undefined)

  const [query, setQuery] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [voiceResult, setVoiceResult] = useState<string>('')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  // Holds the active SpeechRecognition instance so we can stop/abort it on unmount.
  const recognitionRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setRecent(loadRecent()), [])

  // Every list endpoint goes through asArray(): `/api/customers` answers with a
  // `{ data, pagination }` envelope once a shop passes the default page size,
  // and treating that object as an array is what crashed this panel.
  const datasets = useMemo(() => ({
    invoices: asArray(invoicesRes.data),
    items: asArray(itemsRes.data),
    customers: asArray(customersRes.data),
    jobs: asArray(jobsRes.data),
    quotations: asArray(quotationsRes.data),
    suppliers: asArray(suppliersRes.data),
  }), [invoicesRes.data, itemsRes.data, customersRes.data, jobsRes.data, quotationsRes.data, suppliersRes.data])

  const failed = useMemo(() => (
    [
      ['Invoices', invoicesRes.error],
      ['Stock', itemsRes.error],
      ['Customers', customersRes.error],
      ['Service jobs', jobsRes.error],
      ['Quotations', quotationsRes.error],
      ['Suppliers', suppliersRes.error],
    ] as const
  ).filter(([, err]) => !!err).map(([label]) => label), [
    invoicesRes.error, itemsRes.error, customersRes.error,
    jobsRes.error, quotationsRes.error, suppliersRes.error,
  ])

  const indexedCount = useMemo(
    () => Object.values(datasets).reduce((sum, list) => sum + list.length, 0),
    [datasets]
  )

  const searchResults = useMemo(() => {
    if (!query.trim()) return []
    return universalSearch(query, datasets)
  }, [query, datasets])

  const contextActions = useMemo(() => generateContextActions({
    invoices: datasets.invoices,
    items: datasets.items,
    jobs: datasets.jobs,
    dashboard: dashboardRes.data || undefined,
  }), [datasets, dashboardRes.data])

  useEffect(() => setCursor(0), [query])

  const rememberSearch = useCallback((term: string) => {
    const trimmed = term.trim()
    if (trimmed.length < 2) return
    setRecent(prev => {
      const next = [trimmed, ...prev.filter(s => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  const openResult = useCallback((result: SearchResult) => {
    rememberSearch(query)
    onNavigate?.(result.tab)
  }, [onNavigate, query, rememberSearch])

  // ⌘K / Ctrl+K focuses the search box, Esc clears it. Bound on the panel's
  // lifetime rather than globally so it can't fight other panels' handlers.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setQuery('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Stop the active recognition instance when the panel unmounts — otherwise
  // the mic stays on and onresult callbacks setState on an unmounted component.
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort?.()
      } catch {}
      recognitionRef.current = null
    }
  }, [])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchResults.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => (c + 1) % searchResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => (c - 1 + searchResults.length) % searchResults.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = searchResults[cursor] || searchResults[0]
      if (target) openResult(target)
    }
  }

  const handleVoiceToggle = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setVoiceResult('')
      alert('Voice recognition not supported in this browser. Use Chrome/Edge.')
      return
    }
    if (isListening) {
      // User explicitly stopped — abort the active recognition instance.
      try { recognitionRef.current?.abort?.() } catch {}
      recognitionRef.current = null
      setIsListening(false)
      return
    }
    // @ts-expect-error — SpeechRecognition is a non-standard browser API.
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-IN'
    recognition.interimResults = false
    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setVoiceResult(transcript)
      setQuery(transcript)
      const cmd = processVoiceCommand(transcript)
      if (cmd.intent === 'navigate' && onNavigate && cmd.params.tab) {
        rememberSearch(transcript)
        onNavigate(cmd.params.tab)
      }
    }
    // Wrap start() in try/catch — "already started" and "permission denied"
    // throw synchronously, which would otherwise bubble up as an uncaught error.
    try {
      recognition.start()
      recognitionRef.current = recognition
    } catch (e) {
      console.warn('SpeechRecognition.start() failed:', e)
      setIsListening(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header — intentionally dark in both themes */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 p-5 sm:p-6 text-white border border-slate-700 dark:border-slate-800">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`, backgroundSize: '24px 24px' }} />
        </div>
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Command className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-white">Command Center <Badge className="bg-white text-slate-900 text-[10px]">⌘K PRO</Badge></h1>
            <p className="text-slate-300 text-xs sm:text-sm">Spotlight search • Voice commands • Quick actions • Natural language</p>
          </div>
          <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white" onClick={() => setShowShortcuts(!showShortcuts)}>
            <Keyboard className="w-4 h-4 mr-1" /> Shortcuts
          </Button>
        </div>
      </div>

      {failed.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <p className="font-semibold text-amber-900 dark:text-amber-200">Some data could not be loaded</p>
            <p className="text-amber-800 dark:text-amber-300/90 mt-0.5">
              {failed.join(', ')} — search still works across everything else. Check your Google Sheets connection in Settings.
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <Card className="overflow-hidden py-0 gap-0">
        <div className="h-1 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600" />
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              <Input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onBlur={() => rememberSearch(query)}
                placeholder="Search anything… invoices, customers, stock, jobs — e.g. 'HP laptop', 'Rahul', 'INV-123'"
                className="pl-12 pr-24 h-14 text-[15px] rounded-xl"
                autoFocus
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(''); inputRef.current?.focus() }}
                    aria-label="Clear search"
                    className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <Badge variant="outline" className="text-[10px] hidden sm:flex"><Command className="w-3 h-3 mr-1" />K</Badge>
              </div>
            </div>
            <Button
              variant={isListening ? 'destructive' : 'outline'}
              className="h-14 w-14 rounded-xl"
              onClick={handleVoiceToggle}
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            >
              {isListening ? <MicOff className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
            </Button>
          </div>

          {voiceResult && (
            <div className="mt-3 p-3 rounded-xl bg-violet-50 border border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/30 flex items-center gap-2">
              <Bot className="w-4 h-4 text-violet-600 dark:text-violet-300 flex-shrink-0" />
              <span className="text-xs font-medium">Voice heard: &ldquo;{voiceResult}&rdquo;</span>
              <Badge className="bg-violet-600 text-white text-[10px] ml-auto">{processVoiceCommand(voiceResult).intent}</Badge>
            </div>
          )}

          {query && searchResults.length > 0 && (
            <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
                {searchResults.length} results for &ldquo;{query}&rdquo; · ↑↓ to move, Enter to open
              </p>
              {searchResults.map((result, i) => {
                const style = RESULT_STYLES[result.type] ?? RESULT_STYLES.item
                const Icon = style.icon
                return (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => openResult(result)}
                    onMouseEnter={() => setCursor(i)}
                    className={`group w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      i === cursor
                        ? 'border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10'
                        : 'border-border bg-card hover:bg-accent'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${style.chip}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{result.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{result.subtitle}</p>
                      <p className="text-[10px] text-muted-foreground/80 truncate">{result.meta}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className="text-[10px]">{result.type}</Badge>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-violet-500 transition-colors" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {query.trim().length === 1 && (
            <p className="mt-4 text-xs text-muted-foreground text-center py-4">Keep typing — search starts at 2 characters.</p>
          )}

          {query.trim().length > 1 && searchResults.length === 0 && (
            <div className="mt-6 text-center py-6">
              <Search className="w-8 h-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mt-2">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-muted-foreground/80 mt-1">
                {indexedCount === 0
                  ? 'Nothing is indexed yet — your data may still be loading.'
                  : `Searched ${indexedCount.toLocaleString()} records. Try different keywords or check spelling.`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" /> Smart Quick Actions • AI Suggested</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {contextActions.map((action, i) => (
              <button
                key={action.actionId + i}
                type="button"
                onClick={() => onNavigate?.(action.tab)}
                className="group w-full text-left flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-accent hover:border-violet-300 dark:hover:border-violet-500/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-muted group-hover:bg-violet-100 dark:group-hover:bg-violet-500/15 flex items-center justify-center flex-shrink-0 transition-colors">
                  <span className="text-[11px] font-bold text-muted-foreground group-hover:text-violet-600 dark:group-hover:text-violet-300">{action.priority}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{action.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{action.description}</p>
                </div>
                <span className="text-xs font-medium text-violet-600 dark:text-violet-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">Do it →</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-0 bg-gradient-to-br from-violet-600 to-indigo-700 text-white overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3"><Brain className="w-5 h-5" /><p className="font-bold text-sm text-white">AI Business Copilot</p></div>
              <p className="text-xs text-violet-100">Ask anything in plain English/Hindi mix. I understand your business data deeply.</p>
              <div className="mt-3 space-y-1.5">
                {['sales this month', 'low stock', 'top customers', 'pending jobs'].map(ex => (
                  <button key={ex} onClick={() => { setQuery(ex); inputRef.current?.focus() }} className="block w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-colors">&ldquo;{ex}&rdquo; →</button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-2"><History className="w-4 h-4" /> Recent Searches</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {recent.length === 0 ? (
                <p className="text-[11px] text-muted-foreground py-2">Your searches will show up here.</p>
              ) : (
                recent.map((s, i) => (
                  <button key={`${s}-${i}`} onClick={() => { setQuery(s); inputRef.current?.focus() }} className="flex items-center gap-2 w-full text-left p-2 rounded-lg hover:bg-accent text-xs transition-colors">
                    <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" /> <span className="truncate">{s}</span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showShortcuts && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Keyboard className="w-4 h-4" /> Keyboard Shortcuts</CardTitle></CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {KEYBOARD_SHORTCUTS.map((s, i) => (
                <div key={i} className="flex justify-between items-center gap-2 p-2.5 rounded-lg bg-muted/50 border border-border">
                  <span className="text-xs text-muted-foreground">{s.description}</span>
                  <Badge variant="outline" className="text-[10px] font-mono bg-card flex-shrink-0">{s.key}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Capability summary */}
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0"><Crown className="w-5 h-5 text-white" /></div>
            <div>
              <p className="font-bold text-sm">PRO Power Features Enabled</p>
              <p className="text-xs text-muted-foreground mt-1">
                ✓ Universal search across 6 modules ({indexedCount.toLocaleString()} records indexed) • ✓ Voice commands (Hindi+English) • ✓ Context-aware quick actions • ✓ Keyboard navigation
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge className="bg-amber-500 text-white text-[10px]">Zero API Cost</Badge>
                <Badge variant="outline" className="text-[10px]">Offline First</Badge>
                <Badge variant="outline" className="text-[10px]">Fully Private</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
