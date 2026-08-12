# SmartComp — Sales & Service Panel (Firebase-only Edition v12.0)

A focused shop-management web app for computer sales & service stores.
Built with Next.js 15 + React 18 + Tailwind 4 + shadcn/ui, backed by
**Firebase Firestore** (ultra fast, in-process SDK, sub-100ms reads,
sub-1ms cache hits).

> **What's new in v12.0**: Merged all latest features from `smartcomp`
> upstream into the Firebase-only codebase:
> - **Item units** — serial numbers + digital product keys tracked per-unit
> - **Round-off** — round grand total to nearest whole rupee (Tally-style)
> - **isDigitalProduct** flag on items
> - **Anti-clobber pending creates** in `api.ts` — prevents optimistic rows
>   from being wiped by racing refetches
> - **Stale-cache fallback** — soft "showing cached data" hint when refresh fails
> - **Invoice item validation** — name + positive quantity required
> - Improved `DocForm`, `Jobs`, `Serials`, `Settings`, `Stock` components
>
> **v11.5 (previous)**: Google Sheets / Apps Script support completely removed.
> Firebase Firestore is the only backend.

## Core Modules

- Dashboard — sales, stock, outstanding, payments, jobs, profit share
- Stock — items, low-stock alerts, cost/sell tracking, serial numbers, digital keys
- Invoices — 10 premium GST templates, A4 print, HSN summary, UPI QR, round-off
- Quotations — convert to invoice in one click, round-off
- Payments — collection tracking, partial payments
- Customers / Suppliers — contact + GST + outstanding
- WhatsApp Enquiry — bulk supplier rate enquiries
- Service Jobs — stock-linked parts, engineer/admin profit share
- Service Payments — separate payment ledger for jobs
- Serials & Warranty — IMEI / serial tracking + digital product keys
- AMC Contracts — annual maintenance contracts
- Shop Expenses / Personal Expenditure
- Campaigns — bulk WhatsApp broadcasts
- Credit Control — overdue tracking
- Financials — P&L, cash-flow, balance sheet
- Reports — sales trend, top items, receivables aging
- Settings — Firebase creds, PIN, shop profile

## Performance Notes

- **In-process Firestore SDK call** — no HTTP round-trip, no cold start
- **60s LRU cache** + **5s quantum mem cache** + **write-through patching**
- **Anti-clobber pending creates** — newly added rows survive racing refetches
- **Stale-cache fallback** — soft warning instead of error toast on refresh failure
- Typical cache hit: **<1ms** · Firestore read: **<100ms** · write: **<200ms**
- Document preview opens instantly with a skeleton, then fills in `/api/doc-data`
- Shop config and product images cached server-side for 5 min
- Lazy-loaded panels + optimistic UI for instant writes
- Periodic dashboard refresh (2 min) instead of aggressive live sync
- Browser fetch timeouts tightened: 8s writes / 6s reads (Firestore is sub-200ms)

---

## Quick Start (local dev)

```bash
npm install
npm run dev      # http://localhost:3000
```

Without any env vars, the app boots in "demo mode" (no backend) — useful for
clicking around the UI. To wire up Firestore, see below.

---

## Backend Setup — Firebase Firestore

### Step 1 — Create a Firebase project (free, 2 minutes)

1. Go to <https://console.firebase.google.com> → **Add project**.
2. Name it (e.g. `smartcomp-prod`). Disable Google Analytics (not needed).
3. Once created, the project defaults to the **Spark plan** (free tier):
   - 50,000 reads/day
   - 20,000 writes/day
   - 20,000 deletes/day
   - 1 GiB storage

   This is plenty for a small shop — typical usage is 5–20K reads/day.

### Step 2 — Create a Firestore database

1. In the Firebase console, click **Firestore Database** → **Create database**.
2. Pick **Production mode** (we'll add security rules next).
3. Pick a location close to your users (e.g. `asia-south1` for India).

### Step 3 — Add security rules

In the Firebase console → Firestore → **Rules** tab, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // The Next.js server uses the Admin SDK, which BYPASSES these rules.
    // These rules only protect against direct browser access (which the
    // app does NOT do — but defense in depth is good).
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Step 4 — Generate a service account key

1. Firebase console → **Project Settings** (gear icon) → **Service accounts** tab.
2. Click **Generate new private key** → confirm.
3. A JSON file downloads — e.g. `smartcomp-prod-firebase-adminsdk-xxxx.json`.

> ⚠️ This file grants full access to your Firestore. Treat it like a password.
> Never commit it to git.

### Step 5 — Convert to base64 (easiest path for Render / Vercel)

```bash
# Linux / macOS
base64 -w0 smartcomp-prod-firebase-adminsdk-xxxx.json

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("smartcomp-prod-firebase-adminsdk-xxxx.json"))
```

Copy the output (a long single-line string) — this is the value you'll paste
into Render's env vars.

If you're starting fresh, the in-app **Setup Wizard** has a
"Seed sample data" button that creates a few demo items and customers.

---

## Deploy to Render

The repo includes a `render.yaml` that Render auto-detects.

1. Push this repo to your GitHub.
2. Go to <https://render.com> → **New** → **Blueprint** → pick your repo.
3. Render reads `render.yaml` and creates one web service.
4. In the Render dashboard, set these env vars:

   | Key | Value | Required? |
   |-----|-------|-----------|
   | `FIREBASE_SERVICE_ACCOUNT_BASE64` | the base64 string from Step 5 | ✅ |
   | `APP_PIN` | 4-digit PIN of your choice | recommended |
   | `NEXT_PUBLIC_BASE_URL` | `https://your-app.onrender.com` | optional |

5. Click **Save** → Render builds & deploys.
6. Visit `/api/health` to confirm — you should see:
   ```json
   { "backend": "firestore", "configured": true, "firebaseReachable": true }
   ```

---

## Running locally with Firebase

Create a `.env.local` file at the project root:

```bash
FIREBASE_SERVICE_ACCOUNT_BASE64=...    # same base64 string
APP_PIN=1234                            # optional
```

Then:

```bash
npm run dev
```

For the Electron desktop build, see `electron-builder.yml` and
`scripts/build-exe.js`. The desktop app can also use Firebase — paste the
base64 string into the in-app Settings panel (it writes to
`%APPDATA%/smartcomp/config.json`).

---

## Configuration Reference

### Firebase env vars (pick ONE of the two styles)

| Style | Env vars | When to use |
|-------|----------|-------------|
| Base64 (preferred) | `FIREBASE_SERVICE_ACCOUNT_BASE64` | One env var, no escaping issues |
| Split | `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | When your platform limits env-var size |

For `FIREBASE_PRIVATE_KEY` (split style), the value must contain literal `\n`
escapes between the PEM lines. Render preserves these as-is.

### Other env vars

| Key | Purpose | Default |
|-----|---------|---------|
| `APP_PIN` | 4-digit PIN to lock the panel | unset = open access |
| `NEXT_PUBLIC_BASE_URL` | Public URL of the deployed app (used in track URLs) | unset = relative URLs |
| `CRON_SECRET` | Protects `/api/cron/*` endpoints | unset = cron endpoints 403 |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies Razorpay webhook signatures | unset = webhook 403 |
| `WA_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_BUSINESS_NUMBER`, `WA_VERIFY_TOKEN` | WhatsApp Cloud API (auto-send + auto-capture replies) | unset = wa.me manual mode |

---

## Architecture

```
                       ┌──────────────────────────────────────┐
   Browser / PWA  ──►  │  Next.js (Render)                    │
                       │  ├─ /api/* routes (60+)              │
                       │  ├─ PIN gate (proxy.ts)              │
                       │  ├─ Write-through cache (60s + 5s)   │
                       │  ├─ Anti-clobber pending creates     │
                       │  ├─ Stale-cache fallback             │
                       │  └─ firebase-admin SDK (in-process)  │
                       └─────────────┬────────────────────────┘
                                     │ HTTPS (server-to-server, <100ms)
                                     ▼
                       ┌──────────────────────────────────────┐
                       │  Firebase Firestore (Spark = free)   │
                       │  50K reads/day, 20K writes/day       │
                       └──────────────────────────────────────┘
```

The browser **never** talks to Firestore directly — all Firestore calls happen
server-side in `/api` routes. The Firebase service-account credentials stay
on the Render server, never exposed to the browser.

---

## Project Structure

```
smartcomp/
├── src/
│   ├── lib/
│   │   ├── firebase.ts           # Firestore admin SDK singleton (lazy-loaded)
│   │   ├── sheets-client.ts      # Firestore data layer (kept name for compat)
│   │   ├── runtime-config.ts     # Firebase + PIN config loader
│   │   ├── item-units.ts         # NEW v12 — serial numbers + digital keys
│   │   ├── api.ts                # Frontend fetch wrapper (anti-clobber + stale)
│   │   ├── calc.ts               # Invoice/quotation calc (with roundOff)
│   │   ├── validators.ts         # Item schema (with isDigitalProduct)
│   │   └── ...
│   ├── app/api/                  # 60+ API routes
│   ├── components/panels/        # 30+ UI panels
│   └── ...
├── render.yaml                   # Render blueprint (Firebase env vars)
├── package.json                  # firebase-admin dep
└── README.md                     # this file
```

---

## License

Private. © Smart Computers.
