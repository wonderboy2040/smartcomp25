/**
 * Google Drive Backup Service (v12.8)
 *
 * Uploads daily JSON backups of the entire Firestore database to Google Drive.
 *
 * SETUP (one-time):
 *   1. Create a Google Cloud project → enable "Google Drive API".
 *   2. Create an OAuth 2.0 Service Account (or a Desktop app OAuth client).
 *   3. For a Service Account:
 *        - Download the JSON key.
 *        - Share the target Drive folder with the service account's email
 *          (e.g. smartcomp-backup@my-project.iam.gserviceaccount.com).
 *   4. Set env vars:
 *        GDRIVE_CLIENT_EMAIL    — the service account email
 *        GDRIVE_PRIVATE_KEY     — the private key (PEM, with literal \n)
 *        GDRIVE_FOLDER_ID       — the ID of the target Drive folder (from its URL)
 *   5. (Optional) Set GDRIVE_RETENTION_DAYS=30 — auto-deletes backups older
 *        than 30 days from Drive to prevent unbounded growth.
 *
 * FLOW:
 *   - /api/cron/backup fires daily at 2am (configured in vercel.json + render.yaml).
 *   - It calls exportAllDataForBackup() → uploads JSON to Drive.
 *   - The Drive file is named `smartcomp-backup-YYYY-MM-DD.json`.
 *   - The route is protected by CRON_SECRET.
 *
 * If GDRIVE_* env vars are not set, the route logs a warning and skips the
 * Drive upload — the backup still gets exported (and the response includes
 * the JSON size + row counts), but it's not persisted anywhere.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const JWT_AUDIENCE = 'https://oauth2.googleapis.com/token'
const JWT_SCOPE = 'https://www.googleapis.com/auth/drive.file'

interface CachedToken {
  token: string
  expiresAt: number
}
let cachedToken: CachedToken | null = null

interface EnvConfig {
  clientEmail: string
  privateKey: string
  folderId: string
  retentionDays: number
}

function getDriveConfig(): EnvConfig | null {
  const clientEmail = process.env.GDRIVE_CLIENT_EMAIL
  const privateKey = process.env.GDRIVE_PRIVATE_KEY
  const folderId = process.env.GDRIVE_FOLDER_ID
  if (!clientEmail || !privateKey || !folderId) return null
  const retentionDays = Math.max(1, Number(process.env.GDRIVE_RETENTION_DAYS) || 30)
  return { clientEmail, privateKey, folderId, retentionDays }
}

export function isGoogleDriveConfigured(): boolean {
  return getDriveConfig() !== null
}

function base64UrlEncode(s: string): string {
  return Buffer.from(s)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Build a signed JWT for the Google OAuth2 service-account flow.
 * We sign it ourselves with the Web Crypto API so we don't need the
 * `google-auth-library` dependency (saves ~2MB in the bundle).
 */
async function signJwt(payload: any, privateKeyPem: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  // Parse the PEM private key into a CryptoKey.
  // The PEM looks like:
  //   -----BEGIN PRIVATE KEY-----
  //   <base64>
  //   -----END PRIVATE KEY-----
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  // Convert base64 → ArrayBuffer
  const binaryDer = Uint8Array.from(Buffer.from(pemBody, 'base64'))

  // Use Node's crypto.subtle (available in Node 18+).
  const { subtle } = (await import('crypto')).webcrypto
  const cryptoKey = await subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    Buffer.from(signingInput),
  )

  const encodedSignature = Buffer.from(signature)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return `${signingInput}.${encodedSignature}`
}

/**
 * Get an OAuth2 access token for the service account.
 * Cached until 60s before expiry.
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token
  }

  const cfg = getDriveConfig()
  if (!cfg) throw new Error('Google Drive env vars not configured')

  const now = Math.floor(Date.now() / 1000)
  const jwtPayload = {
    iss: cfg.clientEmail,
    scope: JWT_SCOPE,
    aud: JWT_AUDIENCE,
    exp: now + 3600,
    iat: now,
  }

  // The private key env var typically has literal "\n" escapes — unescape them.
  const privateKeyPem = cfg.privateKey.replace(/\\n/g, '\n')
  const jwt = await signJwt(jwtPayload, privateKeyPem)

  const resp = await fetch(JWT_AUDIENCE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.access_token) {
    throw new Error(`Google OAuth failed: ${data.error_description || data.error || `HTTP ${resp.status}`}`)
  }

  cachedToken = {
    token: String(data.access_token),
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  }
  return cachedToken.token
}

/**
 * Upload a JSON backup to Google Drive.
 *
 * Uses Drive's "multipart upload" API — sends metadata (filename, parent
 * folder) + file content in a single multipart/form-data POST.
 *
 * Returns the Drive file ID + URL.
 */
export async function uploadBackupToDrive(
  jsonData: any,
  filename: string,
): Promise<{ fileId: string; webViewLink: string; sizeBytes: number }> {
  const cfg = getDriveConfig()
  if (!cfg) throw new Error('Google Drive env vars not configured')

  const token = await getAccessToken()
  const jsonStr = JSON.stringify(jsonData)
  const sizeBytes = Buffer.byteLength(jsonStr, 'utf-8')

  // Build multipart/related body per Drive API docs.
  const boundary = 'smartcomp_backup_boundary_' + Math.random().toString(36).slice(2)
  const metadata = JSON.stringify({
    name: filename,
    parents: [cfg.folderId],
    mimeType: 'application/json',
  })

  const parts: Buffer[] = []
  parts.push(Buffer.from(`--${boundary}\r\n`))
  parts.push(Buffer.from('Content-Type: application/json; charset=UTF-8\r\n\r\n'))
  parts.push(Buffer.from(metadata))
  parts.push(Buffer.from('\r\n'))
  parts.push(Buffer.from(`--${boundary}\r\n`))
  parts.push(Buffer.from('Content-Type: application/json\r\n\r\n'))
  parts.push(Buffer.from(jsonStr))
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  const body = Buffer.concat(parts)

  const resp = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': body.length.toString(),
    },
    body,
  })

  const data = await resp.json()
  if (!resp.ok || !data.id) {
    throw new Error(`Drive upload failed: ${data.error?.message || `HTTP ${resp.status}`}`)
  }

  return {
    fileId: String(data.id),
    webViewLink: String(data.webViewLink || ''),
    sizeBytes,
  }
}

/**
 * List backups in the Drive folder, optionally deleting ones older than
 * GDRIVE_RETENTION_DAYS. Called after every upload so retention is
 * always enforced.
 *
 * Returns the count of deleted + remaining backups.
 */
export async function cleanupOldBackups(): Promise<{ deleted: number; remaining: number }> {
  const cfg = getDriveConfig()
  if (!cfg) return { deleted: 0, remaining: 0 }

  const token = await getAccessToken()
  const cutoff = Date.now() - cfg.retentionDays * 24 * 60 * 60 * 1000

  // List all files in the folder.
  const listUrl = new URL(`${DRIVE_API}/files`)
  listUrl.searchParams.set('q', `'${cfg.folderId}' in parents and trashed=false`)
  listUrl.searchParams.set('fields', 'files(id,name,modifiedTime,size)')
  listUrl.searchParams.set('pageSize', '200')
  listUrl.searchParams.set('orderBy', 'modifiedTime desc')

  const resp = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await resp.json()
  if (!resp.ok) {
    throw new Error(`Drive list failed: ${data.error?.message || `HTTP ${resp.status}`}`)
  }

  const files: Array<{ id: string; name: string; modifiedTime: string }> = data.files || []
  let deleted = 0
  let remaining = 0

  for (const file of files) {
    const mtime = new Date(file.modifiedTime).getTime()
    if (mtime < cutoff) {
      // Delete old backup
      try {
        await fetch(`${DRIVE_API}/files/${file.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        deleted++
      } catch {
        // Best-effort — continue even if a single delete fails.
      }
    } else {
      remaining++
    }
  }

  return { deleted, remaining }
}

/**
 * List recent backups (for display in the Backup panel UI).
 */
export async function listBackups(limit = 20): Promise<Array<{
  id: string
  name: string
  modifiedTime: string
  sizeBytes: number
  webViewLink: string
}>> {
  const cfg = getDriveConfig()
  if (!cfg) return []

  const token = await getAccessToken()
  const listUrl = new URL(`${DRIVE_API}/files`)
  listUrl.searchParams.set('q', `'${cfg.folderId}' in parents and trashed=false`)
  listUrl.searchParams.set('fields', 'files(id,name,modifiedTime,size,webViewLink)')
  listUrl.searchParams.set('pageSize', String(Math.min(100, limit)))
  listUrl.searchParams.set('orderBy', 'modifiedTime desc')

  const resp = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await resp.json()
  if (!resp.ok) {
    throw new Error(`Drive list failed: ${data.error?.message || `HTTP ${resp.status}`}`)
  }

  const files = (data.files || []) as Array<any>
  return files.slice(0, limit).map((f) => ({
    id: String(f.id),
    name: String(f.name || ''),
    modifiedTime: String(f.modifiedTime || ''),
    sizeBytes: Number(f.size) || 0,
    webViewLink: String(f.webViewLink || ''),
  }))
}

/**
 * Download a specific backup file's content (JSON).
 * Used by the Restore UI to preview + restore from a Drive backup.
 */
export async function downloadBackup(fileId: string): Promise<any> {
  const cfg = getDriveConfig()
  if (!cfg) throw new Error('Google Drive env vars not configured')

  const token = await getAccessToken()
  const resp = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(`Drive download failed: ${err?.error?.message || `HTTP ${resp.status}`}`)
  }
  return await resp.json()
}
