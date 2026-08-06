# `apps-script/code.gs` — DEPRECATED (v10.1.0-firebase)

> **TL;DR — You don't need this file anymore.** Starting with v10.1, SmartComp
> talks to **Firebase Firestore** directly from the Next.js server. The Google
> Apps Script backend is no longer used in normal operation. Keep reading for
> the full story and the migration path.

---

## Why was it deprecated?

The old architecture was:

```
Browser  →  Next.js /api route  →  HTTP POST  →  Google Apps Script Web App  →  Google Sheet
                                   (6–8 s cold start, 1–3 s warm)
```

The new architecture is:

```
Browser  →  Next.js /api route  →  firebase-admin SDK  →  Firestore
                                   (<100 ms read, <200 ms write, in-process)
```

Firestore is an **in-process** SDK call from the Next.js server — there is no
HTTP round-trip, no cold start, no auth-token refresh, no circuit breaker. In
practice this is **~50× faster** than the Apps Script backend on cold starts
and **~5× faster** on warm hits. The free Spark tier gives you 50,000 reads /
20,000 writes / 20,000 deletes per day, 1 GiB storage — plenty for a small
shop-management app.

---

## What should I do with the existing `code.gs`?

You have **three options**, in order of recommendation:

### Option 1 — Keep as backup (recommended for first 2 weeks)

1. **Don't touch** the Apps Script project at `script.google.com`.
2. Deploy the new Firebase-backed code to Render.
3. Run the one-time migration script (see `scripts/migrate-sheets-to-firebase.js`
   in the project root) to copy your existing Sheets data into Firestore.
4. Verify everything works on Render for 1–2 weeks.
5. Once you're confident, delete the Apps Script project.

### Option 2 — Delete immediately (after migration)

1. Deploy the new code to Render.
2. Run `scripts/migrate-sheets-to-firebase.js` locally to copy data.
3. Verify data on Render.
4. Delete the Apps Script project at `script.google.com`.
5. You can also delete the `apps-script/` folder from the repo.

### Option 3 — Keep using Apps Script (legacy mode)

If you really don't want to migrate to Firebase yet, set the `APPS_SCRIPT_URL`
env var on Render (and leave `FIREBASE_*` unset). The app will fall back to
the legacy Apps Script backend automatically. The `code.gs` in this folder is
the latest version — paste it into your Apps Script project if you ever need
to redeploy.

> ⚠️ Legacy mode is **slow** and may be removed in a future version. Migrate
> to Firebase as soon as possible.

---

## One-time data migration (Sheets → Firestore)

A migration script is included at:

```
scripts/migrate-sheets-to-firestore.js
```

It does the following:

1. Calls your existing Apps Script backend's `getAllData` / per-sheet `list`
   action to fetch all rows from every sheet (Shop, Items, Customers,
   Invoices, Payments, Jobs, etc.).
2. Writes them to the corresponding Firestore collections using batched writes
   (450 docs per batch — Firestore's hard limit is 500).
3. Preserves the original `id` field as the Firestore document ID, so all
   foreign-key relationships (invoice → customer, payment → invoice, etc.)
   remain intact.
4. Sets `deleted: false` on any row that's missing the field (legacy rows
   from before soft-delete was added).

Run it with:

```bash
APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec \
APP_PIN=1234 \
FIREBASE_SERVICE_ACCOUNT_BASE64=$(base64 -w0 path/to/service-account.json) \
node scripts/migrate-sheets-to-firebase.js
```

The script is **idempotent** — running it twice will overwrite (merge) the
same docs, not duplicate them, because doc IDs are pinned to row IDs.

---

## What's actually in `code.gs`?

It's the entire Google Apps Script backend (~1700 lines of `.gs` JavaScript)
that powered the v5.0 "Quantum Ultra Speed" sheet layer. It's preserved here
for:

- **Reference** — the schema (`SCHEMAS` object at the top) was the source of
  truth for which fields each sheet has. The Firestore migration uses the
  same collection names and field names, so existing data fits without
  transformation.
- **Backup** — if you ever need to roll back to the Sheets backend, this is
  the code to redeploy.
- **Migration** — the migration script calls this Apps Script's `list` action
  to read existing data.

You will NOT need to edit, redeploy, or even open this file once you've
migrated to Firebase.

---

## Questions

**Q: Will my existing data be lost?**
A: No. The migration script copies every row from Sheets to Firestore before
   you switch the env vars. Your Google Sheet stays untouched as a backup
   until you delete it manually.

**Q: Will the PWA / mobile app still work?**
A: Yes. The `/api/sheets/sync` endpoint still serves `getAllData` — it just
   reads from Firestore instead of Apps Script. The PWA's `liveSync` action
   becomes a no-op ack in Firebase mode (the cache + 5s quantum mem cache
   already keep reads fresh).

**Q: Will the desktop Electron .exe still work?**
A: Yes. The runtime-config system (`src/lib/runtime-config.ts`) now supports
   Firebase credentials via the desktop config file too. The in-app settings
   panel can write either `appsScriptUrl` or `firebaseServiceAccountBase64`
   to `%APPDATA%/smartcomp/config.json`.

**Q: Is Firebase really free?**
A: Yes, on the Spark plan: 50K reads/day, 20K writes/day, 20K deletes/day,
   1 GiB storage. For a single shop this is more than enough — typical usage
   is 5–20K reads/day. If you outgrow it, the Blaze pay-as-you-go plan is
   $0.036 per 100K reads, which is still pennies per month.
