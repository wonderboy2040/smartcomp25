# SmartComp — Full Recheck & Bug Fix Report (2026-08-03)

## Summary

- **Source**: https://github.com/wonderboy2040/smartcomp
- **Cloned to**: `/home/z/my-project/smartcomp`
- **Stack**: Next.js 15.5.21 (App Router) + React 18 + TypeScript 5.8 + Tailwind 4 + Radix UI + Google Sheets (via Apps Script) + Electron 33
- **Original build status**: ✅ Compiled successfully (74 static pages + 80 API routes), but with **1094 lint warnings** (911 `any` types, 142 unused vars, 14 console statements, etc.)
- **Post-fix build status**: ✅ Still compiles cleanly. TypeScript strict typecheck passes. Server boots, /api/health returns 200, all key endpoints respond.

## Audits Performed (3 parallel agents)

1. **AUDIT-API** — audited every file under `src/app/api/**/route.ts` and supporting libs (`src/lib/**`). Found 4 HIGH, 12 MEDIUM, 6 LOW issues.
2. **AUDIT-FE** — audited every component under `src/components/**` and `src/app/**/*.tsx`. Found 2 HIGH, 7 MEDIUM, 10 LOW issues.
3. **AUDIT-INFRA** — audited every config, build script, PWA asset, and Electron file. Found 2 HIGH, 6 MEDIUM, 9 LOW issues.

## Bugs Fixed (21 changes)

### HIGH-severity fixes
1. **`src/app/layout.tsx`** — Added Sonner `<Toaster>` mount (was missing — every `toast.success/error()` call in AMC/Stock/Payments/Quotations silently did nothing).
2. **`public/sw-register.js`** — Replaced self-destruct script with a proper SW registrar that registers `/sw.js` and clears only stale caches. PWA offline support restored.
3. **`public/sw.js`** — Bumped SW_VERSION to `smartcomp-v10-0-0-ultra` to match package.json.
4. **`src/components/panels/AIIntelligence.tsx`** — Fixed stale-closure bug where example-query chips filled the input but the AI never actually ran (setTimeout captured the stale empty `aiQuery`). Refactored `handleAIQuery(queryOverride?)` to accept the query directly.
5. **`apps-script/code.gs`** — Applied the documented-but-never-committed duplicate-file fix: `var SCHEMAS = (typeof SCHEMAS !== 'undefined' && SCHEMAS) ? SCHEMAS : {...}`. "Copy of Code" files no longer crash with "Identifier 'SCHEMAS' has already been declared". Same treatment for `SHEET_NAMES`.
6. **`src/lib/whatsapp-baileys.ts`** — `disconnectWhatsApp()` now calls Baileys' built-in `sock.logout()` (which deletes local auth files) + `fs.rmSync(.wa-auth)` fallback. Next `qr-login` will now show a fresh QR instead of silently auto-reconnecting.
7. **`src/lib/whatsapp-baileys.ts`** — Added stale-event guards (`if (sock !== session.socket) return`) at every callback entry point. Race condition where a fresh socket could be wiped by a stale close event is fixed.
8. **`src/app/api/debug-connection/route.ts`** — Replaced direct `process.env.APPS_SCRIPT_URL!` read with `getAppsScriptUrl()` from runtime-config. Endpoint no longer crashes in Electron desktop mode where the env var is unset.

### MEDIUM-severity fixes
9. **`src/components/DocumentHtmlViewer.tsx`** — Removed stale-closure `if (!iframeLoaded)` guard inside the 5-second load-timeout. Fallback now fires correctly when an iframe URL fails to load.
10. **`src/components/panels/Quotations.tsx`** — `recalcTotals` now uses functional `setForm(prev => ...)` instead of spreading the closure-captured `form`. Notes/Terms textarea content no longer races with item edits.
11. **`src/components/panels/Settings.tsx`** — `ShopSettings` now uses an `initializedRef` to seed the form ONCE on first load. Subsequent refetches (e.g., after a save or via `invalidate('/api/shop')`) no longer overwrite the user's in-progress edits.
12. **`src/components/panels/CommandCenter.tsx`** — Stored `SpeechRecognition` instance in a `useRef`, added cleanup `useEffect(() => () => recognitionRef.current?.abort?.(), [])`, wrapped `recognition.start()` in try/catch.
13. **`src/components/panels/Stock.tsx`** — Replaced `<>...</>` Fragment with `<React.Fragment key={item.id}>` so React doesn't warn about missing keys and doesn't mis-reconcile expanded description rows.
14. **`src/components/panels/Stock.tsx`** — Removed pre-emptive `invalidate('/api/items')` before `apiPut` (was triggering a refetch of the OLD value that raced with the optimistic update).
15. **`src/app/api/jobs/[id]/route.ts`** — Added `GET` and `PUT` handlers (only `DELETE` existed before — frontend GETs would 405). DELETE stock-restore now skips undefined `part.itemId` instead of silently losing data, and uses a narrow `updateRow` patch instead of rewriting the entire Item row.
16. **`src/lib/whatsapp-templates.ts`** — Added `default:` case to `buildWhatsAppMessage` switch. Returns a minimal valid message rather than `undefined` (which broke wa.me links with the text "undefined").
17. **`src/app/api/reminders/route.ts`** — Replaced inline phone normalization with the shared `normalizePhone()` from `whatsapp-cloud.ts`. Now handles 11-digit numbers starting with `0` consistently with the rest of the app.
18. **`src/app/track/doc/[id]/page.tsx`** — Fixed "View / Download PDF" link to point at `/api/pdf/${id}` (the actual PDF endpoint) instead of `/api/doc-html/${id}` (which returns HTML). Added a separate "View HTML Preview" link for the HTML version.

### INFRA fixes
19. **`next.config.ts`** — Moved `serverActions: { bodySizeLimit: '4mb' }` from `experimental` (silently ignored) to top-level config key. Added cache headers for `/fonts/`, `/ads/`, `/posters/`, `/logo.webp`, `/logo.png` (were getting `no-cache, must-revalidate`).
20. **`vercel.json`** — Changed `installCommand` from `bun install` to `npm install`. Removed `bun.lock` from the repo. Resolves package-manager drift between Vercel and Render.
21. **`src/app/api/health/route.ts`** — Split into liveness probe (default, returns immediately) and readiness probe (`?live=1`, pings Apps Script). Render's health check no longer hangs / restart-loops on slow Apps Script responses.
22. **`electron/preload.js`** + **`electron/main.js`** — Added IPC handler `get-app-version` that returns `app.getVersion()`. `version` field no longer always returns `'unknown'` in packaged Electron apps.
23. **`scripts/build-exe.js`** — Removed duplicate `extraResources` entries for `.next/static`, `public`, `apps-script` (they're already inside `.next/standalone` from Step 2). Fixed the hardcoded `/home/z/my-project/scripts/package-portable-zip.py` path to use `__dirname`-relative resolution with graceful skip if missing.
24. **`src/components/panels/AutomationHub.tsx`** — Replaced dynamic Tailwind class names (`bg-${rule.color}-100`) with static class lookup maps (Tailwind JIT cannot see template-string classes — they were silently rendered with no color).

## Verification

- ✅ `npx tsc --noEmit --pretty false` — 0 errors
- ✅ `npx next build` — Compiled successfully in 22.8s, 74 static pages generated, all 80 API routes built
- ✅ Server starts via `node .next/standalone/server.js` in 177ms
- ✅ `/api/health` returns `{status: 'ok', version: '10.0.0-ultra'}` (liveness mode)
- ✅ `/api/health?live=1` returns full diagnostics (readiness mode)
- ✅ `/login`, `/`, `/manifest.json`, `/sw.js`, `/sw-register.js` all return HTTP 200
- ✅ Updated `sw-register.js` correctly served (registers `/sw.js` rather than self-destructing)

## What was NOT changed (intentionally)

- The 911 `any` type warnings — these are pervasive but don't affect runtime; converting them all would balloon the diff for zero functional gain. Worth a separate cleanup PR.
- The 142 unused-vars warnings — same reasoning; safe to leave.
- The `bun.lock` removal — done as part of the package-manager drift fix.
- Authentication flow (login, PIN check, cookie middleware) — audited and found correct; no changes needed.
- PDF generation (`src/lib/pdf.ts`) — audited; jsPDF + autotable usage is structurally sound.
- Error boundaries (`error.tsx`, `global-error.tsx`) — audited; recovery logic is correct.

## How to deploy

1. `npm install`
2. `npm run build`
3. `npm start` OR `node .next/standalone/server.js`
4. Set env vars: `APPS_SCRIPT_URL` (required), `APP_PIN` (optional), `WA_TOKEN` / `WA_PHONE_NUMBER_ID` / `WA_VERIFY_TOKEN` (optional WhatsApp Cloud API), `RAZORPAY_WEBHOOK_SECRET` (optional), `CRON_SECRET` (optional)
5. For desktop builds: `npm run dist:win` (Windows) — produces NSIS installer or portable ZIP depending on Wine availability.
