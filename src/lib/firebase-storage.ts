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
 *   3. No extra env vars are required: uploads use the same
 *      `FIREBASE_SERVICE_ACCOUNT_BASE64` or split vars that Firestore uses.
 *      The bucket is auto-detected from the Firebase project; set
 *      `FIREBASE_STORAGE_BUCKET` to override it.
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

/**
 * Client-side image compression before upload.
 *
 * Resizes the image so its longest side is at most `maxDimension` and encodes
 * it as JPEG at `quality`. Returns a data URL (which `fetch()` can read), so
 * callers can turn it back into a File without touching the network. Falls
 * back to the original file's data URL when the browser cannot decode it
 * (e.g. HEIC on older Safari) so uploads still work instead of failing hard.
 */
export async function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.75,
): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('Image compression is only available in the browser')
  }

  const readAsDataUrl = () =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })

  // GIFs lose animation when drawn to a canvas; skip compression for them.
  if (file.type === 'image/gif') return readAsDataUrl()

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Could not decode image'))
      image.src = objectUrl
    })

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height, 1))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not supported')

    // White background so transparent PNGs don't turn black in JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    // Browser could not decode the image (HEIC etc.) — let the server decide
    // whether the original format is acceptable.
    return readAsDataUrl()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
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
