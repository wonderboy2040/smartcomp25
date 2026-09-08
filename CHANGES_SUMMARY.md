# SmartComp — Changes Summary

## v13.7 (current) — WhatsApp Share Unification + Respectful Greetings + Lag Fixes

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
