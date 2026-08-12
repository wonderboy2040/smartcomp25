'use client'

import { useState, useEffect, useMemo } from 'react'
import { useFetch, apiPost, apiPut, invalidate } from '@/lib/api'
import { safeJsonParse } from '@/lib/utils'
import { buildEnquiryMessage, generateWhatsAppLink } from '@/lib/whatsapp'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/calc'
import { MessageSquare, Send, Users, Package, RefreshCw, MessageCircle, Check, Calendar, Bot, Upload, TrendingUp, Award, ArrowDownRight, Brain, AlertTriangle } from 'lucide-react'

export function WhatsAppPanel() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'enquiries' | 'comparison' | 'recommend' | 'intelligence' | 'send'>('enquiries')
  const [search] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [responseDialog, setResponseDialog] = useState<any | null>(null)
  const [responseText, setResponseText] = useState('')
  const [parsedRates, setParsedRates] = useState<any[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [importContent, setImportContent] = useState('')
  const [importPreview, setImportPreview] = useState<any | null>(null)
  const [importing, setImporting] = useState(false)
  const [linksDialog, setLinksDialog] = useState<{ suppliers: any[]; message: string } | null>(null)
  const [sentTracker, setSentTracker] = useState<Set<string>>(new Set())

  const { data: enquiries, loading, refetch } = useFetch<any[]>('/api/enquiries?limit=200', undefined)
  const { data: rateComparison, loading: comparisonLoading } = useFetch<any>(
    tab === 'comparison' ? '/api/whatsapp/rates?days=90' : null,
    undefined
  )
  const { data: recommendations, loading: recLoading } = useFetch<any>(
    tab === 'recommend' ? '/api/whatsapp/recommend?strategy=cheapest' : null,
    undefined
  )
  // Always fetch suppliers/items — localStorage cache makes this instant on repeat visits
  const { data: suppliers } = useFetch<any[]>('/api/suppliers?active=true', undefined)
  const { data: items } = useFetch<any[]>('/api/items', undefined)
  const { data: shop } = useFetch<any>('/api/shop', undefined)
  const { data: waStatus } = useFetch<any>('/api/whatsapp/status', undefined)
  const cloudApiOn = !!waStatus?.configured

  // Auto-refresh every 30s when on the enquiries tab AND the page is visible,
  // so incoming webhook replies show up live. Paused when tab is hidden to
  // save battery and avoid hammering Apps Script in the background.
  useEffect(() => {
    if (tab !== 'enquiries') return
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        invalidate('/api/enquiries')
      }, 30000) // 30s — was 15s, doubled to halve background load
    }
    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [tab])

  const filteredEnquiries = useMemo(() => {
    return (enquiries || []).filter((e) => {
      if (!search) return true
      const q = search.toLowerCase()
      const supplierName = String(e?.supplier?.name || e?.supplierName || '').toLowerCase()
      const status = String(e?.status || '').toLowerCase()
      const supplierPhone = String(e?.supplier?.phone || e?.supplierPhone || '').toLowerCase()
      return supplierName.includes(q) || status.includes(q) || supplierPhone.includes(q)
    })
  }, [enquiries, search])

  const handleSendEnquiry = async (payload: {
    supplierIds: string[]
    itemIds: string[]
    allItems: boolean
  }) => {
    try {
      const allSuppliers = suppliers || []
      const allItems = items || []
      const shopName = String(shop?.name || 'Smart Computers')

      // Determine selected items
      let selectedItems: any[] = []
      if (payload.allItems) {
        selectedItems = allItems
      } else {
        selectedItems = allItems.filter((i) => payload.itemIds.includes(i.id))
      }
      if (selectedItems.length === 0) {
        toast({ title: 'No items selected', variant: 'destructive' })
        return
      }

      // Determine selected suppliers
      const selectedSuppliers = allSuppliers.filter((s) => payload.supplierIds.includes(s.id))
      if (selectedSuppliers.length === 0) {
        toast({ title: 'No suppliers selected', variant: 'destructive' })
        return
      }

      // Build the message ONCE (same for all suppliers)
      const message = buildEnquiryMessage(shopName, selectedItems.map((i) => ({ name: String(i?.name || ''), sku: String(i?.sku || '') })))

      if (cloudApiOn) {
        // Cloud API mode: server sends automatically. Wait for response.
        const res = await apiPost('/api/enquiries', {
          supplierIds: payload.supplierIds,
          itemIds: payload.itemIds,
          allItems: payload.allItems,
        })
        const sent = res.results.filter((r: any) => r.sendStatus === 'sent').length
        const failed = res.results.filter((r: any) => r.sendStatus === 'failed').length
        toast({
          title: `${sent} enquiry message(s) sent automatically`,
          description: failed > 0 ? `${failed} failed — check supplier phone numbers` : 'Replies will appear here automatically',
          variant: failed > 0 ? 'destructive' : 'default',
        })
        setDialogOpen(false)
        refetch()
      } else {
        // wa.me mode: generate links CLIENT-SIDE instantly and show a dialog
        // with all supplier links as buttons. This fixes:
        //   1. Popup blocking (browser blocks multiple window.open in a loop)
        //   2. Slow loading (no need to wait for Apps Script POST before opening links)
        //   3. "Only 1 supplier gets message" bug
        const linksForSuppliers = selectedSuppliers.map((s) => {
          const phone = String(s.whatsappNumber || s.phone || '')
          const link = generateWhatsAppLink(phone, message)
          return {
            id: String(s.id || ''),
            name: String(s.name || 'Unknown'),
            phone,
            link,
          }
        })

        setSentTracker(new Set())
        setLinksDialog({ suppliers: linksForSuppliers, message })
        setDialogOpen(false)

        // Fire-and-forget: create enquiry records in the background
        // so the Enquiries tab shows them. We don't wait for this.
        apiPost('/api/enquiries', {
          supplierIds: payload.supplierIds,
          itemIds: payload.itemIds,
          allItems: payload.allItems,
        }).then(() => {
          refetch()
        }).catch(() => {
          // non-fatal — links still work even if records fail to save
        })
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  const handleOpenResponse = (enquiry: any) => {
    setResponseDialog(enquiry)
    setResponseText(enquiry.response || '')
    setParsedRates(safeJsonParse<any[]>(enquiry.ratesJson, []))
  }

  const [parsing, setParsing] = useState(false)
  const handleParseResponse = async () => {
    setParsing(true)
    try {
      const items = safeJsonParse<any[]>(responseDialog.itemsJson, [])
      const res = await apiPost('/api/whatsapp/parse', {
        response: responseText,
        items,
      })
      setParsedRates(res.parsed)
      toast({ title: `${res.parsed.length} rates detected`, duration: 2500 })
    } catch (e: any) {
      toast({ title: 'Parse error', description: e.message, variant: 'destructive' })
    } finally {
      setParsing(false)
    }
  }

  const handleSaveResponse = async () => {
    try {
      const res = await apiPut(`/api/enquiries/${responseDialog.id}`, {
        action: 'respond',
        response: responseText,
      })
      const rates = res.parsedRates || []
      toast({ title: 'Response saved', description: `${rates.length} rates detected` })
      setParsedRates(rates)
      // Invalidate enquiries cache so the list refreshes with updated ratesJson
      invalidate('/api/enquiries')
      refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  const handleApplyRates = async () => {
    if (!confirm('Apply these rates to your dashboard items? This will update cost prices and GST settings.')) return
    try {
      const res = await apiPut(`/api/enquiries/${responseDialog.id}`, { action: 'applyRates' })
      toast({ title: 'Rates applied ✓', description: `${res.appliedCount} items updated — cost prices refreshed` })
      setResponseDialog(null)
      // Invalidate items cache so Stock panel shows updated cost prices instantly
      invalidate('/api/items')
      // Also invalidate dashboard for profit recalculation
      invalidate('/api/dashboard')
      refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '')
      setImportContent(text)
      // Show a small preview of what was loaded
      setImportPreview({
        fileName: file.name,
        size: file.size,
        lineCount: text.split('\n').length,
        preview: text.slice(0, 300),
      })
    }
    reader.readAsText(file)
  }

  const handleImportSubmit = async () => {
    if (!importContent.trim()) {
      toast({ title: 'Select a chat export file first', variant: 'destructive' })
      return
    }
    setImporting(true)
    try {
      const res = await apiPost('/api/whatsapp/import-chat', { content: importContent })
      if (res.success) {
        toast({
          title: res.action === 'created' ? 'New enquiry created from chat' : 'Enquiry updated',
          description: `${res.parsed.parsedRates.length} rates detected · ${res.parsed.messageCount} messages imported${res.matchedEnquiry ? ` · matched: ${res.matchedEnquiry.supplierName}` : ''}`,
        })
        setImportOpen(false)
        setImportContent('')
        setImportPreview(null)
        refetch()
      } else {
        toast({ title: 'Import failed', description: res.error, variant: 'destructive' })
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  const sentCount = useMemo(() => (enquiries || []).filter((e) => e.status === 'sent').length, [enquiries])
  const respondedCount = useMemo(() => (enquiries || []).filter((e) => e.status === 'responded').length, [enquiries])
  const updatedCount = useMemo(() => (enquiries || []).filter((e) => e.status === 'rate_updated').length, [enquiries])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 flex-shrink-0" />
            <span className="truncate">WhatsApp Rate Enquiry</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Send bulk enquiries to suppliers and capture rate responses
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button onClick={() => setImportOpen(true)} variant="outline" className="h-11 border-green-200 text-green-700 hover:bg-green-50">
            <Upload className="w-4 h-4 mr-1.5" /> <span className="hidden sm:inline">Import Chat</span><span className="sm:hidden">Import</span>
          </Button>
          <Button onClick={() => setDialogOpen(true)} className="bg-green-600 hover:bg-green-700 h-11">
            <Send className="w-4 h-4 mr-1.5" /> <span className="hidden sm:inline">New Enquiry</span><span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {/* Advanced Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto scrollbar-thin">
        {[
          { id: 'enquiries', label: 'Enquiries', icon: MessageSquare },
          { id: 'comparison', label: 'Rate Comparison', icon: Users },
          { id: 'recommend', label: 'Best Suppliers', icon: TrendingUp },
          { id: 'intelligence', label: 'AI Intelligence', icon: Brain },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ===== ENQUIRIES TAB ===== */}
      {tab === 'enquiries' && (
        <>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-medium text-slate-600 uppercase">Total Sent</span>
              <Send className="w-4 h-4 text-blue-500 flex-shrink-0" />
            </div>
            <p className="text-lg sm:text-2xl font-bold">{enquiries?.length || 0}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-medium text-slate-600 uppercase">Awaiting Reply</span>
              <Calendar className="w-4 h-4 text-amber-500 flex-shrink-0" />
            </div>
            <p className="text-lg sm:text-2xl font-bold text-amber-600">{sentCount}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-medium text-slate-600 uppercase">Responded</span>
              <MessageCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
            </div>
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{respondedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-medium text-slate-600 uppercase">Rates Applied</span>
              <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            </div>
            <p className="text-lg sm:text-2xl font-bold text-emerald-600">{updatedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Cloud API status banner */}
      {waStatus && (
        <div className={`rounded-lg p-3 flex items-start gap-3 ${cloudApiOn ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          {cloudApiOn ? <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" /> : <Bot className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />}
          <div className="text-sm flex-1">
            <p className={`font-medium ${cloudApiOn ? 'text-emerald-900' : 'text-amber-900'}`}>
              {cloudApiOn ? 'WhatsApp Cloud API: Connected' : 'WhatsApp Cloud API: Not configured (manual mode)'}
            </p>
            <p className={`text-xs mt-0.5 ${cloudApiOn ? 'text-emerald-700' : 'text-amber-700'}`}>
              {cloudApiOn
                ? `Messages will auto-send from your business number (${waStatus.businessNumber}). Supplier replies will appear here automatically. Template: ${waStatus.templateName}`
                : 'Generate Messages will open wa.me tabs — you must manually hit Send in each. Configure WA_TOKEN / WA_PHONE_NUMBER_ID env vars for automatic sending + reply capture.'}
            </p>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-3">
        <Bot className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-blue-900">Auto Enquiry Schedule</p>
          <p className="text-blue-700 text-xs mt-0.5">
            Enquiries are scheduled on 1st and 15th of every month for active suppliers. Click "New Enquiry" to send manually anytime.
            When supplier replies, paste their response to auto-parse rates and apply to dashboard.
          </p>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <Card><CardContent className="text-center py-8 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
            Loading enquiries…
          </CardContent></Card>
        ) : filteredEnquiries.length === 0 ? (
          <Card><CardContent className="text-center py-8 text-slate-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-2 text-slate-300" />
            No enquiries yet. Tap "New" to begin.
          </CardContent></Card>
        ) : (
          filteredEnquiries.map((e) => {
            const items = safeJsonParse<any[]>(e.itemsJson, [])
            return (
              <Card key={e.id} className="border-slate-200">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <p className="font-medium text-slate-900 text-sm truncate">{e?.supplier?.name || e?.supplierName || 'Unknown'}</p>
                        {e.isAuto && (
                          <Bot className="w-3 h-3 text-violet-600 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500">{new Date(e.sentAt).toLocaleDateString('en-IN')} · {new Date(e.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <Badge variant="outline" className={
                      e.status === 'rate_updated' ? 'bg-green-50 text-green-700 border-green-200 text-[9px]'
                      : e.status === 'responded' ? 'bg-blue-50 text-blue-700 border-blue-200 text-[9px]'
                      : 'bg-amber-50 text-amber-700 border-amber-200 text-[9px]'
                    } flex-shrink-0>
                      {String(e.status || 'sent').replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-2">
                    <p className="text-[10px] text-slate-600 truncate">
                      {items.map((i: any) => i.name).join(', ')}
                    </p>
                    <Badge variant="outline" className="text-[9px] mt-0.5">{items.length} items</Badge>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleOpenResponse(e)} className="w-full mt-2 h-9">
                    {e.status === 'sent' ? 'Add Response' : 'View & Apply'}
                  </Button>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Desktop table */}
      <Card className="border-slate-200 hidden sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Sent Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Items Asked</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Responded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                      Loading enquiries…
                    </TableCell>
                  </TableRow>
                ) : filteredEnquiries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      No enquiries yet. Click "New Enquiry" to begin.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEnquiries.map((e) => {
                    const items = safeJsonParse<any[]>(e.itemsJson, [])
                    return (
                      <TableRow key={e.id} className="hover:bg-slate-50">
                        <TableCell className="text-sm">
                          {new Date(e.sentAt).toLocaleDateString('en-IN')}
                          <div className="text-[10px] text-slate-500">
                            {new Date(e.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          {e.isAuto && (
                            <Badge variant="outline" className="mt-1 text-[9px] bg-violet-50 text-violet-700 border-violet-200">
                              <Bot className="w-2.5 h-2.5 mr-0.5" /> Auto
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-900">{e?.supplier?.name || e?.supplierName || 'Unknown'}</div>
                          <div className="text-[10px] text-slate-500">{e?.supplier?.phone || e?.supplierPhone || ''}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-slate-600 max-w-xs truncate">
                            {items.map((i: any) => i.name).join(', ')}
                          </div>
                          <Badge variant="outline" className="text-[10px] mt-0.5">{items.length} items</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              e.status === 'rate_updated' ? 'bg-green-50 text-green-700 border-green-200 text-[10px]'
                              : e.status === 'responded' ? 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]'
                              : 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                            }
                          >
                            {String(e.status || 'sent').replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {e.respondedAt ? new Date(e.respondedAt).toLocaleDateString('en-IN') : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => handleOpenResponse(e)}>
                            {e.status === 'sent' ? 'Add Response' : 'View & Apply'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
        </>
      )}

      {/* ===== RATE COMPARISON TAB ===== */}
      {tab === 'comparison' && (
        <RateComparisonView data={rateComparison} loading={comparisonLoading} />
      )}

      {/* ===== BEST SUPPLIERS TAB ===== */}
      {tab === 'recommend' && (
        <BestSuppliersView data={recommendations} loading={recLoading} />
      )}

      {tab === 'intelligence' && (
        <IntelligenceView />
      )}

      {/* Send enquiry dialog - stable key to prevent remount/flicker */}
      <SendEnquiryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        suppliers={suppliers || []}
        items={items || []}
        onSend={handleSendEnquiry}
        cloudApiOn={cloudApiOn}
      />

      {/* Response dialog */}
      <Dialog open={!!responseDialog} onOpenChange={(v) => !v && setResponseDialog(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg truncate">Rate Response - {responseDialog?.supplier?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">Original Message Sent:</p>
              <p className="text-xs whitespace-pre-wrap font-mono">{responseDialog?.message}</p>
            </div>

            <div>
              <Label>Paste Supplier's Response Here</Label>
              <Textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Paste supplier's WhatsApp reply here. Supports formats:&#10;• Item @75+ (75 + 18% GST extra)&#10;• Item @88 nett (88 inclusive GST)&#10;• Item: Rs.1000&#10;• Item @NO (out of stock)&#10;• 1. Item Name: 3450+"
                rows={6}
                className="font-mono text-xs"
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={handleParseResponse} disabled={parsing || !responseText.trim()}>
                  {parsing ? <><RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> Parsing…</> : <><RefreshCw className="w-3.5 h-3.5 mr-1" /> Preview Parsed Rates</>}
                </Button>
                <Button size="sm" variant="outline" onClick={handleSaveResponse}>
                  Save Response
                </Button>
              </div>
            </div>

            {parsedRates.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-200">
                  <p className="text-sm font-medium text-emerald-800 flex items-center gap-2">
                    <Check className="w-4 h-4" /> {parsedRates.length} rates detected
                    <span className="text-[10px] text-emerald-600 ml-auto">
                      {parsedRates.filter((r: any) => (r.confidence || 0.5) >= 0.7).length} high confidence •
                      {' '}{parsedRates.filter((r: any) => r.notes?.includes('OUT OF STOCK') || r.rate === 0).length} OOS
                    </span>
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Name</TableHead>
                      <TableHead className="text-right">Rate (Rs.)</TableHead>
                      <TableHead className="text-center">GST Type</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-center">Conf.</TableHead>
                      <TableHead className="text-center">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRates.map((r, i) => {
                      const isOOS = r.notes?.includes('OUT OF STOCK') || r.rate === 0
                      const conf = r.confidence || 0.5
                      return (
                        <TableRow key={i} className={isOOS ? 'bg-red-50/50' : conf < 0.6 ? 'bg-amber-50/50' : ''}>
                          <TableCell className="text-sm font-medium">
                            {r.itemName}
                            {r.matchedItemSku && <span className="block text-[9px] text-slate-400">SKU: {r.matchedItemSku}</span>}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-slate-700">
                            {isOOS ? <span className="text-red-600">—</span> : formatCurrency(r.rate)}
                          </TableCell>
                          <TableCell className="text-center">
                            {isOOS ? (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">OOS</Badge>
                            ) : r.gstType === 'extra' ? (
                              <Badge className="bg-orange-50 text-orange-700 hover:bg-orange-50 text-[10px]">+ GST {r.gstRate || 18}%</Badge>
                            ) : r.gstType === 'inclusive' ? (
                              <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 text-[10px]">Nett (incl)</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">?</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold text-emerald-600">
                            {isOOS ? <span className="text-red-600">—</span> : formatCurrency(r.totalCost)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={
                              conf >= 0.8 ? 'bg-emerald-100 text-emerald-700 text-[10px]'
                              : conf >= 0.6 ? 'bg-amber-100 text-amber-700 text-[10px]'
                              : 'bg-red-100 text-red-700 text-[10px]'
                            }>
                              {(conf * 100).toFixed(0)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-[9px] text-slate-500 max-w-[150px] truncate" title={r.notes || r.raw}>
                            {r.notes || r.raw}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {parsedRates.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-900 mb-2">
                  Click below to apply these rates to your dashboard items. This will update cost prices and GST settings.
                </p>
                <Button onClick={handleApplyRates} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
                  <Check className="w-4 h-4 mr-1" /> Apply Rates to Dashboard
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setResponseDialog(null)} className="w-full sm:w-auto">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Chat Dialog */}
      <Dialog open={importOpen} onOpenChange={(v) => !v && (setImportOpen(false), setImportContent(''), setImportPreview(null))}>
        <DialogContent className="sm:max-w-2xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-green-600" /> Import WhatsApp Chat
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1.5">
              <p className="font-medium">How to get the chat export:</p>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>Open WhatsApp Business app on your phone</li>
                <li>Open the supplier's chat</li>
                <li>Tap the 3-dot menu (Android) or contact name (iOS) → <strong>More</strong> → <strong>Export Chat</strong></li>
                <li>Choose <strong>"Without Media"</strong> (faster, smaller file)</li>
                <li>Save / share the .txt file to yourself (email, drive, etc.)</li>
                <li>Download it on this device and upload below</li>
              </ol>
              <p className="mt-1">The system will auto-detect the supplier, parse their replies, and extract rates.</p>
            </div>

            <div>
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={handleFileSelect}
                className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer"
              />
            </div>

            {importPreview && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                <p className="font-medium text-slate-700">File loaded:</p>
                <p>Name: {importPreview.fileName} · Size: {(importPreview.size / 1024).toFixed(1)} KB · Lines: {importPreview.lineCount}</p>
                <p className="text-slate-500 mt-1 font-mono whitespace-pre-wrap truncate">{importPreview.preview}...</p>
              </div>
            )}

            {importContent && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setImportContent(''); setImportPreview(null) }}>
                  Clear
                </Button>
                <Button onClick={handleImportSubmit} disabled={importing} className="bg-green-600 hover:bg-green-700">
                  {importing ? <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> Parsing...</> : <><Check className="w-4 h-4 mr-1" /> Parse & Import</>}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportContent(''); setImportPreview(null) }} className="w-full sm:w-auto">Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Links Dialog — instant wa.me links for all selected suppliers ===== */}
      <Dialog open={!!linksDialog} onOpenChange={(v) => !v && setLinksDialog(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
              <Send className="w-5 h-5 text-green-600" />
              {linksDialog?.suppliers.length || 0} Messages Ready to Send
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
              <p className="font-medium mb-1">✅ Click each supplier below to open WhatsApp with the message pre-filled.</p>
              <p>Then tap "Send" in WhatsApp, come back here, and click the next supplier. Mark each as "Sent" after sending to track progress.</p>
            </div>

            {/* Message preview */}
            <details className="bg-slate-50 border border-slate-200 rounded-lg">
              <summary className="cursor-pointer p-2.5 text-xs font-medium text-slate-700">📋 Preview message</summary>
              <pre className="px-3 pb-3 text-xs font-mono whitespace-pre-wrap text-slate-600">{linksDialog?.message}</pre>
            </details>

            {/* Progress bar */}
            {linksDialog && linksDialog.suppliers.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Progress:</span>
                <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all"
                    style={{ width: `${(sentTracker.size / linksDialog.suppliers.length) * 100}%` }}
                  />
                </div>
                <span className="font-medium text-slate-700">{sentTracker.size}/{linksDialog.suppliers.length}</span>
              </div>
            )}

            {/* Supplier links list */}
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {linksDialog?.suppliers.map((s, i) => {
                const isSent = sentTracker.has(s.id)
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                      isSent ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-green-300'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      isSent ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {isSent ? <Check className="w-4 h-4" /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{s.name}</p>
                      <p className="text-[10px] text-slate-500">{s.phone || 'No phone'}</p>
                    </div>
                    <a
                      href={s.link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        // Mark as sent after user clicks (they'll send in WhatsApp)
                        setTimeout(() => {
                          setSentTracker((prev) => {
                            const next = new Set(prev)
                            next.add(s.id)
                            return next
                          })
                        }, 500)
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                        isSent
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {isSent ? (
                        <><Check className="w-3.5 h-3.5" /> Sent</>
                      ) : (
                        <><Send className="w-3.5 h-3.5" /> Open WhatsApp</>
                      )}
                    </a>
                  </div>
                )
              })}
            </div>

            {/* All done message */}
            {linksDialog && sentTracker.size === linksDialog.suppliers.length && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center text-sm text-emerald-800">
                <Check className="w-5 h-5 mx-auto mb-1 text-emerald-600" />
                <p className="font-medium">All messages sent! 🎉</p>
                <p className="text-xs mt-0.5">Wait for supplier replies, then use "Import Chat" to capture responses.</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setLinksDialog(null)}
              className="w-full sm:w-auto"
            >
              {linksDialog && sentTracker.size === linksDialog.suppliers.length ? 'Done' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SendEnquiryDialog({
  open, onOpenChange, suppliers, items, onSend, cloudApiOn,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  suppliers: any[]
  items: any[]
  onSend: (payload: { supplierIds: string[]; itemIds: string[]; allItems: boolean }) => void
  cloudApiOn: boolean
}) {
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([])
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [allItems, setAllItems] = useState(false)
  const [itemSearch, setItemSearch] = useState('')

  const filteredItems = items.filter((i) => {
    if (!itemSearch) return true
    const q = itemSearch.toLowerCase()
    return i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
  })

  const toggleSupplier = (id: string) => {
    setSelectedSuppliers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleItem = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleSend = () => {
    if (selectedSuppliers.length === 0) return
    if (!allItems && selectedItems.length === 0) return
    onSend({ supplierIds: selectedSuppliers, itemIds: selectedItems, allItems })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Send Rate Enquiry</DialogTitle>
          {cloudApiOn ? (
            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
              <Check className="w-3 h-3" /> Auto-send enabled — messages will be sent automatically from your business number
            </p>
          ) : (
            <p className="text-xs text-amber-600 mt-1">Manual mode — wa.me links will open, you must hit Send in each tab</p>
          )}
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Suppliers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1 text-sm">
                <Users className="w-4 h-4" /> Suppliers ({selectedSuppliers.length})
              </Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedSuppliers(suppliers.map((s) => s.id))}
                className="h-8 text-xs"
              >
                Select All
              </Button>
            </div>
            <div className="border border-slate-200 rounded-lg max-h-60 sm:max-h-72 overflow-y-auto scrollbar-thin">
              {suppliers.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No active suppliers</p>
              ) : (
                suppliers.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 p-2 hover:bg-slate-50 border-b border-slate-100 last:border-0 min-h-[44px]"
                  >
                    <Checkbox
                      checked={selectedSuppliers.includes(s.id)}
                      onCheckedChange={() => toggleSupplier(s.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{s.whatsappNumber || s.phone}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1 text-sm">
                <Package className="w-4 h-4" /> Items
              </Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="all-items"
                  checked={allItems}
                  onCheckedChange={(v) => {
                    setAllItems(v === true)
                    if (v) setSelectedItems([])
                  }}
                />
                <Label htmlFor="all-items" className="text-xs cursor-pointer">All Items</Label>
              </div>
            </div>
            {!allItems && (
              <Input
                placeholder="Search items..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="h-9 text-sm"
              />
            )}
            <div className="border border-slate-200 rounded-lg max-h-56 sm:max-h-64 overflow-y-auto scrollbar-thin">
              {allItems ? (
                <p className="text-sm text-center py-4 text-slate-500">
                  All {items.length} items will be included
                </p>
              ) : filteredItems.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No items found</p>
              ) : (
                filteredItems.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center gap-2 p-2 hover:bg-slate-50 border-b border-slate-100 last:border-0 min-h-[44px]"
                  >
                    <Checkbox
                      checked={selectedItems.includes(i.id)}
                      onCheckedChange={() => toggleItem(i.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{i.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {i.sku} · Cost: {formatCurrency(i.costPrice)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {!allItems && (
              <p className="text-xs text-slate-500">{selectedItems.length} items selected</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancel</Button>
          <Button
            onClick={handleSend}
            disabled={selectedSuppliers.length === 0 || (!allItems && selectedItems.length === 0)}
            className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
          >
            <Send className="w-4 h-4 mr-1.5" /> {cloudApiOn ? 'Send Enquiries' : 'Generate Messages'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===== ADVANCED: Rate Comparison View =====
function RateComparisonView({ data, loading }: { data: any; loading: boolean }) {
  if (loading) {
    return (
      <Card><CardContent className="text-center py-12 text-slate-500">
        <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-slate-300" />
        Loading rate comparisons...
      </CardContent></Card>
    )
  }
  if (!data || !data.comparisons || data.comparisons.length === 0) {
    return (
      <Card><CardContent className="text-center py-12 text-slate-500">
        <Users className="w-12 h-12 mx-auto mb-2 text-slate-300" />
        No rate data yet. Send enquiries and capture supplier responses to see comparisons.
      </CardContent></Card>
    )
  }
  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>{data.totalItems}</strong> items with rates from <strong>{data.totalSuppliers}</strong> suppliers.
          Click an item to expand and see all supplier rates side-by-side.
        </span>
      </div>
      {data.comparisons.map((c: any) => (
        <Card key={c.itemId} className="border-slate-200 overflow-hidden">
          <CardContent className="p-0">
            <details>
              <summary className="cursor-pointer p-3 sm:p-4 hover:bg-slate-50 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 text-sm sm:text-base truncate">{c.itemName}</p>
                  <p className="text-[10px] sm:text-xs text-slate-500">{c.sku} · {c.rateCount} supplier{c.rateCount !== 1 ? 's' : ''} quoted</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-500">Best: <span className="font-bold text-emerald-600">Rs.{c.bestRate.totalCost ?? c.bestRate.rate}</span></p>
                  <p className="text-[10px] text-slate-400">
                    {c.bestRate.gstType === 'extra' ? `(+${c.bestRate.gstRate || 18}% GST)` : c.bestRate.gstType === 'inclusive' ? '(nett)' : ''}
                    {' · '}Avg: Rs.{c.averageRate} · Save: Rs.{c.potentialSavings}
                  </p>
                </div>
              </summary>
              <div className="border-t border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs">Supplier</TableHead>
                      <TableHead className="text-right text-xs">Rate</TableHead>
                      <TableHead className="text-right text-xs">Total Cost</TableHead>
                      <TableHead className="text-center text-xs">GST</TableHead>
                      <TableHead className="text-right text-xs">Quote Date</TableHead>
                      <TableHead className="text-center text-xs">vs Best</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.rates.map((r: any, i: number) => (
                      <TableRow key={i} className={i === 0 ? 'bg-emerald-50' : ''}>
                        <TableCell className="text-sm font-medium">
                          {r.supplierName}
                          {i === 0 && <Badge className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[9px]">BEST</Badge>}
                        </TableCell>
                        <TableCell className="text-right text-sm text-slate-600">Rs.{r.rate}</TableCell>
                        <TableCell className="text-right font-semibold text-sm">Rs.{r.totalCost ?? r.rate}</TableCell>
                        <TableCell className="text-center text-xs">
                          {r.gstType === 'extra' ? (
                            <Badge className="bg-orange-50 text-orange-700 hover:bg-orange-50 text-[9px]">+{r.gstRate || 18}%</Badge>
                          ) : r.gstType === 'inclusive' ? (
                            <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 text-[9px]">Nett</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px]">?</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-slate-500">
                          {new Date(r.enquiryDate).toLocaleDateString('en-IN')}
                        </TableCell>
                        <TableCell className="text-center">
                          {i === 0 ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[9px]"><Award className="w-3 h-3 mr-0.5 inline" />Cheapest</Badge>
                          ) : (
                            <span className="text-[10px] text-slate-400">+Rs.{(r.totalCost ?? r.rate) - (c.bestRate.totalCost ?? c.bestRate.rate)}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ===== ADVANCED: Best Suppliers View =====
function BestSuppliersView({ data, loading }: { data: any; loading: boolean }) {
  const [strategy, setStrategy] = useState<'cheapest' | 'freshest' | 'reliable'>('cheapest')

  if (loading) {
    return (
      <Card><CardContent className="text-center py-12 text-slate-500">
        <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-slate-300" />
        Loading recommendations...
      </CardContent></Card>
    )
  }
  if (!data || !data.recommendations || data.recommendations.length === 0) {
    return (
      <Card><CardContent className="text-center py-12 text-slate-500">
        <Award className="w-12 h-12 mx-auto mb-2 text-slate-300" />
        No recommendations yet. Send enquiries and capture responses first.
      </CardContent></Card>
    )
  }
  return (
    <div className="space-y-3">
      {/* Strategy selector */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'cheapest', label: '💰 Cheapest', desc: 'Lowest rate' },
          { id: 'freshest', label: '🕐 Most Recent', desc: 'Latest quote' },
          { id: 'reliable', label: '⭐ Most Reliable', desc: 'Most responses' },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setStrategy(s.id as any)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              strategy === s.id
                ? 'bg-green-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title={s.desc}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 flex items-center gap-2">
        <Award className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>{data.totalItems}</strong> items analyzed · Potential total saving: <strong>Rs.{data.totalPotentialSaving}</strong> by switching to recommended suppliers
        </span>
      </div>

      {/* Recommendations */}
      {data.recommendations.map((r: any) => (
        <Card key={r.itemId} className="border-slate-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900 text-sm sm:text-base truncate">{r.itemName}</p>
                <p className="text-[10px] sm:text-xs text-slate-500">{r.sku} · {r.totalSuppliersQuoted} supplier{r.totalSuppliersQuoted !== 1 ? 's' : ''} quoted</p>
              </div>
              {r.potentialSaving > 0 && (
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] flex-shrink-0">
                  <ArrowDownRight className="w-3 h-3 mr-0.5" /> Save Rs.{r.potentialSaving}
                </Badge>
              )}
            </div>

            {/* Recommended supplier */}
            <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg p-3 mb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Award className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{r.recommendedSupplier.supplierName}</p>
                    <p className="text-[10px] text-slate-500">{r.reason} · {r.recommendedSupplier.age}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-emerald-700 text-lg">Rs.{r.recommendedSupplier.totalCost ?? r.recommendedSupplier.rate}</p>
                  {r.recommendedSupplier.gstType === 'extra' ? (
                    <p className="text-[10px] text-orange-600">+{r.recommendedSupplier.gstRate || 18}% GST</p>
                  ) : r.recommendedSupplier.gstType === 'inclusive' ? (
                    <p className="text-[10px] text-blue-600">Nett (incl GST)</p>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Current vs recommended */}
            {r.currentCostPrice > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span>Current cost: <strong>Rs.{r.currentCostPrice}</strong></span>
                {r.potentialSaving > 0 ? (
                  <span className="text-emerald-600 font-medium">↓ Rs.{r.potentialSaving} cheaper</span>
                ) : r.potentialSaving < 0 ? (
                  <span className="text-red-600 font-medium">↑ Rs.{Math.abs(r.potentialSaving)} more expensive</span>
                ) : (
                  <span className="text-slate-400">Same price</span>
                )}
              </div>
            )}

            {/* Alternatives */}
            {r.alternatives && r.alternatives.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                  {r.alternatives.length} alternative supplier{r.alternatives.length !== 1 ? 's' : ''} →
                </summary>
                <div className="mt-2 space-y-1.5">
                  {r.alternatives.map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1.5">
                      <span className="font-medium text-slate-700">{a.supplierName}</span>
                      <span className="text-slate-600">Rs.{a.rate} · {new Date(a.enquiryDate).toLocaleDateString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ===== AI INTELLIGENCE VIEW =====
// Superintelligence tab — analyzes all supplier replies, extracts rates,
// finds cheapest supplier per item, flags low-confidence entries + OOS.
function IntelligenceView() {
  const { data, loading, refetch } = useFetch<any>('/api/whatsapp/intelligence?days=90', undefined)

  if (loading && !data) {
    return <Card><CardContent className="text-center py-8 text-slate-500">Running AI analysis on supplier replies…</CardContent></Card>
  }
  if (!data) {
    return <Card><CardContent className="text-center py-8 text-slate-500">No data</CardContent></Card>
  }

  const s = data.summary || {}
  const items = data.itemBestRates || []
  const topSuppliers = data.topSuppliers || []

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <Card className="border-violet-300 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-violet-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                Supplier Rate Intelligence
                <Badge className="bg-violet-100 text-violet-700 text-[10px]">SUPERINTELLIGENCE</Badge>
              </h3>
              <p className="text-[11px] text-slate-600">Auto-analyzes all supplier WhatsApp replies, extracts rates, finds cheapest supplier per item, flags low-confidence + out-of-stock entries</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-slate-200"><CardContent className="p-3">
          <p className="text-[10px] text-slate-500 uppercase">Replies Analyzed</p>
          <p className="text-lg font-bold text-slate-900">{s.totalEnquiries || 0}</p>
          <p className="text-[10px] text-slate-400">{s.totalSuppliers || 0} suppliers</p>
        </CardContent></Card>
        <Card className="border-slate-200"><CardContent className="p-3">
          <p className="text-[10px] text-slate-500 uppercase">Rates Parsed</p>
          <p className="text-lg font-bold text-blue-700">{s.totalRatesParsed || 0}</p>
          <p className="text-[10px] text-slate-400">{s.totalItemsAnalyzed || 0} items</p>
        </CardContent></Card>
        <Card className="border-slate-200"><CardContent className="p-3">
          <p className="text-[10px] text-slate-500 uppercase">Avg Confidence</p>
          <p className="text-lg font-bold text-emerald-700">{((s.avgConfidence || 0) * 100).toFixed(0)}%</p>
          <p className="text-[10px] text-slate-400">{s.lowConfidenceRates || 0} low-confidence</p>
        </CardContent></Card>
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"><CardContent className="p-3">
          <p className="text-[10px] text-slate-500 uppercase">Potential Savings</p>
          <p className="text-lg font-bold text-emerald-700">{formatCurrency(s.potentialSavings || 0)}</p>
          <p className="text-[10px] text-emerald-600">by picking cheapest supplier</p>
        </CardContent></Card>
      </div>

      {/* Top suppliers leaderboard */}
      {topSuppliers.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4 text-amber-500" /> Top Suppliers (most lowest rates)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="text-xs">Rank</TableHead>
                <TableHead className="text-xs">Supplier</TableHead>
                <TableHead className="text-xs text-center">Replies</TableHead>
                <TableHead className="text-xs text-center">Rates</TableHead>
                <TableHead className="text-xs text-center">Lowest Wins</TableHead>
                <TableHead className="text-xs text-center">Confidence</TableHead>
                <TableHead className="text-xs text-center">OOS</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {topSuppliers.map((sup: any, i: number) => (
                  <TableRow key={sup.supplierId}>
                    <TableCell className="font-bold">#{i + 1}</TableCell>
                    <TableCell className="text-xs font-bold">{sup.supplierName}</TableCell>
                    <TableCell className="text-center text-xs">{sup.totalReplies}</TableCell>
                    <TableCell className="text-center text-xs">{sup.totalRates}</TableCell>
                    <TableCell className="text-center"><Badge className="bg-amber-100 text-amber-700 text-[10px] font-bold">{sup.lowestRatesCount}</Badge></TableCell>
                    <TableCell className="text-center text-xs">{(sup.avgConfidence * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-center text-xs text-red-600">{sup.outOfStockCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Per-item best rates */}
      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Best Rate Per Item (sorted by savings potential)</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Re-analyze</Button>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No supplier replies yet. Send an enquiry first.</div>
          ) : (
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs">Best Supplier</TableHead>
                <TableHead className="text-xs text-right">Best Rate</TableHead>
                <TableHead className="text-xs text-right">Total Cost</TableHead>
                <TableHead className="text-xs text-center">GST</TableHead>
                <TableHead className="text-xs text-center">Confidence</TableHead>
                <TableHead className="text-xs text-center">Quotes</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((item: any, i: number) => (
                  <TableRow key={i} className={item.allOutOfStock ? 'bg-red-50/50' : ''}>
                    <TableCell className="text-xs font-bold">{item.itemName}</TableCell>
                    <TableCell className="text-xs">
                      {item.bestSupplier ? (
                        <span className="text-emerald-700 font-medium">{item.bestSupplier}</span>
                      ) : item.allOutOfStock ? (
                        <Badge className="bg-red-100 text-red-700 text-[10px]">ALL OOS</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold">{item.bestRate ? formatCurrency(item.bestRate) : '—'}</TableCell>
                    <TableCell className="text-right text-xs">{item.bestTotalCost ? formatCurrency(item.bestTotalCost) : '—'}</TableCell>
                    <TableCell className="text-center text-xs">{item.bestGstType || '—'}</TableCell>
                    <TableCell className="text-center">
                      {item.bestConfidence !== null && item.bestConfidence !== undefined ? (
                        <Badge className={item.bestConfidence >= 0.8 ? 'bg-emerald-100 text-emerald-700 text-[10px]' : item.bestConfidence >= 0.6 ? 'bg-amber-100 text-amber-700 text-[10px]' : 'bg-red-100 text-red-700 text-[10px]'}>
                          {(item.bestConfidence * 100).toFixed(0)}%
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-center text-xs">{item.totalQuotes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Low confidence warning */}
      {(s.lowConfidenceRates || 0) > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="text-xs text-amber-800">
              <strong>{s.lowConfidenceRates} rate(s) have low confidence.</strong> These were parsed from unusual formats. Review them manually in the Enquiries tab before applying to your stock items.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

