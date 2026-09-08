# SmartComp — Changes Summary

## v13.8 (current) — Deploy Fix + Deep Lag Fixes (Round 2)

### 0. Vercel deploy failure — FIXED (root cause)
**Problem:** The deploy of `c0b4525` failed during "Linting and checking
validities of types". Root cause: commit `21ff413` removed the GSTR-3B logic
from `src/lib/gst-return.ts` but left `src/app/api/reports/gstr3b/route.ts`
importing the deleted `buildGstr3B` → TS2305 "Module has no exported member"
→ `typescript.ignoreBuildErrors: false` killed the build. Because the deploy
failed, the live site was STILL running pre-v13.7 code — which is why the
lag complaints persisted even after the v13.7 fixes were pushed.

**Fix:**
- Deleted the dead `gstr3b` route (matches the removal intent; no UI
  references it — verified by grep).
- `package.json` engines: node `20.x` → `24.x` + `.nvmrc` → `24.4.1`
  (Vercel: Node 20 is deprecated, deployments after 2026-10-01 FAIL).
- `tsconfig.json` excludes workspace-only dirs (`skills`, `upload`,
  `tool-results`, `download`) — no-ops on Vercel, prevents local type
  pollution.

### 1. Deep lag audit → P0/P1 fixes
A full read-only performance audit found the remaining lag sources beyond
v13.7's architecture (all fixed):

- **Search typing lag (the big one):** every keystroke in Invoices /
  Quotations / Jobs / Stock / Payments re-filtered the full list AND
  re-rendered every row. Now the search term is **debounced 250ms** (new
  `src/hooks/use-debounced-value.ts`) — the input stays instant, the table
  updates once after typing stops.
- **Row render caps:** the five heavy panels rendered ALL matching rows
  (Jobs = 500-2000 rows × 8 cols × 5 action buttons). Now they render the
  60 newest + a **"Show N more"** button (+100 per tap). Panel render cost
  cut 3-10×.
- **`/api/jobs` payload cap:** the Jobs sheet grows without bound and the
  route shipped EVERY row to the client. Now capped at 300 newest by
  default (`?limit=all` restores old behavior for exports).
- **Client cache triple-serialization removed:** every fetch stringified the
  payload up to 3× on the main thread (hash check + setCache + localStorage
  autosave) — 50-200ms freezes on multi-MB lists. Now hashed **once** and
  passed through; the 30s localStorage autosave only writes when data
  actually changed AND the tab is visible (dirty-flag).
- **Double-notify on invalidation:** `invalidate()` notified every matching
  subscriber TWICE per save (cache-key loop + notifyPattern) → post-save
  freeze. Fixed with a skip-set.
- **Stock summary memoized:** the four inventory stat cards + profit banner
  ran 5 full array passes inline in JSX on EVERY render (every keystroke,
  checkbox). Now one single-pass `useMemo`.
- **GPU costs:** removed the sidebar's `backdrop-filter: blur(22px)` (its
  background is opaque — the blur was invisible but recomposited every
  scroll frame); topbar blur disabled on phones (<640px); removed the
  runtime `blur(16px)` on the two fixed decorative blobs (gradients already
  fade); dialog/sheet/modal scrims de-blurred (dark scrim alone is
  visually identical); global `scroll-behavior: smooth` → `auto`.

### 2. Small bug fixes found by the audit
- Payments "Today's Collections" counted undated legacy rows as today
  (`new Date(p?.date || Date.now())`) → inflated daily total. Fixed.
- `/api/payments` sort produced NaN comparators on undated rows →
  unstable ordering. Fixed with `|| 0` fallback.
- Undated payments now display "—" instead of today's date.
- Dead no-op ternary in `api.ts` merge logic removed.

### Verification
- `tsc --noEmit` clean, `eslint` 0 errors (pre-existing any-warnings only),
  `next build` successful (108/108 static pages) — deploy will now pass.

## v13.7 — WhatsApp Share Unification + Respectful Greetings + Lag Fixes

### 1. WhatsApp share — SAME flow for Invoices, Quotations & Service Jobs
**Problem:** Invoices shared as a PDF file attachment with **no text** (Android
WhatsApp drops the text when a file goes through the OS share sheet), while
quotations correctly delivered text + PDF (manual attach). Service jobs used
yet another custom flow.

**Fix:** One unified flow in `shareWhatsAppPdf()` (used by all three):
1. Cloud API direct-send first (if `WA_TOKEN` configured) — fully automatic.
2. Fallback: PDF **auto-downloads** + customer's WhatsApp chat opens with the
   **message pre-filled** (wa.me) + clipboard backup. Attach the just-downloaded
   PDF → pre-filled text rides along as the caption → customer receives
   **PDF + text together**. Identical on Android / iOS / desktop.

### 2. Respectful greeting — Sir / Madam
- Male customer → **"Respected Sir,"**, female → **"Respected Madam,"** in every
  WhatsApp share (invoice, quotation, service job — all 7 service templates).
- New `src/lib/customer-gender.ts`: explicit Gender field → name prefix
  (Mr./Shri/Mrs./Smt.) → business-name detection → ~350 common Indian names →
  suffix hints (bhai/ben/kaur/devi). Unknown → neutral "Dear {Name},".
- New optional **Gender dropdown** in the customer dialog (default: auto-detect).
- `/api/invoices` + `/api/quotations` embed `customer.gender` via a parallel
  cached Customers read; jobs accept `customerGender` passthrough.

### 3. Lag fixes (deep site recheck)
- **PanelBoundary memo fix** (the big one): every tab switch re-rendered ALL
  mounted panels — new children elements + changed `active` prop defeated
  React.memo. Now: stable `Comp` refs + `isSelected` prop → only the boundaries
  that actually flip re-render. Tab switches are near-instant.
- **Single-layout rendering**: Invoices / Quotations / Customers / Stock / Jobs /
  Payments rendered BOTH mobile cards AND desktop table (one hidden by CSS).
  Phones were rendering 200 invisible table rows on every mount/refresh. Now
  only the viewport-matching layout renders (`useIsDesktop` hook).
- Instant scroll on panel switch (was smooth-animated).
- Mounted-panels LRU cap 6 → 10 (fewer evict→remount→refetch cycles).

### Verification
- `tsc --noEmit` clean, `eslint src` 0 errors (139 pre-existing any-warnings),
  `next build` successful.
- 15/15 gender-inference unit checks pass.

## v13.6 — Deep Pro-Level Cleanup
- 26 dead API routes removed (ai, audit-log, birthdays, doc-data, leaderboard,
  html, job-photos, loyalty-points, payment-links, portal/otp, razorpay,
  recurring-invoices, reorder-alerts, gstr3b, reviews, smart, whatsapp qr-*,
  plus sub-routes) + 5 dead libs removed.
- Invoice/customer dialog instant-close optimizations.

## v13.5 — Lag Fixes + Walk-in Customer
- Parallel stock reads in invoice create, `slim=1` customer picker.
- Walk-in Customer feature (invoice form + Customers panel + idempotent backend).

## v13.4 — Mobile App
- Expo React Native app (`mobile/`), assets, eas.json, push-notification
  register endpoint (#113), MOBILE_SETUP_GUIDE.md.
