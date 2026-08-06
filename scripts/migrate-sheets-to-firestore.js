#!/usr/bin/env node
/**
 * migrate-sheets-to-firestore.js
 *
 * One-time migration script: copies all data from your existing Google Sheets
 * (via the Apps Script backend) into Firebase Firestore.
 *
 * PREREQUISITES:
 *   1. Your existing Apps Script backend is still deployed and reachable.
 *   2. You have a Firebase service account JSON file downloaded from
 *      https://console.firebase.google.com → Project Settings → Service
 *      Accounts → "Generate new private key".
 *
 * USAGE:
 *   # Linux / macOS
 *   APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec \
 *   APP_PIN=1234 \
 *   FIREBASE_SERVICE_ACCOUNT_BASE64=$(base64 -w0 path/to/service-account.json) \
 *   node scripts/migrate-sheets-to-firebase.js
 *
 *   # Windows (PowerShell)
 *   $env:APPS_SCRIPT_URL="https://script.google.com/macros/s/.../exec"
 *   $env:APP_PIN="1234"
 *   $env:FIREBASE_SERVICE_ACCOUNT_BASE64=[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\service-account.json"))
 *   node scripts/migrate-sheets-to-firestore.js
 *
 * WHAT IT DOES:
 *   - Reads every sheet (Shop, Items, Customers, Invoices, Payments, Jobs, ...)
 *     from Apps Script in parallel.
 *   - Writes each row to a Firestore collection with the same name, using the
 *     row's `id` field as the document ID. This preserves all foreign-key
 *     relationships (invoice.customerId → Customers.id, etc.).
 *   - Uses batched writes (450 docs per batch — Firestore's hard limit is 500).
 *   - Idempotent: running it twice merges the same docs, does not duplicate.
 *
 * SAFETY:
 *   - Your Google Sheet is NEVER modified or deleted.
 *   - The script only WRITES to Firestore. It does not delete anything.
 *   - If a row is missing the `deleted` field, it's set to `false`.
 *   - If a row is missing `id`, a deterministic one is generated based on the
 *     sheet name + row index.
 */

const https = require('https')
const http = require('http')

// We'll lazy-load firebase-admin so the script can print a friendly error
// if it's not installed yet.
let firebaseAdmin
try {
  firebaseAdmin = require('firebase-admin')
} catch (e) {
  console.error('ERROR: firebase-admin is not installed.')
  console.error('Run this from the project root after `npm install`:')
  console.error('  node scripts/migrate-sheets-to-firestore.js')
  process.exit(1)
}

const SHEETS = [
  'Shop',
  'Items',
  'Customers',
  'Suppliers',
  'Invoices',
  'Quotations',
  'Payments',
  'Enquiries',
  'Jobs',
  'ServicePayments',
  'Expenses',
  'ItemSerials',
  'PersonalExpenditure',
  'Campaigns',
  'AMCContracts',
  'Settings',
]

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL
const APP_PIN = process.env.APP_PIN
const FIREBASE_B64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY

function usage() {
  console.log(`
Usage:
  APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec \\
  APP_PIN=1234 \\
  FIREBASE_SERVICE_ACCOUNT_BASE64=\$(base64 -w0 service-account.json) \\
  node scripts/migrate-sheets-to-firestore.js

Required env vars:
  APPS_SCRIPT_URL  Your existing Apps Script /exec URL
  FIREBASE_SERVICE_ACCOUNT_BASE64  (preferred) OR:
  FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY

Optional:
  APP_PIN           PIN if your Apps Script backend requires one
  DRY_RUN=1         Just print what would be written, don't write
`)
}

if (!APPS_SCRIPT_URL || !APPS_SCRIPT_URL.includes('/exec')) {
  console.error('ERROR: APPS_SCRIPT_URL must be set and end with /exec.')
  usage()
  process.exit(1)
}

let serviceAccount = null
if (FIREBASE_B64) {
  try {
    const json = Buffer.from(FIREBASE_B64, 'base64').toString('utf-8')
    serviceAccount = JSON.parse(json)
  } catch (e) {
    console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_BASE64 could not be decoded:', e.message)
    process.exit(1)
  }
} else if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
  serviceAccount = {
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }
} else {
  console.error('ERROR: Firebase credentials not provided.')
  usage()
  process.exit(1)
}

const DRY_RUN = process.env.DRY_RUN === '1'

// ===== Initialize Firebase =====
try {
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(serviceAccount),
  })
} catch (e) {
  // Already initialized — get the existing app
  console.warn('Note: Firebase app already initialized, reusing.')
}
const db = firebaseAdmin.firestore()

// ===== Fetch from Apps Script =====
function fetchSheet(sheet) {
  return new Promise((resolve, reject) => {
    const u = new URL(APPS_SCRIPT_URL)
    u.searchParams.set('action', 'list')
    u.searchParams.set('sheet', sheet)
    u.searchParams.set('includeDeleted', 'true')
    if (APP_PIN) u.searchParams.set('pin', APP_PIN)

    const lib = u.protocol === 'https:' ? https : http
    const req = lib.get(
      u.toString(),
      {
        headers: { 'User-Agent': 'smartcomp-migrator/1.0' },
        timeout: 15000,
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} for ${sheet}`))
          }
          try {
            const json = JSON.parse(body)
            if (!json.success) {
              return reject(new Error(json.error || `Apps Script error for ${sheet}`))
            }
            resolve(json.data || [])
          } catch (e) {
            reject(new Error(`Invalid JSON for ${sheet}: ${body.slice(0, 200)}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`Timeout fetching ${sheet}`))
    })
  })
}

// ===== Batched write to Firestore =====
async function writeSheet(sheet, rows) {
  if (rows.length === 0) {
    console.log(`  ${sheet}: 0 rows — skipping`)
    return { sheet, count: 0, written: 0 }
  }

  console.log(`  ${sheet}: ${rows.length} rows fetched${DRY_RUN ? ' (DRY RUN — not writing)' : ''}`)

  if (DRY_RUN) {
    return { sheet, count: rows.length, written: 0 }
  }

  // Normalize rows: ensure `id` and `deleted` fields exist
  const normalized = rows.map((row, i) => {
    const r = { ...row }
    if (!r.id) r.id = `${sheet.toLowerCase()}_${i}`
    if (r.deleted === undefined) r.deleted = false
    if (!r.createdAt) r.createdAt = new Date().toISOString()
    r.updatedAt = new Date().toISOString()
    return r
  })

  // Chunk into batches of 450 (Firestore limit is 500 ops/batch)
  const chunks = []
  for (let i = 0; i < normalized.length; i += 450) {
    chunks.push(normalized.slice(i, i + 450))
  }

  let written = 0
  for (const chunk of chunks) {
    const batch = db.batch()
    for (const row of chunk) {
      batch.set(db.collection(sheet).doc(String(row.id)), row, { merge: true })
    }
    await batch.commit()
    written += chunk.length
    process.stdout.write(`    wrote ${written}/${normalized.length}\r`)
  }
  process.stdout.write('\n')
  return { sheet, count: rows.length, written }
}

// ===== Main =====
async function main() {
  console.log('=== SmartComp Sheets → Firestore Migration ===')
  console.log(`Apps Script URL: ${APPS_SCRIPT_URL.slice(0, 50)}...`)
  console.log(`Firebase project: ${serviceAccount.projectId}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will write to Firestore)'}`)
  console.log(`Sheets to migrate: ${SHEETS.length}`)
  console.log('')

  // Sanity-check Firestore access
  console.log('Pinging Firestore...')
  try {
    const pingRef = db.collection('_meta').doc('migrator_ping')
    await pingRef.set({ ok: true, at: Date.now() }, { merge: true })
    console.log('  Firestore reachable ✓')
  } catch (e) {
    console.error('  Firestore ping FAILED:', e.message)
    process.exit(1)
  }
  console.log('')

  // Fetch all sheets in parallel
  console.log('Fetching sheets from Apps Script (in parallel)...')
  const fetchResults = await Promise.allSettled(SHEETS.map((s) => fetchSheet(s)))

  const summary = []
  for (let i = 0; i < SHEETS.length; i++) {
    const sheet = SHEETS[i]
    const result = fetchResults[i]
    if (result.status === 'fulfilled') {
      const writeResult = await writeSheet(sheet, result.value)
      summary.push(writeResult)
    } else {
      console.error(`  ${sheet}: FETCH FAILED — ${result.reason?.message || result.reason}`)
      summary.push({ sheet, count: 0, written: 0, error: result.reason?.message || String(result.reason) })
    }
  }

  console.log('')
  console.log('=== Migration Summary ===')
  console.log('Sheet                | Rows  | Written')
  console.log('---------------------|-------|--------')
  let totalRows = 0
  let totalWritten = 0
  for (const s of summary) {
    const name = s.sheet.padEnd(20)
    const count = String(s.count).padStart(5)
    const written = String(s.written).padStart(6)
    console.log(`${name} | ${count} | ${written}`)
    totalRows += s.count
    totalWritten += s.written
  }
  console.log('---------------------|-------|--------')
  console.log(`${'TOTAL'.padEnd(20)} | ${String(totalRows).padStart(5)} | ${String(totalWritten).padStart(6)}`)
  console.log('')
  console.log('Done. You can now deploy the Firebase-backed app to Render.')
  console.log('Once you verify everything works, delete the Apps Script project.')
  process.exit(0)
}

main().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
