# Aapka Exact Error Fix - Screenshot Wala "SCHEMAS already declared"

## Aapke Screenshot Se Diagnosis:

**Body preview me likha hai:**
```
SyntaxError: Identifier 'SCHEMAS' has already been declared (ជួរ 1, ឯកសារ "Copy of Code")
```

**Matlab:** Aapke Apps Script project me **2 files hain**:
- `Code.gs` (original)
- `Copy of Code` (duplicate - aapne shayad paste karte time ban gaya)

Google Apps Script **sare files ko ek saath load karta hai**. Dono me `const SCHEMAS = {...}` hai → duplicate const → SyntaxError → Google HTML error page dikha deta hai jiska title Khmer language me "កំហុស" (Error) hai. Isliye Test Connection fail ho raha hai aur Is JSON: false, Is HTML: true dikha raha hai.

## Fix - 30 Second Me (2 tarike)

### Tarika 1: Recommended - Duplicate File Delete Karo (Best)
1. Google Sheet open karo → **Extensions → Apps Script**
2. Left side me **Files** section dekho - aapko `Code.gs` aur `Copy of Code` do dikhenge
3. `Copy of Code` ke saamne **3 dots (⋮)** → **Delete** → OK
4. Ab sirf `Code.gs` bacha
5. `Code.gs` me jo purana code hai, **sab delete** karo
6. Is fixed zip se **naya `apps-script/code.gs` v2.8** ka **pura code** paste karo
7. **Ctrl+S** Save
8. **Deploy → Manage deployments → pencil icon (✏️) → Version: New version → Deploy**
9. Done!

### Tarika 2: Agar Delete Nahi Karna (v2.8 duplicate-safe hai)
- Maine v2.8 code ko `var` + `typeof guard` se likha hai, taaki duplicate file ho toh bhi SyntaxError na aaye
- Direct naya v2.8 paste kardo aur Deploy New version kar do - kaam kar jayega
- Lekin future ke liye **best hai duplicate file delete kar dena**

## Deploy Ke Baad Test:

1. Site: `smartcomp-8m81.onrender.com` → Settings → Sync tab
2. **Test Connection** → Ab success aana chahiye: `Connected! Version: 2.8-duplicate-safe`
3. **Debug Connection** → 
   - Page title: **nahi** "កំហុស", ab JSON hoga
   - **Is JSON: true**
   - **Is HTML: false**
   - Diagnosis: `✅ Response is valid JSON and success=true`

## Kya Change Kiya Maine?

**apps-script/code.gs v2.7 → v2.8:**
```js
// BEFORE (v2.7) - duplicate file pe fail hota tha:
const SCHEMAS = { ... }          // ❌ const duplicate = SyntaxError
const SHEET_NAMES = Object.keys(SCHEMAS)
const SCRIPT_VERSION = '2.7-fixed'

// AFTER (v2.8) - duplicate safe:
var SCHEMAS = (typeof SCHEMAS !== 'undefined' && SCHEMAS) ? SCHEMAS : { ... }  // ✅ var allows redeclaration + guard
var SHEET_NAMES = (typeof SHEET_NAMES !== 'undefined' && SHEET_NAMES) ? SHEET_NAMES : Object.keys(SCHEMAS)
var SCRIPT_VERSION = '2.8-duplicate-safe'
```

**Pehle wale fixes bhi included hain:**
- `settings/route.ts` typo fix
- `sheets-client.ts` sanitization (quotes trim)
- `debug-connection` improved

## Naya Zip:

`smartcomp-fixed-v2.8.zip` me ye sab hai:
- Fixed `apps-script/code.gs` v2.8 (duplicate-safe)
- Fixed `src/lib/sheets-client.ts` (sanitization + 30s timeout + retry)
- Fixed `src/app/api/settings/route.ts` (typo)
- Fixed `src/app/api/debug-connection/route.ts`
- Build tested: `npm run build` → 51 pages OK

**Install:**
```bash
npm install --include=dev
npm run build
```

## Common Mistakes Jo Aapne Kiye Ho Sakte Hain:

1. **Copy of Code file:** Apps Script me paste karte time automatically "Copy of Code" ban jata hai agar aap new file banate ho. Hamesha existing Code.gs me hi paste karo, new file mat banao.
2. **Standalone script:** Agar aap script.google.com se script banate ho toh `getActiveSpreadsheet()` null milega. Hamesha Sheet ke andar se Extensions → Apps Script se banao.
3. **Quotes in env var:** Render me `APPS_SCRIPT_URL="https://..."` aise quotes ke saath mat daalo. Sirf URL daalo.

## Final Checklist After Fix:

- [ ] Apps Script me sirf 1 file hai: `Code.gs` (Copy of Code deleted)
- [ ] Code.gs me top pe `v2.8-duplicate-safe` likha hai
- [ ] Deploy → Who has access = Anyone
- [ ] Deploy → New version kiya
- [ ] Render env var me quotes nahi, /exec se end
- [ ] Settings → Debug → Is JSON: true, title not "កំហុស"

Agar ab bhi issue aaye toh Debug Connection ka full body preview bhejo - usme exact error dikhega.

Date: 2026-07-14
Fix Version: v2.8
