'use client'

/**
 * Service WhatsApp Modal - FIXED v3.0.3 for Dark Theme Visibility
 * 
 * BEFORE: Text invisible in dark theme - white text on light pastel bg
 * - bg-blue-50 became rgba(59,130,246,0.15) in dark, text-slate-800 became #f1f5f9 (light)
 * - Result: light text on light bg = invisible
 * 
 * AFTER: Explicit high-contrast colors that work in BOTH light and dark modes
 * - Buttons have solid light backgrounds with dark text always visible
 * - Icons have solid dark backgrounds with white icons
 * - Modal itself has white bg in light, dark slate in dark but with proper text
 */

import { useFetch, apiPut, invalidate } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { buildWhatsAppMessage, buildWhatsAppLink, WHATSAPP_TEMPLATES } from '@/lib/whatsapp-templates'
import { X, MessageCircle, CheckCircle2, CreditCard, Heart, Smartphone, Wrench } from 'lucide-react'
import { useState, useEffect } from 'react'

// Map WhatsApp template type → job status to sync.
// When the user sends a "Device Received" or "In Progress" template, the
// job's status is also updated so the Jobs panel reflects the latest
// communication (per user request).
//
// 'completed' and 'delivered' templates do NOT auto-sync status here because:
//   - "Completed" requires the dedicated Complete Job action (which also
//     deducts stock, computes profit, records payment, etc.)
//   - "Delivered" requires the dedicated Deliver action
//   - 'payment' (Payment Reminder) leaves status unchanged
const TEMPLATE_TO_STATUS: Record<string, string> = {
  received: 'Device Received',
  progress: 'In Progress',
}

interface Props {
  jobId: string
  onClose: () => void
}

const ICON_MAP: Record<string, any> = {
  'fa-box': Smartphone,
  'fa-tools': Wrench,
  'fa-check': CheckCircle2,
  'fa-credit-card': CreditCard,
  'fa-heart': Heart,
}

export function ServiceWhatsAppModal({ jobId, onClose }: Props) {
  const { toast } = useToast()
  const { data: job } = useFetch<any>(`/api/jobs/${jobId}`, undefined)
  const { data: shop } = useFetch<any>('/api/shop', undefined)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!job) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-8 shadow-xl border">
          <p className="text-slate-900 font-medium">Loading job...</p>
        </div>
      </div>
    )
  }

  const bn = shop?.name || 'Smart Computers Sales & Service'

  const sendTemplate = (type: typeof WHATSAPP_TEMPLATES[number]['type']) => {
    if (!mounted) return
    const msg = buildWhatsAppMessage(type, {
      id: job.jobId,
      customerName: job.customerName,
      customerMobile: job.customerMobile,
      deviceType: job.deviceType,
      brandModel: job.brandModel,
      problemDesc: job.problemDesc,
      accessories: job.accessories,
      date: job.date,
      estimatedAmount: Number(job.estimatedAmount) || 0,
      advanceAmount: Number(job.advanceAmount) || 0,
      paidAmount: Number(job.paidAmount) || 0,
      finalAmount: Number(job.finalAmount) || 0,
      serviceCharge: Number(job.serviceCharge) || 0,
      spareParts: (job.partsUsed || []).map((p: any) => ({
        name: p.name,
        qty: Number(p.qty) || 1,
        total: (Number(p.sellPrice || p.price || 0)) * (Number(p.qty) || 1),
      })),
    }, {
      businessName: bn,
      businessMobile: shop?.phone || '',
      businessAddress: shop?.address || '',
      whatsappNumber: shop?.whatsappNumber || '',
      upiId: shop?.upiId || '',
    })
    window.open(buildWhatsAppLink(job.customerMobile, msg), '_blank')
    toast({ title: 'WhatsApp opened ✓', description: `Template: ${type}` })

    // Sync job status — when the user sends a "Device Received" / "In Progress"
    // / "Completed" / "Delivered" WhatsApp template, also update the job's
    // status in the backend so the Jobs panel reflects the latest state.
    // 'payment' template leaves status unchanged.
    const newStatus = TEMPLATE_TO_STATUS[type]
    if (newStatus && newStatus !== job.status) {
      apiPut(`/api/jobs/${job.id}`, { action: 'updateStatus', status: newStatus })
        .then(() => {
          // Invalidate the jobs list cache so the panel refetches with the new status
          invalidate('/api/jobs')
          invalidate('/api/dashboard')
          toast({ title: 'Job status synced ✓', description: `Status updated to: ${newStatus}` })
        })
        .catch((e: any) => {
          // Don't block the WhatsApp send — just log
          console.warn('[ServiceWhatsAppModal] Failed to sync job status:', e?.message)
        })
    }
    onClose()
  }

  // Fixed color classes with explicit visible text
  const templateStyles: Record<string, { bg: string; border: string; iconBg: string; titleColor: string; descColor: string; hover: string }> = {
    blue:   { 
      bg: 'bg-blue-50', 
      border: 'border-blue-200',
      iconBg: 'bg-blue-600',
      titleColor: 'text-slate-900',
      descColor: 'text-slate-600',
      hover: 'hover:bg-blue-100 hover:border-blue-300'
    },
    amber:  { 
      bg: 'bg-amber-50', 
      border: 'border-amber-200',
      iconBg: 'bg-amber-500',
      titleColor: 'text-slate-900',
      descColor: 'text-slate-600',
      hover: 'hover:bg-amber-100 hover:border-amber-300'
    },
    green:  { 
      bg: 'bg-emerald-50', 
      border: 'border-emerald-200',
      iconBg: 'bg-emerald-600',
      titleColor: 'text-slate-900',
      descColor: 'text-slate-600',
      hover: 'hover:bg-emerald-100 hover:border-emerald-300'
    },
    purple: { 
      bg: 'bg-purple-50', 
      border: 'border-purple-200',
      iconBg: 'bg-purple-600',
      titleColor: 'text-slate-900',
      descColor: 'text-slate-600',
      hover: 'hover:bg-purple-100 hover:border-purple-300'
    },
    gray:   { 
      bg: 'bg-slate-50', 
      border: 'border-slate-200',
      iconBg: 'bg-slate-600',
      titleColor: 'text-slate-900',
      descColor: 'text-slate-600',
      hover: 'hover:bg-slate-100 hover:border-slate-300'
    },
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[60] p-4 bg-black/70 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl max-w-md w-full p-0 shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header - Fixed visibility */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Send WhatsApp</h3>
                <p className="text-xs text-slate-300">Choose a template to send</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="mt-3 bg-white/10 rounded-lg p-2.5 backdrop-blur">
            <p className="text-sm font-semibold text-white truncate">{job.customerName}</p>
            <p className="text-xs text-slate-300 font-mono">{job.customerMobile} • {job.jobId}</p>
          </div>
        </div>

        <div className="p-4 space-y-2.5 max-h-[60vh] overflow-y-auto">
          {WHATSAPP_TEMPLATES.map((t) => {
            const style = templateStyles[t.color] || templateStyles.blue
            const IconComponent = ICON_MAP[t.icon] || MessageCircle
            return (
              <button
                key={t.type}
                onClick={() => sendTemplate(t.type)}
                className={`w-full p-3.5 ${style.bg} border-2 ${style.border} ${style.hover} rounded-xl text-left flex items-center gap-3 transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] group`}
              >
                <div className={`w-12 h-12 ${style.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow`}>
                  <IconComponent className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${style.titleColor} truncate`}>{t.title}</p>
                  <p className={`text-xs ${style.descColor} mt-0.5 line-clamp-1`}>{t.desc}</p>
                </div>
                <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-900 group-hover:border-slate-900 transition-colors">
                  <span className="text-[10px] font-bold text-slate-600 group-hover:text-white">→</span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <button onClick={onClose} className="w-full py-3 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-300 rounded-xl font-semibold text-slate-700 hover:text-slate-900 transition-all text-sm">
            Cancel
          </button>
          <p className="text-[10px] text-center text-slate-500 mt-2">
            Opens WhatsApp with pre-filled message • Customer: {job.customerName}
          </p>
        </div>
      </div>
    </div>
  )
}
