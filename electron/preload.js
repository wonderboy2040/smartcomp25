/**
 * Smart Computers — Electron preload
 *
 * Runs in an isolated context with Node access but exposes only safe APIs
 * to the renderer (the Next.js web page).
 *
 * Exposes:
 *   - smartcomp.platform       -> 'win32' | 'darwin' | 'linux'
 *   - smartcomp.isElectron     -> true
 *   - smartcomp.version        -> app version string
 *   - smartcomp.openExternal(url) -> opens URL in default browser (scheme-validated)
 *   - smartcomp.openLog()      -> opens the next-server.log file in default viewer
 *   - smartcomp.on(channel, cb) -> subscribe to a whitelist of safe IPC channels
 *
 * SECURITY: previously ipcRenderer.on() was exposed without a channel
 * allowlist — any renderer code (including XSS payloads) could listen on
 * any channel and potentially receive sensitive data. Now only channels
 * explicitly listed in SAFE_IPC_CHANNELS can be subscribed to.
 *
 * No file system or shell access is exposed — the Next.js app talks to its
 * own /api/* routes for everything (including writing the runtime config).
 */

const { contextBridge, ipcRenderer, shell } = require('electron')

// Channels the renderer is allowed to subscribe to. Keep this list short.
const SAFE_IPC_CHANNELS = new Set([
  'desktop-notification',
  'update-available',
  'update-downloaded',
])

// URL schemes allowed for openExternal. Prevents file:// and javascript:
// URIs from being handed to the OS shell (which would be a security risk).
const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

function safeOpenExternal(url) {
  try {
    const parsed = new URL(String(url))
    if (!SAFE_URL_SCHEMES.has(parsed.protocol)) {
      console.warn('[preload] refused to open URL with scheme:', parsed.protocol)
      return Promise.resolve(false)
    }
    return shell.openExternal(parsed.toString())
  } catch (e) {
    console.warn('[preload] invalid URL passed to openExternal:', e?.message)
    return Promise.resolve(false)
  }
}

contextBridge.exposeInMainWorld('smartcomp', {
  platform: process.platform,
  isElectron: true,
  version: process.env.npm_package_version || 'unknown',
  openExternal: safeOpenExternal,
  // Open the next-server.log file (used by the error window's "Open Log File" button)
  openLog: () => ipcRenderer.invoke('open-log-file'),
  // Subscribe to IPC messages — only safe-listed channels are allowed.
  on: (channel, cb) => {
    if (!SAFE_IPC_CHANNELS.has(channel)) {
      console.warn('[preload] refused to subscribe to unlisted channel:', channel)
      return () => {}
    }
    const wrapped = (_event, ...args) => cb(...args)
    ipcRenderer.on(channel, wrapped)
    // Return an unsubscribe function so components can clean up on unmount.
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
})
