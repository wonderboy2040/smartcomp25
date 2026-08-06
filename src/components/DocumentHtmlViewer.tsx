'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Printer, Download, X, FileText, RefreshCw, ExternalLink } from 'lucide-react'

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
    // Timeout for slow loads
    loadTimerRef.current = setTimeout(() => {
      if (!iframeLoaded) {
        // Still show iframe even if load event didn't fire (for cached responses)
        setIframeLoaded(true)
      }
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

  // PDF download URL
  const pdfDownloadUrl = docId
    ? `/api/pdf/${encodeURIComponent(docId)}?type=${docType}&template=${templateId}&banner=${bannerVariant}&gstMode=${gstMode}`
    : ''

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

          {/* Download PDF */}
          <a
            href={pdfDownloadUrl}
            download={`${docTypeLabel}-${docId}.pdf`}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-medium px-3 py-1.5 rounded transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </a>

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

        {/* Iframe — THE SINGLE SOURCE OF TRUTH for document rendering */}
        <iframe
          ref={iframeRef}
          src={iframeUrl}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          className={`w-full h-full border-0 transition-opacity duration-200 ${iframeLoaded && !iframeError ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: '#e2e8f0' }}
          title={`${docTypeLabel} Preview`}
          sandbox="allow-same-origin allow-scripts allow-popups allow-modals"
        />
      </div>
    </div>
  )
}
