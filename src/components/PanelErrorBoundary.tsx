'use client'

import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: React.ReactNode
  panelId: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Per-panel error boundary.
 *
 * Why: Without this, a single bad row in any Google Sheet (e.g. malformed
 * JSON in partsUsedJson) would crash the entire HomeInner tree and kick
 * the user out of every panel via the global error boundary.
 *
 * Wraps each <PanelBoundary> child. On error, shows a local "this panel
 * failed" UI with a retry button — other panels stay alive.
 */
export class PanelErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to /api/log-error (non-blocking, best-effort)
    try {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[Panel:${this.props.panelId}] ${error.message}`,
          stack: error.stack,
          url: window.location.href,
          time: new Date().toISOString(),
        }),
      }).catch(() => {})
    } catch {}
    console.error(`[Panel:${this.props.panelId}]`, error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="font-semibold text-red-900 dark:text-red-100 mb-1">
              Panel failed to load
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mb-4 break-words">
              {this.state.error?.message || 'An unexpected error occurred in this panel.'}
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
