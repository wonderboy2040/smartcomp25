#!/usr/bin/env node
/**
 * Generate PWA icons from public/icon.svg using sharp.
 * Outputs: icon-192.png, icon-512.png, icon-1024.png, apple-touch-icon.png, favicon.ico
 */
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const PUB = path.join(__dirname, '..', 'public')
const SRC = path.join(PUB, 'icon.svg')

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Source SVG not found:', SRC)
    process.exit(1)
  }
  const svg = fs.readFileSync(SRC)

  const targets = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'icon-1024.png', size: 1024 },
    { name: 'apple-touch-icon.png', size: 180 },
  ]

  for (const t of targets) {
    const out = path.join(PUB, t.name)
    await sharp(svg, { density: 384 })
      .resize(t.size, t.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out)
    console.log('Generated', t.name, t.size + 'x' + t.size)
  }

  // favicon: 32x32 png (browsers accept .png favicons via link rel icon)
  await sharp(svg, { density: 384 })
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(PUB, 'favicon.ico'))
  console.log('Generated favicon.ico 32x32')

  console.log('All icons generated.')
}

main().catch((e) => { console.error(e); process.exit(1) })
