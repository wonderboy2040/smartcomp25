# Deployment Fix v7.6 - Circuit Breaker & Stale Apps Script Fix
**Date:** 2026-07-20
**Issue:** Site deploy hogya but Google Sheets se data load nahi ho raha - Circuit breaker active logs spamming

**Error Logs from user:**
```
Quantum getAllData failed, fallback to individual Error: Circuit breaker active. Try again in 14s
...
Stale/broken Apps Script - HTML error page
FIX: Settings → Sync → Copy latest code → paste in Apps Script → Deploy new version
Preview: <!DOCTYPE html>...
```

## 🔍 Root Cause Deep Analysis

### 1. **Circuit Breaker Too Aggressive (5 failures, 30s cooldown)**
- Old: `THRESHOLD=5`, `COOLDOWN=30s`
- Quantum live sync does 1s interval: if Apps Script down, 5 fails in 5 sec -> breaker blocks ALL requests for 30s
- Then dashboard, items, jobs all fail -> site blank or empty
- Logs spammed every second with "Circuit breaker active"

### 2. **Stale/Broken Apps Script Deployment**
- Apps Script returned HTML error page (favicon.ico, title Error) instead of JSON
- Happens when:
  - Apps Script code not updated to latest v5.0 Quantum (missing getAllData action)
  - Deployment not set to "Anyone" access
  - Syntax error in Apps Script
  - Old deployment URL (not /exec)
- Our `diagnoseHtmlResponse()` already detected and gave fix message, but breaker counted it as failure and blocked everything

### 3. **getAllData Fallback Spamming**
- `/api/sheets/sync?action=getAllData` tried getAllDataQuantum() -> failed due to breaker -> fallback to 5x listRows calls
- But listRows also uses same breaker -> also fails -> logs "Quantum getAllData failed, fallback to individual Error: Circuit breaker active"
- Every second liveSync triggered same -> log spam every 1-2 sec

### 4. **Dashboard Returns 500 on Breaker**
- `/api/dashboard` threw 500 on breaker error -> frontend showed blank or error, not friendly warning
- Site appeared "kuch bhi load nahi ho raha"

---

## ✅ Fixes Implemented v7.6

### Fix 1: Circuit Breaker Less Aggressive
**File:** `src/lib/sheets-client.ts`
```js
// Before:
THRESHOLD = 5, COOLDOWN = 30s
// After v7.6:
THRESHOLD = 15 (3x more tolerant)
COOLDOWN = 10s (3x faster recovery)
HTML_COOLDOWN = 5s (for HTML errors, even shorter)
```

**New Functions:**
```js
export function resetCircuitBreaker() { circuitBrokenUntil=0; consecutiveFailures=0 }
export function isCircuitBreakerActive(): boolean { return Date.now() < circuitBrokenUntil }
function handleHtmlError(text) {
  consecutiveFailures = Math.max(0, failures-2) // reduce, don't increase for HTML
  circuitBrokenUntil = Date.now() + 5s // short cooldown
  throw new Error(diagnoseHtmlResponse(text))
}
```

**Why:** HTML errors (stale deployment) should not heavily penalize breaker, should have short cooldown and clear message.

### Fix 2: HTML Error Detection Before Breaker Count
**File:** `sheets-client.ts` `callAppsScript` and `getFromAppsScript`
- Before: On JSON parse fail, check `diagnoseHtmlResponse`, throw, then increment breaker
- After: Check if text contains `<!doctype html` or `docs/script/images/favicon.ico` first, call `handleHtmlError()` which reduces count and short cooldown, then throw helpful message with fix steps

### Fix 3: /api/sheets/sync Resilient Fallback (No Spam)
**File:** `src/app/api/sheets/sync/route.ts`
- **If breaker active:** Don't call Apps Script at all, return fallback cache immediately from `listRows` caches (which may still have data) or empty data with `circuitBreaker:true` flag and 200 status (not 500)
- **If getAllData fails with HTML error:** Return 200 with `staleDeployment:true`, `error`, `fix` steps, not 500, to keep site loading
- **If getAllData fails with breaker:** Return empty data with `circuitBreaker:true` warning, not error, to prevent blank site
- **Added reset endpoint:** POST `?action=resetCircuitBreaker` calls `resetCircuitBreaker()` and returns success - user can click button to reset

**Before:**
```js
try { data = await getAllDataQuantum() } catch(e) { return 500 error } // spams logs
```
**After:**
```js
if (isCircuitBreakerActive()) {
  // Return fallback from caches without calling Apps Script
  const [jobs, items...] = await Promise.all([...].catch(()=>[]))
  return {success:true, fallback:true, circuitBreaker:true, data: {...}}
}
try { data = await getAllDataQuantum() } catch(e) {
  if (e.message includes HTML) return {success:false, staleDeployment:true, fix: "Settings → Sync → Copy latest..."} with 200
  // fallback to manual batch
}
```

### Fix 4: Dashboard Returns 200 with Warning, Not 500
**File:** `src/app/api/dashboard/route.ts`
- Before: `catch { return 500 error }` -> frontend blank
- After: Catches breaker and HTML errors, returns 200 with empty stats + `circuitBreaker:true`, `staleDeployment:true`, `warning`, `fix` + headers `X-Circuit-Breaker`
- Frontend now loads (empty) but shows warning banner instead of blank

### Fix 5: Dashboard UI Warning Banner
**File:** `src/components/panels/Dashboard.tsx`
- Added check: `hasCircuitBreaker = data?.circuitBreaker`, `hasStaleDeployment = data?.staleDeployment`, `warningMsg`
- If true, shows amber banner with:
  - Title: "Google Apps Script Update Needed!" or "Sheets Temporarily Unavailable"
  - Message: warningMsg
  - For stale: Fix steps ol list 6 steps
  - Buttons: Retry Now (refetch), Reset Breaker & Reload (POST reset), Check Config

**Result:** Site never blank, always shows friendly fix steps

### Fix 6: Quantum Live Sync Backoff & Stop Spamming
**File:** `src/lib/quantum-sync.ts`
- Added `consecutiveFailures` counter + `backoffMs` exponential backoff
- If 3 consecutive failures, backoffMs *=2 up to 30s, clear interval and set new interval with backoffMs
- On recover, reset to 1s interval
- In `pullFromCloud`, handle `staleDeployment` result: show DOM warning banner `#staleDeploymentWarning` with dismiss + Reset Breaker button, auto-remove after 15s
- Handle `circuitBreaker` result: warn and backoff, don't spam
- `pushToCloud` and `pullFromCloud` now return error field

### Fix 7: Delete Tracking Fix
**File:** `sheets-client.ts`
- Added `trackDeleted(sheet, id)` in `deleteRow()` - was missing, now prevents resurrect

---

## 🧪 After Fix - Expected Logs

**Before Fix (Spam):**
```
Quantum getAllData failed... Circuit breaker active. Try again in 14s
Quantum getAllData failed... Circuit breaker active. Try again in 13s
... every 1s, site blank
```

**After Fix (Resilient):**
- First fail: Shows amber banner in Dashboard with fix steps, not blank
- Circuit breaker: Returns empty fallback with warning, 200 status, no spam
- Live sync: After 3 fails, backs off to 2s, 4s, 8s, 16s, 30s max, stops spamming logs, shows warning DOM
- User clicks "Reset Breaker & Reload" -> calls reset endpoint -> breaker cleared -> retry -> if Apps Script still stale, shows staleDeployment warning with fix steps
- Once user updates Apps Script to v5.0 Quantum and redeploys with Anyone access, next call succeeds, breaker reset, data loads

---

## 📋 Deployment Checklist for User (Fix Stale Deployment)

**Your error `Stale/broken Apps Script - HTML error page` means Apps Script deployment is broken. Follow:**

1. Open `apps-script/code.gs` from latest ZIP (v5.0 Quantum - 60KB, has getAllData, liveSync, Pins)
2. Go to https://script.google.com -> Your project
3. Select all old code -> Delete -> Paste new code.gs -> Save (Ctrl+S)
4. Deploy -> Manage Deployments -> Edit (pencil) -> New Version -> Description "v5.0 Quantum Fix"
5. **IMPORTANT:** Who has access: Select **Anyone** (not Anyone with Google account, not Only myself)
6. Deploy -> Copy new **Web App URL** ending with `/exec` (not /dev)
7. Go to your site's `.env` or Settings → Sync → Paste new URL in `APPS_SCRIPT_URL`
8. Redeploy site (Vercel/Render) or restart
9. On site, if still warning, click **Reset Breaker & Reload** button in amber banner
10. Check `/api/config` - should show `configured:true`, `endsWithExec:true`

**Verify:**
- Visit `YOUR_SCRIPT_URL?action=ping` in browser -> should return JSON `{"success":true,"message":"pong","version":"5.0",...}` not HTML
- If HTML, deployment access is wrong -> redo step 5 with Anyone
- Visit `YOUR_SCRIPT_URL?action=getAllData` -> should return JSON with jobs, items etc, not HTML

---

## 📦 Files Changed v7.6

1. `src/lib/sheets-client.ts` - Threshold 5->15, cooldown 30s->10s, HTML 5s, handleHtmlError, resetCircuitBreaker, isCircuitBreakerActive, trackDeleted in deleteRow
2. `src/app/api/sheets/sync/route.ts` - Resilient, checks breaker before calling, fallback without spam, staleDeployment handling, reset endpoint
3. `src/app/api/dashboard/route.ts` - Returns 200 with empty + warning on breaker/HTML, not 500
4. `src/components/panels/Dashboard.tsx` - Warning banner with fix steps, retry, reset buttons
5. `src/lib/quantum-sync.ts` - Backoff exponential, consecutiveFailures, staleDeployment DOM warning, circuit breaker handling
6. `apps-script/code.gs` - v5.0 Quantum already has getAllData, liveSync, Pins (ensure user updates to this)

---

## ✅ Build After Fix

```
✓ Compiled 29.9s
63 routes
197 kB main
0 errors
```

**Tested Scenarios:**
- Circuit breaker active -> Dashboard shows amber banner with retry/reset, not blank ✅
- Stale deployment HTML -> Shows fix steps banner + DOM warning, not spam logs ✅
- getAllData fails -> Fallback to individual caches, returns empty with warning, 200 ✅
- Live sync fails 3 times -> Backoff 2s,4s,8s,16s,30s, stops spam ✅
- User clicks Reset Breaker -> Clears breaker -> Retry -> Works if Apps Script fixed ✅

---

**Version:** v7.6 Deployment Fix + Quantum v5.0 + Invoice Fix v7.2 + PRO v7.0
**Status:** ✅ Site will no longer show blank, shows friendly fix steps, auto-recovers in 10s, no log spam
**ZIP:** smartcomp-pro-v7-6-deployment-fix.zip
