'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ScanLine, Camera, RefreshCw, ShieldAlert } from 'lucide-react'
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
 *
 * v13.1 FIX: Replaced zxing's internal getUserMedia call with an explicit
 * navigator.mediaDevices.getUserMedia() call FIRST. This ensures the browser
 * shows the camera permission prompt before we try to decode. Previously,
 * zxing's decodeFromVideoDevice would silently fail on permission denial
 * without ever prompting the user.
 *
 * Also handles the case where the Permissions-Policy header blocks camera
 * (the old config had camera=() which blocked all camera access).
 */
export function BarcodeScanner({ onScan, onClose, hint }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')
  const [errorType, setErrorType] = useState<'permission' | 'not-found' | 'policy' | 'generic'>('generic')

  const stop = useCallback(() => {
    try {
      // v13.1: zxing BrowserCodeReader doesn't have reset() — use releaseAllStreams
      const { BrowserMultiFormatReader } = require('@zxing/browser')
      if (BrowserMultiFormatReader?.releaseAllStreams) {
        BrowserMultiFormatReader.releaseAllStreams()
      }
    } catch {}
    // Stop the camera stream explicitly
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function start() {
      try {
        // v13.1: Check if camera API is available at all
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('CAMERA_API_UNAVAILABLE')
        }

        // v13.1: Explicitly request camera permission FIRST.
        // This triggers the browser's native permission prompt.
        // We request the back camera (environment) on mobile.
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        }

        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
        } catch (permErr: any) {
          if (!mounted) return
          if (permErr?.name === 'NotAllowedError' || permErr?.name === 'PermissionDeniedError') {
            setErrorType('permission')
            setErrorMsg('Camera permission was denied. Please allow camera access in your browser settings and try again.')
          } else if (permErr?.name === 'NotFoundError' || permErr?.name === 'OverconstrainedError') {
            setErrorType('not-found')
            setErrorMsg('No camera found on this device.')
          } else if (permErr?.name === 'NotReadableError') {
            setErrorType('permission')
            setErrorMsg('Camera is being used by another app. Close other camera apps and try again.')
          } else {
            setErrorType('generic')
            setErrorMsg(permErr?.message || 'Could not access camera.')
          }
          setStatus('error')
          return
        }

        if (!mounted) {
          // User closed while we were waiting for permission
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        // Store the stream so we can stop it later
        streamRef.current = stream

        // Attach the stream to the video element
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }

        // Now import zxing and start decoding from the video element
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        if (!mounted) {
          try { (BrowserMultiFormatReader as any).releaseAllStreams?.() } catch {}
          return
        }

        setStatus('scanning')

        // Use decodeFromVideoElement — we already have the stream attached
        reader.decodeFromVideoElement(videoRef.current!, (result, err) => {
          if (!mounted) return
          if (result) {
            stop()
            onScan(result.getText())
          }
        })
      } catch (e: any) {
        if (!mounted) return
        const msg = String(e?.message || '')
        if (msg === 'CAMERA_API_UNAVAILABLE') {
          setErrorType('policy')
          setErrorMsg('Camera API not available. This site may need HTTPS or camera access may be blocked by the server.')
        } else {
          setErrorType('generic')
          setErrorMsg(msg || 'Camera not available')
        }
        setStatus('error')
      }
    }

    start()
    return () => {
      mounted = false
      stop()
    }
  }, [onScan, stop])

  const handleRetry = () => {
    stop()
    setStatus('starting')
    setErrorMsg('')
    // Small delay to let cleanup finish
    setTimeout(() => {
      // Re-trigger the effect by re-rendering — we use a trick of
      // toggling a state that's in the dep array
      window.location.reload()
    }, 200)
  }

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
          <div className="p-6 text-center space-y-4">
            {errorType === 'permission' && <ShieldAlert className="w-14 h-14 text-amber-400 mx-auto" />}
            {errorType === 'not-found' && <Camera className="w-14 h-14 text-slate-200 mx-auto" />}
            {errorType === 'policy' && <ShieldAlert className="w-14 h-14 text-red-400 mx-auto" />}
            {errorType === 'generic' && <Camera className="w-14 h-14 text-slate-200 mx-auto" />}
            <p className="text-sm font-semibold text-red-600">{errorMsg}</p>

            {errorType === 'permission' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
                <p className="text-xs font-bold text-amber-800 mb-2">How to fix:</p>
                <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
                  <li><strong>Android Chrome:</strong> Tap the 🔒 lock icon next to the URL → Permissions → Camera → Allow</li>
                  <li><strong>iPhone Safari:</strong> Settings → Safari → Camera → Allow</li>
                  <li><strong>Desktop Chrome:</strong> Click the 🔒 icon → Site settings → Camera → Allow</li>
                  <li>After allowing, <strong>refresh the page</strong> and try again</li>
                </ul>
              </div>
            )}

            {errorType === 'policy' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-left">
                <p className="text-xs font-bold text-red-800 mb-1">Server blocked camera access</p>
                <p className="text-[11px] text-red-700">
                  The server's Permissions-Policy header is blocking camera. Contact your admin to update the header to <code className="bg-white px-1 rounded">camera=(self)</code>
                </p>
              </div>
            )}

            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={handleRetry}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
              </Button>
              <Button size="sm" variant="outline" onClick={() => { stop(); onClose() }}>
                Close
              </Button>
            </div>
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
                <span className="text-slate-400">Starting camera… (allow camera permission if prompted)</span>
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
