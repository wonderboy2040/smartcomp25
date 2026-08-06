'use client'

import { useState, useEffect, useMemo } from 'react'
import { useFetch, apiPost, apiPut, apiDelete } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
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
import { Plus, Search, Pencil, Trash2, Building2, MessageCircle, Bot } from 'lucide-react'

export function SuppliersPanel() {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)

  const { data: suppliers, loading, refetch } = useFetch<any[]>(
    `/api/suppliers`,
    undefined
  )

  const filtered = useMemo(() => {
    return (suppliers || []).filter((s) => {
      if (!search) return true
      const q = search.toLowerCase()
      return String(s?.name || '').toLowerCase().includes(q) || String(s?.phone || '').includes(q) || String(s?.company || '').toLowerCase().includes(q)
    })
  }, [suppliers, search])

  const handleAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const handleEdit = (s: any) => {
    setEditing(s)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this supplier?')) return
    try {
      await apiDelete(`/api/suppliers/${id}`)
      toast({
        title: 'Supplier deleted ✓',
        description: 'Removed locally - syncing to cloud',
        duration: 3500,
      })
      refetch()
    } catch (e: any) {
      toast({
        title: 'Delete failed',
        description: e.message,
        variant: 'destructive',
        duration: 6000,
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Vendors for stock and rate enquiries</p>
        </div>
        <Button onClick={handleAdd} className="bg-slate-900 hover:bg-slate-800 h-11">
          <Plus className="w-4 h-4 mr-1.5" /> <span className="hidden sm:inline">Add Supplier</span><span className="sm:hidden">Add</span>
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
            <Input
              placeholder="Search name, phone, company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
        </CardContent>
      </Card>

      {/* Mobile card layout */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <Card><CardContent className="text-center py-8 text-slate-500">Loading...</CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="text-center py-8 text-slate-500">
            <Building2 className="w-12 h-12 mx-auto mb-2 text-slate-300" />
            No suppliers found
          </CardContent></Card>
        ) : (
          filtered.map((s) => (
            <Card key={s.id} className="border-slate-200">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 text-sm truncate">{s?.name || ""}</p>
                    {s.company && <p className="text-[10px] text-slate-500 truncate">{s.company}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEdit(s)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2 text-xs">
                  <MessageCircle className="w-3 h-3 text-green-600 flex-shrink-0" />
                  <span className="truncate">{s.whatsappNumber || s.phone}</span>
                </div>
                {s.suppliedItems && (
                  <p className="text-[10px] text-slate-500 mt-1 truncate">Items: {s.suppliedItems}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <Badge variant="outline" className={
                    s.active ? 'bg-green-50 text-green-700 border-green-200 text-[9px]'
                    : 'bg-slate-50 text-slate-500 border-slate-200 text-[9px]'
                  }>{s.active ? 'Active' : 'Inactive'}</Badge>
                  {s.includeInAutoEnquiry && (
                    <span className="text-[9px] text-violet-600 flex items-center gap-0.5">
                      <Bot className="w-2.5 h-2.5" /> Auto
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Desktop table */}
      <Card className="border-slate-200 hidden sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Supplier</TableHead>
                  <TableHead>Phone / WhatsApp</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Items Supplied</TableHead>
                  <TableHead className="text-center">Auto Enquiry</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">Loading...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      <Building2 className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      No suppliers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s) => (
                    <TableRow key={s.id} className="hover:bg-slate-50">
                      <TableCell>
                        <div className="font-medium text-slate-900">{s?.name || ""}</div>
                        {s.email && <div className="text-[10px] text-slate-500">{s.email}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3 text-green-600" />
                          <span className="text-sm">{s.whatsappNumber || s.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{s.company || '-'}</TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {s.suppliedItems || <span className="text-slate-400">-</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={s.includeInAutoEnquiry} disabled />
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={
                            s.active
                              ? 'bg-green-50 text-green-700 border-green-200 text-[10px]'
                              : 'bg-slate-50 text-slate-500 border-slate-200 text-[10px]'
                          }
                        >
                          {s.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(s)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => {
          setDialogOpen(false)
          refetch()
        }}
      />
    </div>
  )
}

function SupplierDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: any | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? { ...editing }
          : {
              name: '', phone: '', whatsappNumber: '', email: '',
              company: '', address: '', suppliedItems: '',
              active: true, includeInAutoEnquiry: true,
            }
      )
    }
  }, [open, editing])

  const handleSave = async () => {
    if (!form.name || !form.phone) {
      toast({ title: 'Name and phone are required', variant: 'destructive', duration: 5000 })
      return
    }
    setSaving(true)
    try {
      const payload = { ...form, whatsappNumber: form.whatsappNumber || form.phone }
      if (editing) {
        await apiPut(`/api/suppliers/${editing.id}`, payload)
        toast({
          title: 'Supplier updated ✓',
          description: `${form.name} - syncs to cloud`,
          duration: 3500,
        })
      } else {
        await apiPost('/api/suppliers', payload)
        toast({
          title: 'Supplier added ✓',
          description: `${form.name} - syncs to cloud`,
          duration: 3500,
        })
      }
      onSaved()
    } catch (e: any) {
      toast({
        title: 'Error saving supplier',
        description: e.message,
        variant: 'destructive',
        duration: 6000,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[100dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{editing ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Name *</Label>
            <Input
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Supplier name"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Phone *</Label>
            <Input
              value={form.phone || ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="9876543210 (with country code if international)"
              className="mt-1"
            />
          </div>
          <div>
            <Label>WhatsApp Number</Label>
            <Input
              value={form.whatsappNumber || ''}
              onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
              placeholder="Same as phone if empty"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email || ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Company</Label>
            <Input
              value={form.company || ''}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Items Supplied</Label>
            <Textarea
              value={form.suppliedItems || ''}
              onChange={(e) => setForm({ ...form, suppliedItems: e.target.value })}
              placeholder="e.g. Laptops, RAM, SSD, Printers (comma separated)"
              rows={2}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input
              value={form.address || ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-4 sm:gap-6 p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox
                id="active"
                checked={form.active !== false}
                onCheckedChange={(v) => setForm({ ...form, active: v === true })}
              />
              <Label htmlFor="active" className="cursor-pointer text-sm">Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="auto"
                checked={form.includeInAutoEnquiry !== false}
                onCheckedChange={(v) => setForm({ ...form, includeInAutoEnquiry: v === true })}
              />
              <Label htmlFor="auto" className="cursor-pointer text-sm">Include in Auto Enquiry</Label>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-slate-900 hover:bg-slate-800 w-full sm:w-auto">
            {saving ? 'Saving...' : editing ? 'Update' : 'Add Supplier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
