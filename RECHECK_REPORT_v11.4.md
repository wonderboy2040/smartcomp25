# SmartComp — Full Recheck, Cleanup & Optimization (v11.4)

Branch: `chore/recheck-cleanup-v11.4`

## Baseline (before)

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint src` | 0 errors, **1169 warnings** |
| `npm run build` | success — `/` route 26.6 kB, First Load JS 138 kB, shared 103 kB |
| Orphan source files | **35** (never imported anywhere) |
| Root markdown files | 26 (17 of them byte-identical duplicates of `docs/`) |
| `@types/react` | 19.2.17 against `react` 18.3.1 (mismatch) |

## 1. Dead code removed (35 files, ~5,000 lines)

- **29 unused shadcn/ui components** — `accordion, alert-dialog, alert, aspect-ratio, avatar, breadcrumb, calendar, carousel, chart, collapsible, command, context-menu, drawer, dropdown-menu, form, hover-card, input-otp, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, sidebar, slider, sonner, toggle-group`
- **`src/components/ServiceInvoiceModal.tsx`** (576 lines) — never mounted; the stale reference to it in `src/lib/pdf-templates.ts` was updated too
- **`src/lib/quantum-sync.ts`** (444 lines) — only referenced itself
- **`src/lib/whatsapp-qr-store.ts`** — superseded by `whatsapp-baileys.ts`
- **`src/hooks/use-mobile.ts`** — only consumer was the deleted `sidebar.tsx`
- **`src/db/index.ts`, `src/db/schema.ts`, `drizzle.config.json`** — a Postgres/drizzle scaffold from the project template. No route, lib, or component ever imported it; the app's only datastore is Google Sheets via Apps Script.

Charts are unaffected: `Reports.tsx` and `Financials.tsx` import `recharts` directly, not through the deleted `ui/chart.tsx`.

## 2. Dependencies pruned — 122 packages removed

Removed from `package.json` (zero consumers after step 1):

- Radix: `accordion, alert-dialog, aspect-ratio, avatar, collapsible, context-menu, dropdown-menu, hover-card, menubar, navigation-menu, popover, progress, radio-group, slider, toggle-group`
- `cmdk`, `vaul`, `embla-carousel-react`, `react-day-picker`, `input-otp`, `react-resizable-panels`, `react-hook-form`, `sonner`
- `drizzle-orm`, `pg`, `@types/pg`

Also fixed: `@types/react` pinned to **18.3.12** to match `react@18.3.1`. The 19.x types were silently type-checking the app against a different React major.

Effect: faster `npm install`, smaller `node_modules`, smaller Docker/standalone deploy surface, less audit noise.

## 3. Repo cleanup

17 root markdown files that were byte-identical copies of files already in `docs/` were deleted. `README.md` and the v10/v11 reports stay at root.

## 4. Code issues fixed

- **All 141 `no-unused-vars` warnings cleared** — unused imports, unused destructured values, unused catch bindings, dead locals.
- **4 API routes were fetching Google Sheets data they never used.** Each removed fetch is one fewer Apps Script round-trip per request:
  - `api/reports/cash-flow` — fetched the whole `Invoices` sheet, unused
  - `api/reports/balance-sheet` — fetched `Customers`, unused
  - `api/reports/pnl` — fetched `Items`, unused
  - `api/loyalty` — fetched `Customers`, unused
- **Typed the data layer's public surface**: added `ApiBody` (`src/lib/api.ts`) and `SheetRow` (`src/lib/sheets-client.ts`); `apiPost`/`apiPut`/`apiPostUltraFast`, `createRow`/`updateRow`/`bulkCreate`/`bulkUpdate`/`saveShop`/`sanitizeRowData` no longer take `any`. `normalizeError` now narrows properly instead of reading `.name`/`.message` off `any`.
- `src/lib/utils.ts` — `strPath`, `formatDate`, `formatDateTime`, `toCSV`, `downloadJSON`, `groupBy`, `sumBy` moved off `any`.

Lint: **1169 → 972 warnings, still 0 errors.** The remaining warnings are `no-explicit-any` inside panel components handling untyped Sheets rows — deliberately left alone (high churn, no runtime benefit).

## 5. Performance

- **`/_next/static/*` now sends `Cache-Control: public, max-age=31536000, immutable`.** These filenames are content-hashed but previously carried no cache header at all, so every repeat visit re-validated every chunk. This is the largest single win here.
- **`optimizePackageImports`** extended with the 11 Radix packages still in use, so barrel imports don't pull whole packages into panel chunks.
- **Prefetch split into two waves** (`src/app/page.tsx`): the 4 endpoints the Dashboard renders from fire first; the other 5 follow 400 ms later instead of all 9 competing for the same connection pool.
- **Eager panel preloading cut from 7 panels to 3** (`invoices`, `jobs`, `stock`). The rest now warm on nav hover/focus/touch via `preloadPanel()` — the chunk is ready by the time the click lands, without parsing 7 chunks the user may never open.
- **`html-to-image` (~40 KB) moved to a dynamic import** in `PosterMaker.tsx` — it now loads on export, not when the panel opens.

### Bundle numbers

| | Before | After |
|---|---|---|
| `/` route | 26.6 kB | 26.8 kB |
| First Load JS | 138 kB | 139 kB |
| Shared chunks | 103 kB | 103 kB |

The initial bundle is essentially unchanged, and that is the expected result: the 35 deleted files were never imported, so webpack was already tree-shaking them out. Their removal pays off in repo size, install time, and maintenance — not in the client bundle. The real runtime wins in this pass are the static-asset caching header, the removed Sheets round-trips, and the lighter preload strategy.

## Verification performed

- `npx tsc --noEmit` → **0 errors**
- `npx eslint src --ext .ts,.tsx` → **0 errors**, 972 warnings
- `npm run build` → success, standalone bundle written by `postbuild`
- Dev server smoke test — all 200: `/`, `/login`, `/track/[jobId]`, `/api/health`, `/api/shop`, `/api/dashboard`, `/api/reports/pnl`, `/api/reports/cash-flow`, `/api/reports/balance-sheet`, `/api/whatsapp/rates`
  (`/api/loyalty` returns 503 `APPS_SCRIPT_URL not configured` — pre-existing behaviour of that route when the environment has no Apps Script URL, unrelated to these changes.)

## Not done

- Full browser click-through of every panel with a live Apps Script backend — this environment has no `APPS_SCRIPT_URL`, so panels were verified to compile and route, not to round-trip real data.
- The remaining 972 `no-explicit-any` warnings in panel components.
