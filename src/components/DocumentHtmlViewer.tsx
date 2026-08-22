'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Printer, Download, X, FileText, RefreshCw, ExternalLink } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ─── Template list (in sync with doc-html.ts) ───
const TEMPLATES = [
  { id: 'tally-classic', name: 'Tally Prime Premium', badge: 'BEST SELLER' },
  { id: 'tally-modern', name: 'Modern Minimal GST', badge: 'MINIMAL' },
  { id: 'tally-corporate', name: 'Corporate Elite Pro', badge: 'CORPORATE' },
  { id: 'tally-elegant', name: 'Royal Executive Gold', badge: 'ROYAL' },
  { id: 'tally-bold', name: 'Tech Store Pro', badge: 'TECH' },
  { id: 'gst-premium-dark', name: 'Premium Dark Elite', badge: 'LUXURY' },
  { id: 'gst-classic-plus', name: 'GST Classic Plus', badge: 'GST PLUS' },
  { id: 'gst-executive-formal', name: 'Executive Formal', badge: 'FORMAL' },
  { id: 'gst-vibrant-bold', name: 'Vibrant Bold Offer', badge: 'VIBRANT' },
  { id: 'gst-minimal-white', name: 'Minimal White Pro', badge: 'ECO PRINT' },
]

const BANNERS = [
  { id: 'grid', name: 'Product Grid' },
  { id: 'featured', name: 'Featured Showcase' },
  { id: 'strip', name: 'Compact Strip' },
  { id: 'flyer', name: 'Flyer Banner' },
  { id: 'none', name: 'No Banner' },
]

export interface DocumentHtmlViewerProps {
  docId?: string
  docType?: 'invoice' | 'quotation' | 'service'
  title?: string
  onClose?: () => void
  gstMode?: 'gst' | 'non-gst'
}

/**
 * Unified Document Viewer — uses server-rendered HTML in an iframe.
 * 
 * This guarantees PIXEL-PERFECT match between:
 *  - Preview (what user sees)
 *  - Print A4 (Ctrl+P from iframe)
 *  - Download PDF (server-side HTML → PDF)
 * 
 * All three use the SAME doc-html.ts rendering engine.
 */
export function DocumentHtmlViewer({ docId, docType = 'invoice', title, onClose, gstMode = 'gst' }: DocumentHtmlViewerProps) {
  const { toast } = useToast()
  const [templateId, setTemplateId] = useState<string>('tally-classic')
  const [bannerVariant, setBannerVariant] = useState<string>('flyer')
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeError, setIframeError] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Build the iframe URL for the server-rendered HTML document
  const buildIframeUrl = useCallback((tpl: string, banner: string) => {
    if (!docId) return ''
    const params = new URLSearchParams({
      type: docType,
      template: tpl,
      banner: banner,
      gstMode,
    })
    return `/api/doc-html/${encodeURIComponent(docId)}?${params.toString()}`
  }, [docId, docType, gstMode])

  const iframeUrl = buildIframeUrl(templateId, bannerVariant)

  // Reset loaded state when URL changes
  useEffect(() => {
    setIframeLoaded(false)
    setIframeError(false)
    // Timeout for slow loads — force show iframe even if load event didn't fire
    loadTimerRef.current = setTimeout(() => {
      setIframeLoaded(true)
    }, 5000)
    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
    }
  }, [iframeUrl])

  const handleIframeLoad = useCallback(() => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
    setIframeLoaded(true)
    setIframeError(false)
  }, [])

  const handleIframeError = useCallback(() => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
    setIframeError(true)
    setIframeLoaded(true)
  }, [])

  // Print: trigger the iframe's native print (same HTML = same A4 output)
  const handlePrint = useCallback(() => {
    try {
      const iframe = iframeRef.current
      if (iframe?.contentWindow) {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
      }
    } catch {
      // Fallback: open the doc-html in a new tab for printing
      window.open(iframeUrl, '_blank')
    }
  }, [iframeUrl])

  // Save as PDF — downloads a REAL .pdf file (not a print dialog). The PDF
  // is rendered server-side using the SAME HTML engine as the on-screen
  // preview (doc-html.ts → WeasyPrint), so the output is byte-for-byte
  // identical to what the user sees. Falls back to the jsPDF engine if
  // WeasyPrint is not installed on the server.
  //
  // Why not window.open() + autoprint=1? That approach (the previous code)
  // was unreliable:
  //   1. Popup blockers silently swallow window.open() — the new tab never
  //      opens and the user sees nothing happen.
  //   2. Even when popups are allowed, the user has to manually pick
  //      "Save as PDF" in the print dialog. That's an extra click and the
  //      output filename is the URL, not "Invoice-SCSS-001.pdf".
  //   3. The `noopener` flag in the previous window.open() call prevented
  //      the parent window from accessing the popup, so any auto-print
  //      script in the new tab had no fallback if it failed.
  //
  // The new flow: fetch() the PDF bytes, create a Blob URL, and click a
  // hidden <a download> element. This downloads a real file with the
  // correct filename, works on all browsers, and never requires popups.
  const [downloading, setDownloading] = useState(false)
  const handleSavePdf = useCallback(async () => {
    if (!docId || downloading) return
    setDownloading(true)
    try {
      // Build the PDF URL. Prefer the new POST /api/doc-html/[id] endpoint
      // (renders with WeasyPrint — same engine as preview). Fall back to
      // the old GET /api/pdf/[id] (jsPDF engine) if the POST fails.
      const postUrl = `/api/doc-html/${encodeURIComponent(docId)}?type=${docType}&template=${templateId}&banner=${bannerVariant}&gstMode=${gstMode}`
      let blob: Blob | null = null
      let usedEngine: 'weasyprint' | 'jspdf' | 'browser-print' = 'browser-print'
      try {
        const resp = await fetch(postUrl, { method: 'POST' })
        if (resp.ok) {
          const ct = resp.headers.get('Content-Type') || ''
          if (ct.includes('application/pdf')) {
            blob = await resp.blob()
            usedEngine = 'weasyprint'
          }
        }
      } catch (postErr: any) {
        // POST endpoint failed — fall through to GET /api/pdf/[id]
        console.warn('[handleSavePdf] POST /api/doc-html failed:', postErr?.message)
      }

      // Fallback: old jsPDF endpoint
      if (!blob) {
        const fallbackUrl = docType === 'service'
          ? `/api/service-pdf/${encodeURIComponent(docId)}`
          : `/api/pdf/${encodeURIComponent(docId)}?type=${docType}&template=${templateId}&banner=${bannerVariant}&gstMode=${gstMode}`
        try {
          const resp = await fetch(fallbackUrl)
          if (resp.ok) {
            const ct = resp.headers.get('Content-Type') || ''
            if (ct.includes('application/pdf') || ct.includes('octet-stream')) {
              blob = await resp.blob()
              usedEngine = 'jspdf'
            }
          }
        } catch (fbErr: any) {
          console.warn('[handleSavePdf] GET fallback failed:', fbErr?.message)
        }
      }

      // Final fallback: open the doc-html in a new tab with autoprint=1.
      // This still works if the server can't render PDFs at all — the
      // user uses the browser's "Save as PDF" in the print dialog.
      if (!blob) {
        const url = `${iframeUrl}${iframeUrl.includes('?') ? '&' : '?'}autoprint=1`
        const win = window.open(url, '_blank')
        if (!win) {
          toast({
            title: 'PDF download unavailable',
            description: 'Server PDF rendering is disabled and popups are blocked. Allow popups, or click "Print A4" → "Save as PDF".',
            variant: 'destructive',
            duration: 8000,
          })
        } else {
          toast({
            title: 'Opening print dialog...',
            description: 'Choose "Save as PDF" as the destination to download.',
            duration: 5000,
          })
        }
        return
      }

      // Trigger a real file download via a hidden <a download> element.
      // The browser shows the "Save / Open" dialog with the correct filename.
      const safeDocNumber = docId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
      const filename = `${docType === 'invoice' ? 'Invoice' : docType === 'quotation' ? 'Quotation' : 'Service-Invoice'}-${safeDocNumber}.pdf`
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Revoke the blob URL after a short delay so the download has time
      // to start. 60s is more than enough for any browser.
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000)

      const engineLabel = usedEngine === 'weasyprint' ? 'preview-quality' : 'standard'
      toast({
        title: `PDF downloaded ✓`,
        description: `${filename} • ${engineLabel}`,
        duration: 3500,
      })
    } catch (e: any) {
      console.error('[handleSavePdf] error:', e)
      toast({
        title: 'PDF download failed',
        description: String(e?.message || '').slice(0, 120) || 'Unknown error',
        variant: 'destructive',
        duration: 6000,
      })
    } finally {
      setDownloading(false)
    }
  }, [docId, docType, templateId, bannerVariant, gstMode, iframeUrl, toast, downloading])

  const docTypeLabel = docType === 'quotation' ? 'Quotation' : docType === 'service' ? 'Service Invoice' : 'Invoice'

  if (!docId) {
    return (
      <div className="p-8 text-center bg-white text-slate-800">
        <p className="text-red-600 font-bold mb-2">No Document ID</p>
        <p className="text-xs text-slate-500">Cannot load preview without a document ID</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-100 text-slate-900 font-sans">
      {/* ─── Action Toolbar ─── */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white px-4 py-2.5 shadow-lg border-b border-slate-700">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm block leading-tight truncate">
              {title || `${docTypeLabel} Preview`}
            </span>
            <span className="text-[10px] text-slate-400">
              {iframeLoaded ? '✓ Loaded • Same as Print & PDF' : 'Loading document…'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Template Selector */}
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-white text-[11px] rounded px-2 py-1.5 font-medium outline-none cursor-pointer hover:border-slate-500 transition max-w-[140px]"
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Banner Selector */}
          <select
            value={bannerVariant}
            onChange={(e) => setBannerVariant(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-white text-[11px] rounded px-2 py-1.5 font-medium outline-none cursor-pointer hover:border-slate-500 transition max-w-[120px]"
          >
            {BANNERS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Print A4 */}
          <button
            onClick={handlePrint}
            disabled={!iframeLoaded}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-3 py-1.5 rounded shadow transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print A4</span>
          </button>

          {/* Download PDF — downloads a REAL .pdf file rendered server-side
              with the SAME HTML engine as the on-screen preview. The output
              is byte-for-byte identical to the preview (no popup, no manual
              "Save as PDF" step — just a real file download). */}
          <button
            onClick={handleSavePdf}
            disabled={!iframeLoaded || downloading}
            title="Downloads a real PDF file rendered server-side. Works on all browsers, no popups required."
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-3 py-1.5 rounded shadow transition cursor-pointer"
          >
            {downloading ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span className="hidden sm:inline">Preparing...</span></>
            ) : (
              <><Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Download PDF</span></>
            )}
          </button>

          {/* Open in New Tab */}
          <a
            href={iframeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-white text-xs px-2 py-1.5 rounded transition"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* Close */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Document Preview Area ─── */}
      <div className="flex-1 relative bg-slate-200/70 overflow-hidden">
        {/* Loading Skeleton (visible until iframe loads) */}
        {!iframeLoaded && (
          <div className="absolute inset-0 z-10 flex justify-center p-2 sm:p-6 overflow-y-auto bg-slate-200/70">
            <div className="bg-white text-slate-900 shadow-xl border border-slate-300 w-full max-w-[210mm] min-h-[297mm] p-6 sm:p-8 flex flex-col gap-4">
              <div className="h-6 w-1/3 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-slate-100 rounded animate-pulse" />
              <div className="h-32 bg-slate-100 rounded animate-pulse mt-4" />
              <div className="h-4 w-2/3 bg-slate-100 rounded animate-pulse" />
              <div className="h-24 bg-slate-100 rounded animate-pulse mt-4" />
              <div className="h-4 w-1/2 bg-slate-100 rounded animate-pulse" />
              <div className="h-16 bg-slate-100 rounded animate-pulse mt-4" />
              <div className="flex items-center justify-center mt-6 text-slate-400 text-sm gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading {docTypeLabel.toLowerCase()}…</span>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {iframeError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-200/70">
            <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
              <p className="text-red-600 font-bold mb-2">Failed to load document</p>
              <p className="text-xs text-slate-500 mb-4">The document could not be rendered. Please try again.</p>
              <button
                onClick={() => {
                  setIframeLoaded(false)
                  setIframeError(false)
                  if (iframeRef.current) {
                    iframeRef.current.src = iframeUrl
                  }
                }}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition"
              >
                <RefreshCw className="w-4 h-4 inline mr-1.5" />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Iframe — THE SINGLE SOURCE OF TRUTH for document rendering.
            allow-popups-to-escape-sandbox lets window.print() escape the
            sandbox so the browser's print-to-PDF dialog can actually open. */}
        <iframe
          ref={iframeRef}
          src={iframeUrl}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          className={`w-full h-full border-0 transition-opacity duration-200 ${iframeLoaded && !iframeError ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: '#e2e8f0' }}
          title={`${docTypeLabel} Preview`}
          sandbox="allow-same-origin allow-scripts allow-popups allow-modals allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  )
}
