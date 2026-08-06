'use client'

import { useState } from 'react'
import { useFetch, apiPost, apiDelete } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { Megaphone, Plus, Trash2, Send, Copy, Loader2 } from 'lucide-react'

const SEGMENTS = [
  { value: 'all', label: 'All Customers (with phone)' },
  { value: 'recent', label: 'Recent Buyers (last 3 months)' },
  { value: 'inactive', label: 'Inactive Customers (6+ months)' },
  { value: 'outstanding', label: 'Outstanding Balance Customers' },
]

const TEMPLATES = [
  { name: 'Diwali Offer', message: '*{shop}*\n\nHappy Diwali {name}! 🎉\n\nSpecial Diwali offer: 15% off on all laptops & accessories this week.\n\nVisit us today. Limited stock!' },
  { name: 'Monsoon Care', message: '*{shop}*\n\nHello {name},\n\nIs your laptop monsoon-ready? Get a free cleaning + antivirus checkup for just Rs.299.\n\nOffer valid till 31st July. Book now!' },
  { name: 'New Stock', message: '*{shop}*\n\nHi {name}!\n\nNew stock arrived: Latest laptops, SSDs, and RAM at best prices.\n\nVisit us or reply to this message for details.' },
  { name: 'Service Reminder', message: '*{shop}*\n\nDear {name},\n\nIs your computer running slow? Time for a service!\n\nProfessional cleaning + optimization for Rs.499 only. Contact us to book.' },
  { name: 'Clearance Sale', message: '*{shop}*\n\nHello {name}!\n\nClearance sale: Up to 40% off on older stock. Limited quantities.\n\nFirst come, first served. Visit today!' },
]

export function CampaignsPanel() {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [linksDialog, setLinksDialog] = useState<any | null>(null)

  const { data: campaigns, loading, refetch } = useFetch<any[]>('/api/campaigns', undefined)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this campaign?')) return
    try {
      await apiDelete(`/api/campaigns/${id}`)
      toast({ title: 'Campaign deleted' })
      refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    }
  }

  const handleSend = async (campaign: any) => {
    if (!confirm(`Send campaign "${campaign.name}" to ${campaign.segment} segment?\n\nThis will send WhatsApp messages to all matching customers.`)) return
    setSending(campaign.id)
    try {
      const res = await apiPost('/api/campaigns', { action: 'send', campaignId: campaign.id })
      if (res.links && res.links.length > 0) {
        setLinksDialog({ name: campaign.name, links: res.links, sent: res.sentCount })
        toast({ title: `${res.sentCount} messages generated`, description: 'Open each link to send manually' })
      } else {
        toast({ title: `${res.sentCount} messages sent automatically` })
      }
      refetch()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 flex-shrink-0" />
            <span className="truncate">WhatsApp Campaigns</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Send bulk WhatsApp messages — offers, festivals, service reminders
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-green-600 hover:bg-green-700 h-11">
          <Plus className="w-4 h-4 mr-1.5" /> <span className="hidden sm:inline">New Campaign</span><span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
        <p className="font-medium">How it works:</p>
        <p>1. Create campaign (select segment + write message with {'{name}'} placeholder)</p>
        <p>2. Click "Send" — messages go via Cloud API (auto) or generate wa.me links (manual)</p>
        <p>3. Rate limit: 1 message per 3 seconds (avoids WhatsApp ban)</p>
      </div>

      {/* Campaigns table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-xs">Campaign</TableHead>
                <TableHead className="text-xs">Segment</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
                <TableHead className="text-xs text-center hidden sm:table-cell">Sent</TableHead>
                <TableHead className="text-xs text-center hidden sm:table-cell">Date</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">Loading...</TableCell></TableRow>
              ) : !campaigns || campaigns.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">
                  <Megaphone className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  No campaigns yet. Create one to send bulk WhatsApp.
                </TableCell></TableRow>
              ) : (
                campaigns.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{c.name}</p>
                      <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{c.message}</p>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700">{c.segment}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-[9px] ${
                        c.status === 'sent' ? 'bg-emerald-50 text-emerald-700' :
                        c.status === 'sent-manual' ? 'bg-amber-50 text-amber-700' :
                        'bg-slate-50 text-slate-600'
                      }`}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-xs hidden sm:table-cell">
                      {c.sentCount}/{c.totalRecipients}
                    </TableCell>
                    <TableCell className="text-center text-xs hidden sm:table-cell text-slate-500">
                      {c.sentAt ? new Date(c.sentAt).toLocaleDateString('en-IN') : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {c.status === 'draft' && (
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-green-600" onClick={() => handleSend(c)} disabled={sending === c.id}>
                            {sending === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dialogOpen && (
        <NewCampaignDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={() => { setDialogOpen(false); refetch() }} />
      )}

      {/* Links dialog */}
      {linksDialog && (
        <Dialog open={!!linksDialog} onOpenChange={(v) => !v && setLinksDialog(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[100dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-green-600" />
                {linksDialog.name} — {linksDialog.sent} Messages
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-xs text-slate-500">Click each link below to open WhatsApp with the message pre-filled. Then tap Send in WhatsApp.</p>
              {linksDialog.links.map((link: string, i: number) => (
                <div key={i} className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg">
                  <span className="text-xs font-bold w-6">{i + 1}</span>
                  <a href={link} target="_blank" rel="noreferrer" className="flex-1 text-xs text-blue-600 truncate hover:underline">
                    {link.slice(0, 60)}...
                  </a>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { navigator.clipboard.writeText(link); toast({ title: 'Copied' }) }}>
                    <Copy className="w-3 h-3" />
                  </Button>
                  <a href={link} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 bg-green-600 text-white rounded">
                    Open
                  </a>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function NewCampaignDialog({ open, onOpenChange, onSaved }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({ name: '', segment: 'all', message: '' })
  const [saving, setSaving] = useState(false)

  const applyTemplate = (msg: string) => {
    setForm({ ...form, message: msg })
  }

  const submit = async () => {
    if (!form.name || !form.message) {
      toast({ title: 'Name and message required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await apiPost('/api/campaigns', { action: 'create', ...form })
      toast({ title: 'Campaign created. Click Send to broadcast.' })
      onSaved()
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[100dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-green-600" /> New Campaign
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Campaign Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Diwali 2026 Offer" className="h-10" />
          </div>
          <div>
            <Label className="text-xs">Segment (recipients)</Label>
            <Select value={form.segment} onValueChange={(v) => setForm({ ...form, segment: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEGMENTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Quick Templates</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {TEMPLATES.map((t) => (
                <button key={t.name} onClick={() => applyTemplate(t.message)} className="text-[10px] px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded">
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Message * (use {'{name}'} for customer name)</Label>
            <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} placeholder="Hello {name}, ..." />
            <p className="text-[10px] text-slate-400 mt-1">{'{name}'} will be replaced with each customer's name automatically</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-green-600 hover:bg-green-700">
            {saving ? 'Creating...' : 'Create Campaign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
