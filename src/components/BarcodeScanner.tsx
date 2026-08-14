'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ScanLine, Camera, Flashlight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BarcodeScannerProps {
  /** Called with the decoded text when a barcode/QR is found */
  onScan: (text: string) => void
  onClose: () => void
  /** Label shown below the viewfinder */
  hint?: string
}

/**
 * Full-screen camera scanner using @zxing/browser (already installed).
 * Dynamically imported to keep it out of the SSR bundle.
 * Prefers the back/environment camera on mobile devices.
 */
export function BarcodeScanner({ onScan, onClose, hint }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<any>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')

  const stop = useCallback(() => {
    try { readerRef.current?.reset() } catch {}
  }, [])

  useEffect(() => {
    let mounted = true

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (!devices.length) throw new Error('No camera found on this device')

        // Prefer rear/environment camera
        const back = devices.find((d) =>
          /back|rear|environment/i.test(d.label),
        )
        const deviceId = back?.deviceId || devices[devices.length - 1]?.deviceId

        if (!mounted) return
        setStatus('scanning')

        await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, err) => {
            if (!mounted) return
            if (result) {
              stop()
              onScan(result.getText())
            }
          },
        )
      } catch (e: any) {
        if (!mounted) return
        const msg =
          e?.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access and try again.'
            : e?.message || 'Camera not available'
        setErrorMsg(msg)
        setStatus('error')
      }
    }

    start()
    return () => {
      mounted = false
      stop()
    }
  }, [onScan, stop])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900">
          <div className="flex items-center gap-2 text-white">
            <ScanLine className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold">Scan Barcode / QR Code</span>
          </div>
          <button
            onClick={() => { stop(); onClose() }}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder */}
        {status === 'error' ? (
          <div className="p-8 text-center space-y-3">
            <Camera className="w-14 h-14 text-slate-200 mx-auto" />
            <p className="text-sm font-semibold text-red-600">{errorMsg}</p>
            <p className="text-xs text-slate-400">
              On Chrome/Android: tap the lock icon → Permissions → Camera → Allow
            </p>
            <Button size="sm" variant="outline" onClick={() => { stop(); onClose() }}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="relative bg-black" style={{ aspectRatio: '1/1' }}>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                autoPlay
              />
              {/* Corner frame overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-52 h-52">
                  {/* Corners */}
                  <span className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-emerald-400 rounded-tl-md" />
                  <span className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-emerald-400 rounded-tr-md" />
                  <span className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-emerald-400 rounded-bl-md" />
                  <span className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-emerald-400 rounded-br-md" />
                  {/* Animated scan line */}
                  <span className="absolute inset-x-2 h-0.5 bg-emerald-400/80 rounded animate-bounce" style={{ top: '50%' }} />
                </div>
              </div>
              {/* Dim edges */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ boxShadow: 'inset 0 0 60px 30px rgba(0,0,0,0.55)' }} />
            </div>
            <div className="px-4 py-3 text-center text-xs text-slate-500 bg-slate-50">
              {status === 'starting' ? (
                <span className="text-slate-400">Starting camera…</span>
              ) : (
                hint || 'Point at barcode, QR code, or serial number label'
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
