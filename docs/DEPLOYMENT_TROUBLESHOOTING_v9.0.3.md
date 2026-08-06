# SmartComp v9.0.3 — Deployment Troubleshooting Guide

## Quick Diagnostics

Hit this endpoint in your browser (no login required):

```
https://your-app.onrender.com/api/health
```

It returns JSON with the full diagnostic picture:

```json
{
  "status": "ok",
  "configured": true,
  "pinRequired": true,
  "appsScriptUrlSet": true,
  "appsScriptUrlEndsWithExec": true,
  "appsScriptReachable": true,
  "appsScriptError": null,
  "hints": [
    "PIN protection is ON. Make sure you have logged in via /login..."
  ]
}
```

The `hints` array tells you exactly what to fix.

---

## Common Issues

### 1. "Site opens but no data loads" — most common

**Symptom**: Page loads, sidebar shows, but every panel is empty or shows "Loading…" forever.

**Cause A: APPS_SCRIPT_URL not set on Render**

Check `/api/health` → `configured: false`

Fix: Render dashboard → your service → Environment → add `APPS_SCRIPT_URL` = your Apps Script `/exec` URL → redeploy.

**Cause B: APP_PIN set but you haven't logged in**

Check `/api/health` → `pinRequired: true`

The middleware 401s every `/api/*` request (except public ones) if the `smartcomp_auth` cookie isn't present. Visit `/login` and enter your PIN.

**Cause C: Apps Script URL is wrong / deployment deleted**

Check `/api/health` → `appsScriptReachable: false`, `appsScriptError: "Apps Script 404..."`

Fix: Open Apps Script editor → Deploy → Manage deployments → copy the `/exec` URL → update Render env var → redeploy.

**Cause D: Apps Script deployment access is restricted**

Check `/api/health` → `appsScriptError` contains "Google LOGIN page detected" or "Web App access restricted"

Fix: Apps Script → Deploy → Manage deployments → edit → "Who has access" = **Anyone** → Save.

### 2. "Page shows Setup Wizard instead of Login"

**Cause**: This was a bug in v9.0.2 — `/api/config` was NOT in the public paths list, so when `APP_PIN` was set and the user wasn't logged in, `/api/config` returned 401, and page.tsx interpreted that as "not configured" → showed Setup Wizard → user couldn't reach `/login`.

**Fix in v9.0.3**: `/api/config` is now public (it only exposes `configured: boolean` and `pinRequired: boolean`, no secrets). page.tsx also now redirects to `/login` if PIN is required but no cookie is present.

### 3. Render service marked "unhealthy" or "failed to deploy"

**Cause A: `next start` doesn't work with `output: 'standalone'`**

The build log shows: `"next start" does not work with output: standalone configuration. Use node .next/standalone/server.js instead.`

Fix in v9.0.3: `render.yaml` now uses `startCommand: node .next/standalone/server.js` and a `postbuild` script copies static assets into the standalone bundle.

**Cause B: Health check path returns 302/401**

Old `render.yaml` used `healthCheckPath: /` which returns 302 to `/login` when PIN is set → Render sees non-200 → marks unhealthy.

Fix in v9.0.3: `healthCheckPath: /api/health` (public, always returns 200).

### 4. Login fails with "Too many login attempts"

**Cause**: v9.0.3 added a 5-attempts-per-minute rate limit on `/api/auth/login` to prevent PIN brute-force.

Fix: Wait 60 seconds, then try again. If you forgot your PIN, change `APP_PIN` in Render env vars and redeploy.

### 5. WhatsApp / Razorpay webhooks return 403 "Invalid signature"

**Cause**: v9.0.3 requires `WA_APP_SECRET` and `RAZORPAY_WEBHOOK_SECRET` env vars in production. Without them, webhooks are rejected.

Fix: Set these env vars on Render (or in dev, the warning is logged but webhooks still work).

### 6. Cron endpoints return 405 "Method Not Allowed"

**Cause**: v9.0.3 changed cron endpoints to POST-only (GET is rejected to prevent CSRF).

Fix: Use `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.onrender.com/api/cron/amc`

### 7. Data loads but is incomplete (only first 500 rows)

**Cause**: This was a bug in v9.0.2 — Apps Script's `_putListCache` silently truncated lists to 500 rows when JSON exceeded 90KB.

**Fix in v9.0.3**: Truncation removed. Oversized payloads skip the cache; the full list is always returned from the source sheet.

---

## Environment Variables Reference

| Var | Required | Purpose |
|---|---|---|
| `APPS_SCRIPT_URL` | **YES** | Google Apps Script Web App `/exec` URL |
| `APP_PIN` | Recommended | 4-8 digit PIN. When set, all `/api/*` routes require auth cookie. Also forwarded to Apps Script for backend auth. |
| `CRON_SECRET` | If using crons | Bearer token for `/api/cron/*` endpoints |
| `RAZORPAY_WEBHOOK_SECRET` | If using Razorpay | HMAC secret to verify Razorpay webhooks |
| `WA_APP_SECRET` | If using WhatsApp webhooks | Meta App Secret to verify webhook signatures |
| `WA_TOKEN` | Optional | WhatsApp Cloud API access token (enables auto-send) |
| `WA_PHONE_NUMBER_ID` | Optional | WhatsApp Cloud API phone number ID |
| `WA_VERIFY_TOKEN` | Optional | Meta webhook verification token |
| `NEXT_PUBLIC_BASE_URL` | Optional | Public URL of your deployment (used in track links) |

---

## First-Run Checklist for a Fresh Render Deploy

1. ✅ Push code to GitHub (includes v9.0.3 with all fixes)
2. ✅ Create new Web Service on Render → connect GitHub repo → use `render.yaml`
3. ✅ In Render Environment, set:
   - `APPS_SCRIPT_URL` = your Apps Script `/exec` URL
   - `APP_PIN` = 4-digit PIN (e.g. `1234`)
4. ✅ Deploy → wait for "Live" status
5. ✅ Visit `https://your-app.onrender.com/api/health` → confirm `configured: true`, `appsScriptReachable: true`
6. ✅ Visit `https://your-app.onrender.com/login` → enter PIN
7. ✅ You should now see the full dashboard with data

## If Apps Script Needs Updating

If `/api/health` shows `appsScriptReachable: false` because the Apps Script is the old version (pre-v9.0.2), you have two options:

**Option A (recommended): Update the Apps Script**
1. In the app, go to Settings → "Copy Apps Script code"
2. Open your Apps Script project, replace all code with the copied code
3. Deploy → New deployment → Web app → "Anyone" access → copy `/exec` URL
4. Update `APPS_SCRIPT_URL` on Render if the URL changed → redeploy

**Option B: Stay on old Apps Script**
The new Next.js code is backward-compatible — the `pin` field is silently ignored by old Apps Scripts. You just won't have the defense-in-depth backend PIN auth. Everything else (data loading, caching, etc.) works fine.

## Contact

If `/api/health` doesn't reveal the issue, the response also includes `cache` stats and `env` info. Share that JSON for faster debugging.
