#!/usr/bin/env node
/**
 * Smart Computers — Windows .exe build orchestrator
 *
 * Steps:
 *   1. Run `next build` (produces .next/standalone + .next/static)
 *   2. Copy public/ + apps-script/ into .next/standalone so the bundled
 *      Next.js server can serve them at runtime.
 *   3. Run `electron-builder` with electron-builder.yml — produces
 *      dist/smart-computers-setup-<version>.exe
 *
 * Usage:
 *   node scripts/build-exe.js                # build for current platform
 *   node scripts/build-exe.js --target=win   # cross-compile for Windows
 *   node scripts/build-exe.js --target=win-x64
 *
 * Cross-compiling to Windows from Linux/macOS requires Wine installed.
 * On a real Windows machine, no Wine is needed — electron-builder uses
 * native Windows tooling.
 */

const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.join(__dirname, '..')
const STANDALONE_DIR = path.join(PROJECT_ROOT, '.next', 'standalone')

function log(msg) {
  console.log(`\n[build-exe] ${msg}`)
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...opts,
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    log(`WARN: source dir does not exist: ${src}`)
    return
  }
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const targetArg = argv.find((a) => a.startsWith('--target='))
  let target = targetArg ? targetArg.split('=')[1] : null

  // ============================================================
  // 1. Build Next.js (standalone mode)
  // ============================================================
  log('Step 1/4: Building Next.js (standalone mode)...')
  if (!fs.existsSync(path.join(PROJECT_ROOT, 'node_modules'))) {
    log('Installing dependencies first...')
    await run('npm', ['install'])
  }
  await run('npx', ['next', 'build'])

  if (!fs.existsSync(STANDALONE_DIR)) {
    throw new Error(`Next.js standalone output not found at ${STANDALONE_DIR}. Check next.config.ts has output: 'standalone'.`)
  }

  // ============================================================
  // 2. Copy public/, .next/static, apps-script/ into standalone dir
  //    (Next.js standalone does NOT include these by default)
  // ============================================================
  log('Step 2/4: Copying static assets into standalone bundle...')

  // .next/static
  const staticSrc = path.join(PROJECT_ROOT, '.next', 'static')
  const staticDest = path.join(STANDALONE_DIR, '.next', 'static')
  copyDir(staticSrc, staticDest)
  log(`  Copied .next/static → ${path.relative(PROJECT_ROOT, staticDest)}`)

  // public/
  const publicSrc = path.join(PROJECT_ROOT, 'public')
  const publicDest = path.join(STANDALONE_DIR, 'public')
  copyDir(publicSrc, publicDest)
  log(`  Copied public/ → ${path.relative(PROJECT_ROOT, publicDest)}`)

  // apps-script/ (so the in-app SetupWizard can show the code to paste)
  const appsScriptSrc = path.join(PROJECT_ROOT, 'apps-script')
  const appsScriptDest = path.join(STANDALONE_DIR, 'apps-script')
  copyDir(appsScriptSrc, appsScriptDest)
  log(`  Copied apps-script/ → ${path.relative(PROJECT_ROOT, appsScriptDest)}`)

  // ============================================================
  // 3. Run electron-builder
  // ============================================================
  // Detect platform + Wine availability to decide target
  const isWindows = process.platform === 'win32'
  const hasWine = isWindows || fs.existsSync('/usr/bin/wine64') || fs.existsSync('/usr/bin/wine')

  if (!target) {
    if (isWindows) target = 'win-x64'        // Native Windows → NSIS installer
    else if (hasWine) target = 'win-x64'     // Linux + Wine → NSIS installer
    else target = 'win-dir'                  // Linux without Wine → portable folder
  }

  log(`Step 3/4: Packaging with electron-builder (target=${target}, host=${process.platform}, wine=${hasWine})...`)

  // Pick the right builder config based on target
  let configArg = 'electron-builder.yml'
  const builderArgs = []

  if (target === 'win-dir') {
    // Portable folder build — no NSIS, no Wine required
    const dirConfig = path.join(PROJECT_ROOT, 'electron-builder.portable.yml')
    fs.writeFileSync(dirConfig, [
      'appId: com.smartcomputers.panel',
      'productName: Smart Computers',
      'directories:',
      '  output: dist',
      '  buildResources: build',
      'win:',
      '  target:',
      '    - target: dir',
      '      arch: [x64]',
      '  icon: electron/icon.ico',
      '  signAndEditExecutable: false',
      '  forceCodeSigning: false',
      'files:',
      '  - electron/main.js',
      '  - electron/preload.js',
      '  - electron/icon.ico',
      '  - package.json',
      '  - "!**/.env*"',
      '  - "!**/*.map"',
      '  - "!**/node_modules/*/{CHANGELOG.md,README.md,readme.md,README}"',
      '  - "!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}"',
      '  - "!**/node_modules/.cache"',
      'extraResources:',
      '  - from: .next/standalone',
      '    to: next-standalone',
      '    filter: ["**/*"]',
      '  - from: .next/static',
      '    to: next-standalone/.next/static',
      '    filter: ["**/*"]',
      '  - from: public',
      '    to: next-standalone/public',
      '    filter: ["**/*"]',
      '  - from: apps-script',
      '    to: next-standalone/apps-script',
      '    filter: ["**/*"]',
      'extraFiles:',
      '  - from: build/install-shortcuts.bat',
      '    to: install-shortcuts.bat',
      '  - from: build/uninstall-shortcuts.bat',
      '    to: uninstall-shortcuts.bat',
      '  - from: build/README-INSTALL.txt',
      '    to: README-INSTALL.txt',
      'compression: maximum',
      'publish: null',
      ''
    ].join('\n'))
    configArg = dirConfig
    builderArgs.push('--win', '--x64')
  } else if (target.startsWith('win')) {
    // NSIS installer (requires Wine on non-Windows hosts)
    builderArgs.push('--win', '--x64')
  }

  builderArgs.push('--config', configArg)

  await run('npx', ['electron-builder', ...builderArgs])

  // ============================================================
  // 4. If portable dir build, also create a ZIP for distribution
  // ============================================================
  const distDir = path.join(PROJECT_ROOT, 'dist')
  const winUnpacked = path.join(distDir, 'win-unpacked')

  if (target === 'win-dir' && fs.existsSync(winUnpacked)) {
    log('Step 4/4: Creating portable ZIP from win-unpacked/...')
    // Copy install scripts into the unpacked folder
    const batSrc = path.join(PROJECT_ROOT, 'build')
    ;['install-shortcuts.bat', 'uninstall-shortcuts.bat', 'README-INSTALL.txt'].forEach((f) => {
      const src = path.join(batSrc, f)
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(winUnpacked, f))
    })
    // Run the packaging Python script
    await run('python3', ['/home/z/my-project/scripts/package-portable-zip.py'])
  } else {
    log('Step 4/4: (skipped ZIP creation — not a portable dir build)')
  }

  // ============================================================
  // Done — show output location
  // ============================================================
  log('========================================')
  log('BUILD COMPLETE')
  log('========================================')
  if (fs.existsSync(distDir)) {
    const allFiles = fs.readdirSync(distDir)
    const installers = allFiles.filter((f) => f.endsWith('.exe'))
    const zips = allFiles.filter((f) => f.endsWith('.zip'))
    if (installers.length > 0) {
      console.log('\nInstaller(s):')
      for (const f of installers) {
        const full = path.join(distDir, f)
        const sizeMB = (fs.statSync(full).size / 1024 / 1024).toFixed(1)
        console.log(`  ${full}  (${sizeMB} MB)`)
      }
    }
    if (zips.length > 0) {
      console.log('\nPortable ZIP(s):')
      for (const f of zips) {
        const full = path.join(distDir, f)
        const sizeMB = (fs.statSync(full).size / 1024 / 1024).toFixed(1)
        console.log(`  ${full}  (${sizeMB} MB)`)
      }
    }
    if (fs.existsSync(winUnpacked)) {
      console.log('\nUnpacked folder (for testing on this machine):')
      console.log(`  ${winUnpacked}`)
    }
  }
}

main().catch((e) => {
  console.error('\n[build-exe] FAILED:', e.message)
  console.error(e.stack)
  process.exit(1)
})
