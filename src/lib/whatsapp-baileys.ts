/**
 * WhatsApp Baileys Connection Manager — Real WhatsApp Web QR Login
 *
 * Uses @whiskeysockets/baileys to create a REAL WhatsApp Web session.
 * The QR code generated here is a genuine WhatsApp pairing code that
 * the phone app recognises when scanning via:
 *   WhatsApp → Settings → Linked Devices → Link a Device
 *
 * This module uses a custom IN-MEMORY auth state (no file I/O) so it
 * works in serverless/container environments where the filesystem is
 * read-only or ephemeral.
 *
 * IMPORTANT: Baileys maintains a persistent WebSocket connection to
 * WhatsApp servers. This only works in a long-lived Node.js process
 * (next dev / next start / Electron). It will NOT work on Vercel
 * serverless functions (they freeze between requests).
 *
 * For production deployment, run this app on a VPS, Render, Railway,
 * or as an Electron desktop app — NOT on Vercel/Netlify serverless.
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
  type AuthenticationState,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import { Boom } from '@hapi/boom'
import fs from 'node:fs'
import path from 'node:path'

// ===== Logger (minimal, no Pino dependency) =====
const logger = {
  level: 'silent',
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => logger,
}

// ===== Connection State =====
type ConnectionState = 'disconnected' | 'connecting' | 'waiting_qr' | 'connected' | 'error'

interface BaileysSession {
  state: ConnectionState
  qrCode: string | null      // QR code as data URL (image)
  qrRetry: number
  phoneNumber: string | null
  connectedAt: number | null
  error: string | null
  socket: WASocket | null
  lastEvent: string | null
}

let session: BaileysSession = {
  state: 'disconnected',
  qrCode: null,
  qrRetry: 0,
  phoneNumber: null,
  connectedAt: null,
  error: null,
  socket: null,
  lastEvent: null,
}

const listeners = new Set<(s: BaileysSession) => void>()

function notifyListeners() {
  const snapshot = { ...session }
  for (const fn of listeners) {
    try { fn(snapshot) } catch {}
  }
}

export function onStateChange(fn: (s: BaileysSession) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getState(): BaileysSession {
  return { ...session }
}

// ===== File-based Auth State (persists session across restarts) =====
// Creates a .wa-auth directory in the project root. Baileys stores
// session credentials here so you don't need to re-scan QR on every
// restart. Works on local dev, VPS, Render, Railway, Electron.
async function useFileAuthState(): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const authDir = path.join(process.cwd(), '.wa-auth')
  try {
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true })
    }
  } catch {
    // Directory creation failed — try /tmp as fallback
    const tmpDir = '/tmp/wa-auth-smartcomp'
    try {
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
      return await useMultiFileAuthState(tmpDir)
    } catch {
      throw new Error('Cannot create auth directory. Check filesystem permissions.')
    }
  }
  return await useMultiFileAuthState(authDir)
}

/**
 * Start the Baileys WhatsApp connection.
 * Generates a real QR code that the phone app can scan.
 */
export async function startWhatsAppConnection(): Promise<{ qrCode: string | null; state: ConnectionState; error?: string }> {
  // If already connected, return current state
  if (session.state === 'connected' && session.socket) {
    return { qrCode: null, state: 'connected' }
  }

  // If already connecting/waiting for QR, return current QR
  if (session.state === 'connecting' || session.state === 'waiting_qr') {
    return { qrCode: session.qrCode, state: session.state }
  }

  // Disconnect old socket if any
  if (session.socket) {
    try { await session.socket.end(undefined) } catch {}
    session.socket = null
  }

  session.state = 'connecting'
  session.error = null
  session.qrCode = null
  session.lastEvent = 'starting'
  notifyListeners()

  try {
    // Use file-based auth (persists session across restarts)
    const { state: authState, saveCreds } = await useFileAuthState()
    session.lastEvent = 'auth:ready'

    const sock = makeWASocket({
      auth: authState,
      printQRInTerminal: false,
      browser: ['SmartComp', 'Chrome', '1.0.0'],
      connectTimeoutMs: 30000,
      defaultQueryTimeoutMs: 30000,
      logger: logger as any,
      // Reduce noise
      markOnlineOnConnect: false,
      retryRequestDelayMs: 2000,
    })

    session.socket = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update: any) => {
      // Stale-event guard: if this socket is no longer the active one (because
      // the user called disconnectWhatsApp / startWhatsAppConnection again),
      // discard the event so we don't clobber the NEW session's state.
      if (sock !== session.socket) return

      const { connection, lastDisconnect, qr } = update

      if (qr) {
        session.lastEvent = 'qr_received'
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
          // Re-check after await — socket may have been replaced during the async gap.
          if (sock !== session.socket) return
          session.qrCode = qrDataUrl
          session.qrRetry += 1
          session.state = 'waiting_qr'
          notifyListeners()
        } catch {
          if (sock !== session.socket) return
          session.lastEvent = 'qr_error'
          session.error = 'Failed to generate QR image'
        }
      }

      if (connection === 'open') {
        if (sock !== session.socket) return
        session.lastEvent = 'connected'
        session.state = 'connected'
        session.qrCode = null
        session.connectedAt = Date.now()
        try {
          const user = sock.user
          if (user?.id) {
            session.phoneNumber = user.id.split('@')[0]
          }
        } catch {}
        notifyListeners()
      }

      if (connection === 'close') {
        // Stale-event guard — if this socket is no longer active, ignore the close event.
        if (sock !== session.socket) return

        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
        session.lastEvent = `closed:${statusCode}`

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          session.state = 'disconnected'
          session.socket = null
          session.qrCode = null
          session.phoneNumber = null
          session.connectedAt = null
          session.error = 'Logged out from WhatsApp'
          notifyListeners()
        } else if (statusCode === 515) {
          // Restart — reconnect automatically
          session.state = 'connecting'
          notifyListeners()
          setTimeout(() => startWhatsAppConnection().catch(() => {}), 2000)
        } else if (statusCode === 410) {
          // Connection lost
          session.state = 'disconnected'
          session.socket = null
          session.qrCode = null
          session.error = 'Connection lost. Please reconnect.'
          notifyListeners()
        } else {
          // Other close reason
          session.state = 'disconnected'
          session.socket = null
          session.qrCode = null
          session.error = `Connection closed (code ${statusCode})`
          notifyListeners()
        }
      }

      if (connection === 'connecting') {
        if (sock !== session.socket) return
        session.lastEvent = 'ws_connecting'
        notifyListeners()
      }
    })

    // Listen for incoming messages (for auto rate-capture)
    sock.ev.on('messages.upsert', async (messageUpdate: any) => {
      try {
        for (const msg of messageUpdate.messages || []) {
          const text = msg?.message?.conversation ||
                       msg?.message?.extendedTextMessage?.text ||
                       msg?.message?.imageMessage?.caption ||
                       ''
          if (text) {
            capturedMessages.push({
              from: msg.key?.remoteJid || '',
              fromMe: msg.key?.fromMe || false,
              text,
              timestamp: Date.now(),
            })
            if (capturedMessages.length > 100) {
              capturedMessages.shift()
            }
          }
        }
      } catch {}
    })

    return { qrCode: session.qrCode, state: session.state }
  } catch (e: any) {
    session.state = 'error'
    session.error = e?.message || 'Failed to start WhatsApp connection'
    session.lastEvent = 'init_error'
    notifyListeners()
    return { qrCode: null, state: 'error', error: session.error ?? undefined }
  }
}

/**
 * Disconnect from WhatsApp and fully clear the local session.
 *
 * Calls Baileys' built-in `logout()` (which deletes the local auth files
 * from the .wa-auth directory) before resetting in-memory state. Without
 * this call, the next `startWhatsAppConnection` would silently auto-reconnect
 * using the stored credentials and never show a fresh QR — confusing the user.
 *
 * Falls back to a manual `fs.rmSync(.wa-auth, { recursive: true, force: true })`
 * if `sock.logout()` throws or if the socket is already gone (e.g., the
 * connection died before this call).
 */
export async function disconnectWhatsApp(): Promise<void> {
  const oldSocket = session.socket
  if (oldSocket) {
    try {
      // Baileys logout — clears local auth files server-side AND notifies
      // WhatsApp servers to invalidate the linked-device session.
      await oldSocket.logout()
    } catch (e) {
      // Likely "socket already closed" — fall through to manual cleanup.
      console.warn('[wa] sock.logout() failed, falling back to manual cleanup:', e)
    }
    try { await oldSocket.end(undefined) } catch {}
  }

  // Manual fallback — make sure the .wa-auth dir is gone regardless of
  // whether sock.logout() ran successfully.
  const authDir = path.join(process.cwd(), '.wa-auth')
  const tmpAuthDir = '/tmp/wa-auth-smartcomp'
  for (const dir of [authDir, tmpAuthDir]) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    } catch (e) {
      console.warn(`[wa] failed to remove auth dir ${dir}:`, e)
    }
  }

  session = {
    state: 'disconnected',
    qrCode: null,
    qrRetry: 0,
    phoneNumber: null,
    connectedAt: null,
    error: null,
    socket: null,
    lastEvent: 'disconnected',
  }
  capturedMessages.length = 0
  notifyListeners()
}

// ===== Captured Messages =====
export interface CapturedMessage {
  from: string
  fromMe: boolean
  text: string
  timestamp: number
}
export const capturedMessages: CapturedMessage[] = []

export function getCapturedMessages(limit = 50): CapturedMessage[] {
  return capturedMessages.slice(-limit)
}
