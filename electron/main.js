/**
 * Smart Computers — Electron main process (v2 — Windows-compatible)
 *
 * Architecture:
 *   1. On launch, read %APPDATA%/smartcomputers/config.json (or create empty)
 *   2. Spawn the Next.js standalone server (node server.js) bundled inside
 *      resources/app.asar → passes SMARTCOMP_CONFIG_PATH env var so the
 *      Next.js API can read/write the same config file
 *   3. Wait for http://localhost:PORT to respond
 *   4. Open a BrowserWindow pointing at that URL
 *
 * Cloud sync:
 *   - The .exe does NOT bake in APPS_SCRIPT_URL. The user pastes it once via
 *     the in-app SetupWizard (which calls POST /api/config with the URL).
 *   - From then on, every add/edit/delete in the desktop app hits the same
 *     Google Apps Script URL as Mobile / Tablet / Browser, so all devices
 *     stay in sync via the same Google Sheet.
 *
 * v2 FIXES:
 *   - Detects Next.js port from BOTH stdout and stderr
 *   - Uses fixed port 31337 (avoids 0-port random issues on Windows)
 *   - Writes all logs to %APPDATA%/smartcomputers/next-server.log
 *   - Properly kills node tree on Windows via taskkill
 *   - Better error display with log path
 */

const { app, BrowserWindow, shell, Menu, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { spawn, spawnSync } = require('child_process')

// ============================================================
// CONFIG
// ============================================================
const APP_NAME = 'Smart Computers'
const APP_ID = 'smartcomputers'
const FIXED_PORT = 31337 // Fixed port — easier to debug, no race conditions

// Path to runtime config JSON — shared between Electron and Next.js
function getConfigDir() {
  return app.getPath('userData') // %APPDATA%/smartcomputers on Windows
}

function getConfigPath() {
  const dir = getConfigDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'config.json')
}

function getLogPath() {
  const dir = getConfigDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'next-server.log')
}

function readConfig() {
  const p = getConfigPath()
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'))
    }
  } catch (e) {
    console.error('[smartcomp] Failed to read config:', e)
  }
  return {}
}

// ============================================================
// LOGGING — tee to both console and log file
// ============================================================
let logStream = null

function openLog() {
  try {
    const logPath = getLogPath()
    logStream = fs.createWriteStream(logPath, { flags: 'a' })
    logStream.write(`\n\n========================================\n`)
    logStream.write(`Smart Computers started at ${new Date().toISOString()}\n`)
    logStream.write(`Platform: ${process.platform} ${process.arch}\n`)
    logStream.write(`Electron: ${process.versions.electron}\n`)
    logStream.write(`Node: ${process.versions.node}\n`)
    logStream.write(`App path: ${app.getAppPath()}\n`)
    logStream.write(`Resources path: ${process.resourcesPath}\n`)
    logStream.write(`Config dir: ${getConfigDir()}\n`)
    logStream.write(`========================================\n`)
  } catch (e) {
    console.error('[smartcomp] Failed to open log:', e)
  }
}

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  if (logStream) {
    try { logStream.write(line + '\n') } catch {}
  }
}

// ============================================================
// NEXT.JS STANDALONE SERVER
// ============================================================
function getStandaloneRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'next-standalone')
  }
  return path.join(__dirname, '..', '.next', 'standalone')
}

function getNodeExe() {
  // In packaged Windows builds, Electron bundles Node.js. We use that.
  // On dev, we use the system `node` from PATH.
  if (app.isPackaged) {
    // Electron's process.execPath IS a Node-capable binary when launched
    // with ELECTRON_RUN_AS_NODE=1. We set this env var below.
    return process.execPath
  }
  return process.execPath // dev mode — Electron's binary also works
}

let nextProcess = null

function startNextServer() {
  return new Promise((resolve, reject) => {
    const standaloneRoot = getStandaloneRoot()
    const serverJs = path.join(standaloneRoot, 'server.js')

    logLine(`Standalone root: ${standaloneRoot}`)
    logLine(`server.js path: ${serverJs}`)
    logLine(`server.js exists: ${fs.existsSync(serverJs)}`)

    if (!fs.existsSync(serverJs)) {
      reject(new Error(`Next.js standalone server.js not found at:\n  ${serverJs}\n\nThis usually means the build is incomplete. Re-run npm run dist:win.`))
      return
    }

    // Use FIXED_PORT — easier to debug, no race between stdout parse + connect
    const port = FIXED_PORT

    // On Windows, we MUST use ELECTRON_RUN_AS_NODE=1 to make the Electron
    // binary behave as plain Node.js (otherwise it tries to launch GUI).
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NEXT_TELEMETRY_DISABLED: '1',
      SMARTCOMP_CONFIG_PATH: getConfigPath(),
      // Make Electron's binary behave as Node.js
      ELECTRON_RUN_AS_NODE: '1',
    }

    logLine(`Spawning Node with PORT=${port} HOSTNAME=127.0.0.1`)
    logLine(`Node exe: ${getNodeExe()}`)
    logLine(`cwd: ${standaloneRoot}`)

    try {
      nextProcess = spawn(getNodeExe(), [serverJs], {
        cwd: standaloneRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (e) {
      reject(new Error(`Failed to spawn Node.js: ${e.message}`))
      return
    }

    let resolved = false
    const startTime = Date.now()

    const onStdout = (chunk) => {
      const text = chunk.toString()
      logLine(`[next:out] ${text.trimEnd()}`)
    }
    const onStderr = (chunk) => {
      const text = chunk.toString()
      logLine(`[next:err] ${text.trimEnd()}`)
    }

    nextProcess.stdout.on('data', onStdout)
    nextProcess.stderr.on('data', onStderr)

    nextProcess.on('exit', (code, signal) => {
      logLine(`Next.js server exited code=${code} signal=${signal} after ${Date.now() - startTime}ms`)
      if (!resolved) {
        // Server died before becoming ready — read the log to give a helpful error
        const logPath = getLogPath()
        reject(new Error(
          `Next.js server exited before becoming ready (code=${code}).\n\n` +
          `Log file: ${logPath}\n\n` +
          `Common fixes:\n` +
          `  1. Antivirus may be blocking the bundled Node.js — add an exception for the install folder.\n` +
          `  2. Port ${port} may be in use — close any other app using it.\n` +
          `  3. Windows Defender Smartscreen may have quarantined files.`
        ))
        resolved = true
      }
    })

    nextProcess.on('error', (e) => {
      logLine(`Next.js spawn error: ${e.message}`)
      if (!resolved) {
        reject(new Error(`Failed to start Next.js server: ${e.message}`))
        resolved = true
      }
    })

    // Start polling for the server to be ready
    logLine(`Polling http://127.0.0.1:${port}/api/health ...`)
    waitForPort(port, 80, 500)
      .then(() => {
        if (!resolved) {
          resolved = true
          logLine(`Server is ready on port ${port} after ${Date.now() - startTime}ms`)
          resolve(port)
        }
      })
      .catch((e) => {
        if (!resolved) {
          resolved = true
          reject(new Error(`Server did not become reachable on port ${port}: ${e.message}`))
        }
      })
  })
}

function waitForPort(port, attempts, delayMs) {
  return new Promise((resolve, reject) => {
    let tries = 0
    const tryConnect = () => {
      tries++
      const req = http.get(
        { hostname: '127.0.0.1', port, path: '/api/health', timeout: 2000 },
        (res) => {
          res.resume()
          if (res.statusCode === 200 || res.statusCode === 401) {
            resolve()
          } else if (tries >= attempts) {
            reject(new Error(`Got status ${res.statusCode} after ${tries} attempts`))
          } else {
            setTimeout(tryConnect, delayMs)
          }
        }
      )
      req.on('error', (e) => {
        if (tries >= attempts) reject(new Error(`Connection failed after ${tries} attempts: ${e.message}`))
        else setTimeout(tryConnect, delayMs)
      })
      req.on('timeout', () => {
        req.destroy()
        if (tries >= attempts) reject(new Error(`Timed out after ${tries} attempts`))
        else setTimeout(tryConnect, delayMs)
      })
    }
    tryConnect()
  })
}

// ============================================================
// WINDOW
// ============================================================
let mainWindow = null

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0f172a',
    title: APP_NAME,
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // SECURITY: sandbox:true confines the renderer process so even if a
      // XSS payload runs in the page, it cannot reach Node primitives
      // directly. Combined with contextIsolation:true, this is the
      // Electron-recommended baseline.
      sandbox: true,
    },
  })

  Menu.setApplicationMenu(null)

  const url = `http://127.0.0.1:${port}/`
  logLine(`Loading URL: ${url}`)
  mainWindow.loadURL(url)

  // Open external links in the default browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.startsWith('http://127.0.0.1') || targetUrl.startsWith('http://localhost')) {
      return { action: 'allow' }
    }
    shell.openExternal(targetUrl)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl.startsWith('http://127.0.0.1') || targetUrl.startsWith('http://localhost')) return
    event.preventDefault()
    shell.openExternal(targetUrl)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ============================================================
// ERROR WINDOW — friendly display when Next.js fails to start
// ============================================================
function showErrorWindow(errorMessage) {
  const win = new BrowserWindow({
    width: 720,
    height: 520,
    backgroundColor: '#fef2f2',
    title: `${APP_NAME} — Error`,
    icon: path.join(__dirname, 'icon.ico'),
  })
  Menu.setApplicationMenu(null)

  const logPath = getLogPath()
  const safeMsg = String(errorMessage).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeLogPath = String(logPath).replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Smart Computers - Error</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', -apple-system, sans-serif;
    margin: 0;
    padding: 32px;
    background: #fef2f2;
    color: #7f1d1d;
    line-height: 1.5;
  }
  h2 { margin: 0 0 16px; font-size: 20px; color: #991b1b; }
  .box {
    background: #fee2e2;
    padding: 16px;
    border-radius: 8px;
    margin: 16px 0;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    border: 1px solid #fecaca;
  }
  .log-path {
    background: #f3f4f6;
    color: #1f2937;
    padding: 12px 16px;
    border-radius: 8px;
    margin: 16px 0;
    font-size: 12px;
    border: 1px solid #d1d5db;
  }
  .log-path strong { color: #111827; }
  .btn {
    background: #dc2626;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    margin-right: 8px;
  }
  .btn:hover { background: #b91c1c; }
  .btn.secondary {
    background: #6b7280;
  }
  .btn.secondary:hover { background: #4b5563; }
  .footer {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #fecaca;
    font-size: 12px;
    color: #6b7280;
  }
</style>
</head>
<body>
  <h2>Failed to start Smart Computers</h2>
  <p>The desktop app couldn't start the local Next.js server. Don't worry — your data is safe in your Google Sheet.</p>
  <div class="box">${safeMsg}</div>
  <div class="log-path">
    <strong>Log file:</strong><br>
    <code>${safeLogPath}</code>
    <br><br>
    <strong>To view the log:</strong> Open File Explorer, paste the path above into the address bar, and open <code>next-server.log</code> in Notepad.
  </div>
  <div>
    <button class="btn" onclick="retry()">Retry Startup</button>
    <button class="btn secondary" onclick="openLog()">Open Log File</button>
    <button class="btn secondary" onclick="window.close()">Close</button>
  </div>
  <div class="footer">
    <p><strong>Quick fixes:</strong></p>
    <ul>
      <li>Make sure port ${FIXED_PORT} is not in use (close other dev servers)</li>
      <li>Add the Smart Computers folder to Windows Defender exclusions</li>
      <li>Right-click the .exe → "Run as administrator"</li>
      <li>If still failing, send the log file to support</li>
    </ul>
  </div>
  <script>
    // SECURITY: previously this used require('electron') inside the renderer,
    // which is broken under contextIsolation:true + sandbox:true. The preload
    // script now exposes a safe 'smartcomp' global with an `openLog()` method
    // instead — no Node primitives reachable from the error page.
    function retry() {
      location.reload();
    }
    function openLog() {
      if (window.smartcomp && typeof window.smartcomp.openLog === 'function') {
        window.smartcomp.openLog();
      }
    }
  </script>
</body>
</html>`

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}

// ============================================================
// APP LIFECYCLE
// ============================================================
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    if (process.platform === 'win32') {
      app.setAppUserModelId(APP_ID)
    }

    // Register the IPC handler for "Open Log File" (invoked by preload.openLog)
    const { ipcMain } = require('electron')
    ipcMain.handle('open-log-file', () => {
      return shell.openPath(getLogPath())
    })

    openLog()
    logLine(`Config path: ${getConfigPath()}`)
    logLine(`Log path: ${getLogPath()}`)
    logLine(`Standalone root: ${getStandaloneRoot()}`)
    logLine(`isPackaged: ${app.isPackaged}`)

    try {
      const port = await startNextServer()
      createWindow(port)
    } catch (e) {
      logLine(`STARTUP FAILED: ${e.message}`)
      logLine(e.stack || '')
      showErrorWindow(e.message)
    }
  })

  app.on('window-all-closed', () => {
    killNextServer()
    app.quit()
  })

  app.on('before-quit', () => {
    killNextServer()
  })

  process.on('exit', () => {
    killNextServer()
  })
}

function killNextServer() {
  if (!nextProcess) return
  try {
    if (process.platform === 'win32') {
      // Kill the entire process tree on Windows
      spawnSync('taskkill', ['/pid', String(nextProcess.pid), '/f', '/t'], {
        windowsHide: true,
        stdio: 'ignore',
      })
    } else {
      nextProcess.kill('SIGTERM')
    }
  } catch (e) {
    logLine(`killNextServer error: ${e.message}`)
  }
  nextProcess = null
}
