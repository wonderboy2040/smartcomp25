'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { DocumentHtmlViewer } from '@/components/DocumentHtmlViewer'

interface PreviewState {
  docId: string
  docType: 'invoice' | 'quotation' | 'service'
  title: string
  gstMode?: 'gst' | 'non-gst'
}

interface PreviewApi {
  /** Open the ultra-fast preview panel. Pass docId + docType directly. */
  openPreview: (docId: string, docType?: 'invoice' | 'quotation' | 'service', title?: string, gstMode?: 'gst' | 'non-gst') => void
  /** Fully close the preview panel. */
  closePreview: () => void
  /** Collapse / expand the preview panel (kept for backward compat). */
  toggleCollapse: () => void
}

const PreviewContext = createContext<PreviewApi | null>(null)

const NOOP: PreviewApi = {
  openPreview: () => {},
  closePreview: () => {},
  toggleCollapse: () => {},
}

export function usePdfPreview(): PreviewApi {
  return useContext(PreviewContext) ?? NOOP
}

export function PdfPreviewProvider({ children }: { children: React.ReactNode }) {
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState<boolean>(typeof window !== 'undefined')
  const rafRef = useRef<number>(0)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Cleanup any pending rAF / timeout on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const openPreview = useCallback((docId: string, docType: 'invoice' | 'quotation' | 'service' = 'invoice', title?: string, gstMode?: 'gst' | 'non-gst') => {
    // Parse old-style URL calls for backward compatibility
    // e.g. openPreview('/api/pdf/abc123?type=invoice', 'Invoice INV-001')
    let finalDocId = docId
    let finalDocType = docType
    let finalTitle = title || 'Document Preview'
    let finalGstMode: 'gst' | 'non-gst' = gstMode || 'gst'

    if (docId.startsWith('/api/') || docId.startsWith('http')) {
      try {
        const parsedUrl = new URL(docId, 'http://localhost')
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean)
        finalDocId = pathSegments[pathSegments.length - 1] || docId
        const typeParam = parsedUrl.searchParams.get('type')
        if (typeParam === 'invoice' || typeParam === 'quotation' || typeParam === 'service') {
          finalDocType = typeParam
        }
        const gstModeParam = parsedUrl.searchParams.get('gstMode')
        if (gstModeParam === 'non-gst' || gstModeParam === 'gst') {
          finalGstMode = gstModeParam
        }
      } catch {
        // fallback — use as-is
      }
      // Second argument was title in old API
      if (docType && typeof docType === 'string' && !['invoice', 'quotation', 'service'].includes(docType)) {
        finalTitle = docType as string
        finalDocType = 'invoice'
      }
    }

    if (!finalTitle || finalTitle === 'Document Preview') {
      const typeLabel = finalDocType === 'quotation' ? 'Quotation' : finalDocType === 'service' ? 'Service Invoice' : 'Invoice'
      finalTitle = `${typeLabel} Preview`
    }

    // Instant open — use rAF for single-frame render
    cancelAnimationFrame(rafRef.current)
    setPreview({ docId: finalDocId, docType: finalDocType, title: finalTitle, gstMode: finalGstMode })
    rafRef.current = requestAnimationFrame(() => {
      setVisible(true)
    })
  }, [])

  const closePreview = useCallback(() => {
    setVisible(false)
    // Allow exit animation to complete
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      setPreview(null)
      closeTimerRef.current = null
    }, 150)
  }, [])

  const toggleCollapse = useCallback(() => {
    // Toggle is simplified to close in the new system
    closePreview()
  }, [closePreview])

  // Close on Escape key
  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, closePreview])

  // Prevent body scroll when preview is open
  useEffect(() => {
    if (preview) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [preview])

  const panel = useMemo(() => {
    if (!mounted || !preview) return null
    return createPortal(
      <div
        className={`fixed inset-0 z-[100] flex flex-col transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
        style={{ willChange: 'opacity', backgroundColor: 'rgba(15,23,42,0.82)', backdropFilter: 'blur(4px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) closePreview() }}
      >
        <div className="flex-1 w-full max-w-5xl mx-auto my-0 sm:my-3 bg-white shadow-2xl rounded-none sm:rounded-xl overflow-hidden flex flex-col border border-slate-700">
          <DocumentHtmlViewer
            key={`${preview.docId}:${preview.docType}:${preview.gstMode || 'gst'}`}
            docId={preview.docId}
            docType={preview.docType}
            title={preview.title}
            onClose={closePreview}
            gstMode={preview.gstMode}
          />
        </div>
      </div>,
      document.body
    )
  }, [mounted, preview, visible, closePreview])

  return (
    <PreviewContext.Provider value={{ openPreview, closePreview, toggleCollapse }}>
      {children}
      {panel}
    </PreviewContext.Provider>
  )
}
