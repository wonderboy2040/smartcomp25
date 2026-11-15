/**
 * Firebase Storage helper — uploads job photos and other small files.
 *
 * Uses the SAME Firebase project as Firestore via a lightweight client-side
 * SDK upload. The file is posted to a Node API route (`/api/storage/upload`)
 * so the service-account credentials never reach the browser.
 *
 * SETUP:
 *   1. In Firebase Console → Storage → Get Started.
 *   2. Set security rules to allow authenticated server uploads:
 *        rules_version = '2';
 *        service firebase.storage {
 *          match /b/{bucket}/o {
 *            match /{allPaths=**} {
 *              allow read, write: if request.auth != null;
 *            }
 *          }
 *        }
 *   3. No env vars needed — uploads use the same `FIREBASE_SERVICE_ACCOUNT_BASE64`
 *      or split vars that Firestore uses. The storage bucket name is read from
 *      the decoded service-account JSON.
 */

const MAX_PHOTO_SIZE = 10 * 1024 * 1024 // 10 MB per photo
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export interface UploadResult {
  path: string
  downloadURL: string
  sizeBytes: number
  contentType: string
}

export function validatePhotoFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Only image files are allowed'
  if (file.size > MAX_PHOTO_SIZE) return `File too large (max ${MAX_PHOTO_SIZE / 1024 / 1024} MB)`
  if (!ALLOWED_TYPES.includes(file.type)) return 'Unsupported format. Use JPG, PNG or WebP'
  return null
}

export async function uploadJobPhoto(file: File, jobId: string, type: 'before' | 'after' | 'damage' | 'repair' | 'other'): Promise<UploadResult> {
  const error = validatePhotoFile(file)
  if (error) throw new Error(error)

  const form = new FormData()
  form.append('file', file)
  form.append('jobId', jobId)
  form.append('type', type)

  const res = await fetch('/api/storage/upload', {
    method: 'POST',
    body: form,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Upload failed')
  }
  return data as UploadResult
}

export async function deleteJobPhoto(path: string): Promise<void> {
  const res = await fetch('/api/storage/upload', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Delete failed')
  }
}

export async function getSignedDownloadUrl(path: string): Promise<string> {
  const res = await fetch(`/api/storage/upload?path=${encodeURIComponent(path)}&download=1`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.downloadURL) {
    throw new Error(data?.error || 'Failed to get download URL')
  }
  return String(data.downloadURL)
}
