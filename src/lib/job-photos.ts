/**
 * Job Photo Upload Utility
 * Handles photo attachments for service jobs
 * Uses base64 encoding for simplicity (Firebase Storage can be added later)
 */

export interface JobPhoto {
  id: string
  url: string // base64 data URL or external URL
  type: 'before' | 'after' | 'damage' | 'repair' | 'other'
  caption?: string
  uploadedAt: string
}

/**
 * Compress and resize image to reduce storage
 * Max dimensions: 1024x1024, quality: 0.8
 */
export async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Resize if needed
        const maxDim = 1024
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = (height / width) * maxDim
            width = maxDim
          } else {
            width = (width / height) * maxDim
            height = maxDim
          }
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        // Convert to JPEG with 80% quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        resolve(dataUrl)
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Upload photo for a job
 * Returns photo object to be stored in job's photosJson field
 */
export async function uploadJobPhoto(
  file: File,
  type: JobPhoto['type'],
  caption?: string
): Promise<JobPhoto> {
  // Validate file
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image')
  }

  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    throw new Error('Image too large (max 10MB)')
  }

  // Compress image
  const dataUrl = await compressImage(file)

  // Create photo object
  const photo: JobPhoto = {
    id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url: dataUrl,
    type,
    caption: caption || '',
    uploadedAt: new Date().toISOString(),
  }

  return photo
}

/**
 * Delete photo from job
 */
export function deleteJobPhoto(photos: JobPhoto[], photoId: string): JobPhoto[] {
  return photos.filter((p) => p.id !== photoId)
}

/**
 * Get photo count by type
 */
export function getPhotoStats(photos: JobPhoto[]): Record<JobPhoto['type'], number> {
  const stats: Record<JobPhoto['type'], number> = {
    before: 0,
    after: 0,
    damage: 0,
    repair: 0,
    other: 0,
  }

  for (const photo of photos) {
    stats[photo.type] = (stats[photo.type] || 0) + 1
  }

  return stats
}

/**
 * TODO: Firebase Storage implementation
 * For production, upload to Firebase Storage instead of base64
 * This reduces database size and improves performance
 */
export async function uploadToFirebaseStorage(
  file: File,
  jobId: string
): Promise<string> {
  // Placeholder for Firebase Storage implementation
  // 1. Import Firebase Storage SDK
  // 2. Upload file to storage bucket: /jobs/{jobId}/{timestamp}_{filename}
  // 3. Get public download URL
  // 4. Return URL
  throw new Error('Firebase Storage not implemented yet')
}
