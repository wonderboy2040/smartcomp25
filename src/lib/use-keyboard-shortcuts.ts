/**
 * v13 NEW: Global keyboard shortcuts hook.
 *
 * Usage:
 *   import { useKeyboardShortcuts } from '@/lib/use-keyboard-shortcuts'
 *   useKeyboardShortcuts({ onNavigate: (panel) => setPanel(panel) })
 *
 * Shortcuts:
 *   Ctrl+K / Cmd+K  → Command Center (already exists)
 *   Ctrl+N          → New Invoice (or active panel's "new" action)
 *   Ctrl+S          → Save (contextual — if a form is open)
 *   Ctrl+P          → Print (calls window.print() if no specific target)
 *   Ctrl+F / /      → Focus search bar in current panel
 *   Ctrl+,          → Open Settings
 *   Ctrl+D          → Dashboard
 *   Esc             → Close any open dialog/modal
 *
 * Notes:
 *   - Skips shortcuts when input/textarea/contentEditable is focused (except Esc)
 *   - Respects browser-native shortcuts (Ctrl+S, Ctrl+P fall through if needed)
 *   - ⌘K is intentionally NOT registered here — it's handled by CommandCenter
 */

import { useEffect } from 'react'

export interface ShortcutHandlers {
  onCommandCenter?: () => void
  onNew?: () => void
  onSave?: () => void
  onPrint?: () => void
  onSearch?: () => void
  onSettings?: () => void
  onDashboard?: () => void
  onEsc?: () => void
}

function isFormElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers, deps: any[] = []) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      // Esc always works (even in inputs)
      if (key === 'escape') {
        handlers.onEsc?.()
        return
      }

      // v13.1 fix: previously ALL shortcuts were skipped when typing in a
      // form field. That meant Ctrl+S (which the user presses INSIDE a form
      // to save it) never fired — defeating the whole point of the shortcut.
      // Now we only skip shortcuts that would conflict with form input
      // (single-char shortcuts like `/`), but explicitly allow modifier-key
      // shortcuts (Ctrl+S, Ctrl+P, Ctrl+N) inside forms because those are
      // the actions the user wants when editing a form.
      const inForm = isFormElement(e.target)
      if (inForm) {
        // Inside a form, only allow Ctrl/Cmd-prefixed shortcuts. Single-key
        // '/' would type into the field — skip it.
        if (!ctrl) return
        // Fall through to the modifier-key shortcut handling below.
      }

      if (ctrl && key === 'k') {
        e.preventDefault()
        handlers.onCommandCenter?.()
      } else if (ctrl && key === 'n') {
        e.preventDefault()
        handlers.onNew?.()
      } else if (ctrl && key === 's') {
        // v13.1: when inside a form, preventDefault so the browser doesn't
        // also trigger its native save-page dialog (which is meaningless in
        // an SPA form context). Outside a form, let the browser do its thing.
        if (inForm) e.preventDefault()
        handlers.onSave?.()
      } else if (ctrl && key === 'p') {
        // Let browser print unless handler explicitly prevents
        if (handlers.onPrint) {
          handlers.onPrint()
        }
      } else if (ctrl && key === 'f') {
        e.preventDefault()
        handlers.onSearch?.()
      } else if (!ctrl && key === '/') {
        // Single-key '/' for search — only when NOT in a form
        e.preventDefault()
        handlers.onSearch?.()
      } else if (ctrl && key === ',') {
        e.preventDefault()
        handlers.onSettings?.()
      } else if (ctrl && key === 'd') {
        // Ctrl+D reserved by browser (bookmark) — use Ctrl+Shift+D instead
        if (e.shiftKey) {
          e.preventDefault()
          handlers.onDashboard?.()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line
  }, deps)
}

export const KEYBOARD_SHORTCUTS_REFERENCE = [
  { keys: 'Ctrl+K', description: 'Open Command Center (universal search + voice)' },
  { keys: 'Ctrl+N', description: 'Create new item (invoice / quote / job — context-aware)' },
  { keys: 'Ctrl+S', description: 'Save current form (works in DocForm / Customers / etc.)' },
  { keys: 'Ctrl+P', description: 'Print current view or document' },
  { keys: 'Ctrl+F or /', description: 'Focus search bar in current panel' },
  { keys: 'Ctrl+,', description: 'Open Settings panel' },
  { keys: 'Ctrl+Shift+D', description: 'Go to Dashboard' },
  { keys: 'Esc', description: 'Close dialog / modal / panel' },
]
