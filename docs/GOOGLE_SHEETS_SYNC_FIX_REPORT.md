# Google Sheets Sync Fix Report - v2.7 Fixed Edition (2026-07-14)

## Aapki Problem Kya Thi?
- Site working fine tha lekin Google Sheets se data sync nahi ho raha tha
- Error aa raha tha jab Test Connection / Debug Connection karte the
- Settings → Sync tab me "URL does NOT end with /exec" ka red badge hamesha dikhta tha chahe URL sahi ho

## Root Causes (3 Bugs Mile)

### Bug 1: Settings API Typo (Critical)
**File:** `src/app/api/settings/route.ts` line 11
```ts
// BEFORE (Bug):
urlEndsWithExec: urlInfo.endsWithWithExec   // ❌ typo - property does not exist, always undefined

// AFTER (Fixed):
urlEndsWithExec: urlInfo.endsWithExec       // ✅ correct
```
- Is wajah se UI hamesha "URL does NOT end with /exec ✗" dikha raha tha, even when correct

### Bug 2: APPS_SCRIPT_URL Sanitization Missing
**File:** `src/lib/sheets-client.ts`
- Users aksar `.env.example` se copy karte time quotes ke saath copy kar dete hain: `"https://.../exec"`
- Render/Vercel env var me agar quotes included ho toh URL invalid ho jata hai
- Pehle code trim nahi karta tha, quotes nahi hatata tha
- **Fix:** Added `getSanitizedUrl()` function jo:
  - Trim whitespace
  - Remove surrounding `"`, `'`, `` ` `` quotes
  - Remove internal newlines/spaces
  - Validates `script.google.com` present
  - Masked preview shows sanitized version

### Bug 3: Apps Script Old Version Returning HTML Error Page (فشل)
**File:** `apps-script/code.gs`
- Agar aapne old `code.gs` deploy kiya ho (v2.5 ya older) toh `test` action bhi sheets ko access karne ki koshish karta tha
- Agar script standalone tha (script.google.com se banaya, Sheet ke Extensions → Apps Script se nahi), toh `getActiveSpreadsheet()` null return karta aur Google HTML error page dikhata jiska title Arabic me "فشل" (fail) hota
- Next.js ko JSON expected tha lekin HTML mila → sync fail
- **Fix v2.7:**
  - `test` aur `ping` actions kabhi bhi sheet access nahi karte - sirf JSON return
  - `ensureAllSheets()` me null-check add kiya with clear error message in Hindi/English
  - `listRows` aur `getRow` me defensive column reading (agar sheet me columns kam ho toh crash nahi)
  - Dashboard error wrapping improved - kabhi bhi HTML error page nahi, hamesha JSON
  - Version bump 2.6 → 2.7 for debugging

### Bug 4: Debug Endpoint Using Raw Env Var
**File:** `src/app/api/debug-connection/route.ts`
- Raw `process.env.APPS_SCRIPT_URL` use kar raha tha, sanitized nahi
- Agar env me quotes/spaces ho toh debug bhi fail
- **Fix:** Now uses `getSanitizedUrl()` and improved diagnosis for "فشل" Arabic error page

### Improvement: Retry Logic + Timeout
- Timeout 25s → 30s (Apps Script cold start 10-15 sec tak lag sakta hai)
- Retry: Added 500/502/503/504 Google temporary errors
- Added `Accept: application/json` header
- Better error messages with FIX steps

---

## Kya Fix Kiya Gaya (Code Changes)

1. `src/app/api/settings/route.ts` - typo fix
2. `src/lib/sheets-client.ts` - complete rewrite with sanitization, robust retry, better diagnosis, Hindi+English error messages
3. `src/app/api/debug-connection/route.ts` - uses sanitized URL + better diagnosis for Arabic error
4. `apps-script/code.gs` - v2.7 with bound-sheet check, test action isolation, defensive column reads

Build tested: `npm run build` → ✅ Success (51 pages, 0 errors)

---

## Aapko Ab Kya Karna Hai (3 Steps)

### Step 1: Google Sheet Apps Script Update (MOST IMPORTANT)
1. Apni Google Sheet open karo
2. **Extensions → Apps Script**
3. Existing code **delete** karo
4. Is repo ka **naya** `apps-script/code.gs` (v2.7) **paste** karo - pura file
5. Save (Ctrl+S)
6. **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**
7. Same `/exec` URL rahega (copy karne ki zarurat nahi if same deployment)

> ⚠️ **CRITICAL:** Script **hamesha** Google Sheet ke andar se banao: Extensions → Apps Script. Kabhi bhi https://script.google.com homepage se standalone script mat banao - usme `getActiveSpreadsheet()` null milega aur sync fail hoga.

### Step 2: Render / Vercel Env Var Check
1. Render dashboard → your service → Environment
2. `APPS_SCRIPT_URL` check karo:
   - Should be: `https://script.google.com/macros/s/AKfy.../exec`
   - **No quotes!** Agar `"..."` quotes dikhe toh hata do
   - Must end with `/exec` (not `/edit`)
   - Must contain `script.google.com/macros/s/`
3. Save → **Redeploy** (auto redeploy nahi toh manual Redeploy)

### Step 3: Test Connection
1. Site open → Login → Settings → Sync tab
2. Ab `Configured APPS_SCRIPT_URL` dikhega + green badge `URL ends with /exec ✓`
3. **Test Connection** click → should show "Connected to Google Sheets successfully! Version: 2.7-fixed"
4. Agar fail ho toh **Debug Connection** click → full response dekho → diagnosis me exact FIX likha hoga

---

## Agar Ab Bhi Error Aaye toh Checklist

- [ ] Apps Script deployment me "Who has access" = **Anyone** (not Only myself)
- [ ] Script Sheet ke andar se bana hai (Extensions → Apps Script), standalone nahi
- [ ] Once deploy ke baad, Apps Script URL ko browser me directly open karo → Allow permission → phir Test Connection
- [ ] Render env me APPS_SCRIPT_URL me quotes nahi
- [ ] Apps Script code v2.7 hai (top me version 2.7-fixed likha)
- [ ] Settings → Sync → Debug Connection me "Is JSON: true" aana chahiye

Common errors and fix:
- **LOGIN page**: Deploy → Who has access = Anyone → New version → Deploy
- **فشل / Error page**: Old code.gs → naya v2.7 paste → New version → Deploy
- **EDITOR page (/edit)**: Deploy → New deployment → Web app → copy /exec URL, not /edit
- **NOT FOUND 404**: Deployment deleted → New deployment → copy new URL → update env var

---

## Zip File

Full fixed site code is in `smartcomp-fixed-v2.7.zip` (node_modules excluded, run `npm install --include=dev` then `npm run build`)

Includes:
- All source fixes
- New apps-script/code.gs v2.7
- This fix report

Date: 2026-07-14
Version: 2.7-fixed
