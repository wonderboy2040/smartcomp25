/**
 * postbuild script — copy static assets into the Next.js standalone output.
 *
 * Why this exists:
 *   When `output: 'standalone'` is set in next.config.ts, `next build`
 *   produces a self-contained server bundle at `.next/standalone/server.js`.
 *   BUT the standalone bundle does NOT include:
 *     - .next/static/*  (JS chunks, CSS, fonts)
 *     - public/*        (favicon, manifest.json, sw.js, posters, etc.)
 *   Next.js expects you to copy these manually. Without them, the deployed
 *   app would serve HTML with broken <script src="/_next/static/..."> tags
 *   and no service worker / manifest.
 *
 * This script runs after `next build` (via the `postbuild` npm hook) and
 * copies both directories into .next/standalone/ so the standalone server
 * can serve everything from a single directory tree.
 *
 * Used by: render.yaml startCommand = `node .next/standalone/server.js`
 */

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const STANDALONE_DIR = path.join(PROJECT_ROOT, '.next', 'standalone')
const STATIC_SRC = path.join(PROJECT_ROOT, '.next', 'static')
const STATIC_DST = path.join(STANDALONE_DIR, '.next', 'static')
const PUBLIC_SRC = path.join(PROJECT_ROOT, 'public')
const PUBLIC_DST = path.join(STANDALONE_DIR, 'public')

function copyDir(src, dst) {
  if (!fs.existsSync(src)) {
    console.warn(`[postbuild] source not found, skipping: ${src}`)
    return 0
  }
  let count = 0
  fs.mkdirSync(dst, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      count += copyDir(s, d)
    } else {
      fs.copyFileSync(s, d)
      count++
    }
  }
  return count
}

function main() {
  if (!fs.existsSync(STANDALONE_DIR)) {
    console.error(`[postbuild] standalone dir not found: ${STANDALONE_DIR}`)
    console.error('[postbuild] did `next build` run with output: "standalone"?')
    process.exit(1)
  }

  const staticCount = copyDir(STATIC_SRC, STATIC_DST)
  console.log(`[postbuild] copied ${staticCount} static files to .next/standalone/.next/static/`)

  const publicCount = copyDir(PUBLIC_SRC, PUBLIC_DST)
  console.log(`[postbuild] copied ${publicCount} public files to .next/standalone/public/`)

  // Also copy apps-script/ so the in-app "Copy Apps Script code" feature
  // works in standalone mode (the route reads it via fs at request time).
  const APPS_SCRIPT_SRC = path.join(PROJECT_ROOT, 'apps-script')
  const APPS_SCRIPT_DST = path.join(STANDALONE_DIR, 'apps-script')
  if (fs.existsSync(APPS_SCRIPT_SRC)) {
    const asCount = copyDir(APPS_SCRIPT_SRC, APPS_SCRIPT_DST)
    console.log(`[postbuild] copied ${asCount} apps-script files to .next/standalone/apps-script/`)
  }

  console.log('[postbuild] ✓ standalone bundle is ready for deployment')
}

main()
