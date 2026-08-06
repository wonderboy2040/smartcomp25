import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

/**
 * Server-only helper that loads the Smart Computers product showcase
 * images (Computers, Laptops, Printers, Accessories, Flyer, Product Grid, Logo) from /public
 * and compresses them to JPEG format.
 *
 * HIGH-QUALITY size budget (target PDF 150-250 KB total):
 *   - logo        ~8-12 KB    (180px @ q82 — crisp logo for header)
 *   - flyer/grid  ~70-90 KB   (1100px @ q72 — full-width banner, HIGH quality)
 *   - products    ~15-25 KB ea (450px @ q68 — used in featured/strip variants, HIGH quality)
 *   - QR code     ~3-5 KB     (added separately in pdf.ts as PNG)
 *   - jsPDF overhead ~25-35 KB
 *   ─────────────────────
 *   Flyer variant total: ~110-140 KB (logo + flyer + QR + overhead)
 *   Featured variant total: ~180-250 KB (logo + 4 products + QR + overhead)
 *   Both within the 150-250 KB target range with HIGH quality images.
 */

export interface ProductImageSet {
  computers: string
  laptop: string
  printers: string
  accessories: string
  flyer?: string
  productgrid?: string
  logo?: string
}

let CACHE: ProductImageSet | null = null

async function readAndCompressImage(searchDirs: string[], baseName: string, maxWidth = 1000, quality = 70): Promise<string> {
  const extensions = ['.webp', '.png', '.jpg', '.jpeg']
  for (const dir of searchDirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, baseName + ext)
      if (fs.existsSync(fullPath)) {
        try {
          const buf = fs.readFileSync(fullPath)
          try {
            // Compress image with sharp to JPEG format.
            // mozjpeg gives ~10-15% smaller files at same quality vs libjpeg.
            // chromaSubsampling '4:2:0' is standard for photos (eye is less
            // sensitive to chroma). For sharp text/logos, '4:4:4' is better
            // but ~30% larger — we use 4:2:0 for size, quality is still high.
            const compressed = await sharp(buf)
              .resize({ width: maxWidth, withoutEnlargement: true })
              .jpeg({
                quality,
                progressive: true,
                mozjpeg: true,
                chromaSubsampling: '4:2:0',
              })
              .toBuffer()
            return `data:image/jpeg;base64,${compressed.toString('base64')}`
          } catch {
            const mime = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg'
            return `data:${mime};base64,${buf.toString('base64')}`
          }
        } catch {}
      }
    }
  }
  return ''
}

export async function loadProductImages(): Promise<ProductImageSet> {
  if (CACHE) return CACHE

  const publicDir = path.join(process.cwd(), 'public')
  const postersDir = path.join(publicDir, 'posters')

  // HIGH QUALITY image compression (target PDF 150-250 KB):
  // - Flyer/Grid banner: 1300px @ q85 → ~140-160 KB (sharp, detailed banner)
  // - Product tiles: 550px @ q75 → ~25-35 KB each (clear product photos)
  // - Logo: 220px @ q88 → ~12-16 KB (crisp header logo)
  // Total PDF for flyer variant: ~170-200 KB (logo + flyer + QR + overhead)
  // Total PDF for featured variant: ~200-250 KB (logo + 4 products + QR + overhead)
  const [computers, laptop, printers, accessories, flyer, productgrid, logo] = await Promise.all([
    readAndCompressImage([postersDir], 'gaming-pc', 550, 75).catch(() => ''),
    readAndCompressImage([postersDir], 'laptop-sale', 550, 75).catch(() => ''),
    readAndCompressImage([postersDir], 'printer-offer', 550, 75).catch(() => ''),
    readAndCompressImage([postersDir], 'accessories', 550, 75).catch(() => ''),
    readAndCompressImage([postersDir], 'smartcomputers-a4-flyer-landscape', 1300, 85).catch(() => ''),
    readAndCompressImage([postersDir], 'smartcomputers-product-grid', 1300, 85).catch(() => ''),
    readAndCompressImage([publicDir], 'logo', 220, 88).catch(() => ''),
  ])

  const result: ProductImageSet = {
    computers: computers || '',
    laptop: laptop || '',
    printers: printers || '',
    accessories: accessories || '',
    flyer: flyer || '',
    productgrid: productgrid || '',
    logo: logo || '',
  }
  CACHE = result
  return result
}

