# SmartComp Mobile App — Complete Setup Guide

> **Ye guide kiske liye hai:** SmartComp shop owner / developer jo mobile app ko
> zero se setup karke chalana chahta hai — testing (Expo Go) se lekar actual
> **APK build + phone pe install** tak. Steps Hinglish me likhe hain, commands
> English me hain — copy-paste karke chala sakte ho.

---

## 1. Ye app kya hai? (2-minute summary)

SmartComp Mobile ek **React Native (Expo SDK 52)** app hai jo aapke existing
SmartComp **web backend ke saath kaam karti hai** — koi alag server/database
nahi banana padta.

```
┌─────────────────────┐         HTTPS/HTTP          ┌──────────────────────────┐
│  SmartComp Mobile   │  ────────────────────────►  │  SmartComp Web Backend   │
│  (React Native)     │    /api/* (same routes      │  (Next.js + Firebase     │
│                     │     jo web UI bhi use       │   Firestore)             │
│  • PIN login        │     karta hai)              │                          │
│  • Offline mode     │                             │  • 112 API endpoints     │
│  • Barcode scan     │                             │  • Same data, same bills │
│  • Push notified    │                             │  • PIN auth (APP_PIN)    │
└─────────────────────┘                             └──────────────────────────┘
```

**Kya-kya kar sakte ho mobile se:**

| Feature | Detail |
| --- | --- |
| Dashboard | Aaj ki sales, pending jobs, low stock — ek screen pe |
| Sales / Invoices | List + search + naya invoice banana + share |
| Service Jobs | List + status update + naya job create |
| Inventory | Items + stock + **barcode scanner** se search |
| Customers | List + full merged statement (sales + service ledger) |
| Offline | Internet gaya? Data dikhega + writes queue ho jayenge, wapas aane pe auto-sync |
| Push | Naya job, status change, low stock pe notification |

**Kya mobile pe NAHI hai (jaan boojh ke):** Reports, GST filing, AutomationHub,
AI Chatbot jaise complex screens — inke liye app "More" tab se web app khol
deti hai (deep link). Ye read-mostly companion app hai, web ka replacement nahi.

---

## 2. Requirements (kya-kya chahiye)

### Aapke PC pe (development + build ke liye)

| Cheez | Version | Check command |
| --- | --- | --- |
| Node.js | 20 ya newer | `node -v` |
| npm | 10+ | `npm -v` |
| Expo CLI | latest (npx se auto) | `npx expo --version` |
| EAS CLI | latest (APK build ke liye) | `npx eas --version` |

> Android Studio / Xcode ki zaroorat NAHI hai — **EAS cloud build** use karenge
> (Expo ki servers pe APK banta hai, aapke PC pe sirf 5 min ka kaam).

### Aapke phone pe

| Cheez | Kahan se | Kiske liye |
| --- | --- | --- |
| **Expo Go** app | Play Store / App Store | Testing ke liye (free, 2 min) |
| Koi bhi Android 8+ ya iPhone | — | Testing + real use |

### Accounts (sirf build ke time, one-time free)

- **Expo account** — https://expo.dev/signup (free). EAS build ke liye chahiye.
  Free tier me har mahine ~15 cloud builds milte hain — ek shop ke liye kaafi.

### Backend

- SmartComp web app **deployed aur chalu** hona chahiye (Render / VPS / localhost).
- Backend pe `APP_PIN` env variable set hona chahiye (4-8 digit) — isi PIN se
  mobile login hoga. Agar `APP_PIN` set nahi hai to app login skip kar deti hai
  (open access mode).

---

## 3. Fast-track: 15 minute me app test karo (TL;DR)

Ye 6 commands + 1 QR scan — bas:

```bash
# 1. Web backend chalu karo (ek terminal me)
cd smartcomp25
APP_PIN=1234 npm run dev        # ya aapka deployed URL use karo

# 2. Mobile app install (dusra terminal me)
cd smartcomp25/mobile
npm install

# 3. Backend URL set karo
cp .env.example .env
# .env file kholo aur EXPO_PUBLIC_API_URL me apna URL daalo:
#   Local testing:   EXPO_PUBLIC_API_URL=http://<APNI-LAN-IP>:3000
#   Production:      EXPO_PUBLIC_API_URL=https://aapka-domain.com

# 4. Metro dev server start
npm start

# 5. Phone pe "Expo Go" app kholo → QR code scan karo
#    (terminal me jo QR dikh raha hai)

# 6. App me PIN daalo → Dashboard ready! 🎉
```

Stuck ho gaye? Neeche Step-by-Step section me har cheez detail se hai.

---

## 4. Step-by-Step Setup (detail me)

### STEP 1 — Backend ready karo

Mobile app sirf ek "client" hai — saara data aapke web backend se aata hai.
Isliye pehle backend confirm karo:

**Option A: Backend already deployed hai (Render/VPS/domain)**

Bas URL note kar lo, aur check karo:

```bash
# Backend zinda hai? (koi bhi machine se)
curl https://aapka-domain.com/api/health

# PIN auth active hai? (response me pinRequired: true hona chahiye)
curl https://aapka-domain.com/api/auth/status
```

**Option B: Local development (aapke PC pe)**

```bash
cd smartcomp25
npm install
APP_PIN=1234 npm run dev
# Server http://localhost:3000 pe start hoga
```

> **Important:** `APP_PIN` set karna mat bhoolna. Ye PIN web login bhi aur
> mobile login bhi dono ke liye same hai. Firebase/Firestore env vars
> (`.env` in root) configured hone chahiye warna data show nahi hoga.

---

### STEP 2 — PC prerequisites install karo

```bash
node -v        # 20.x ya newer chahiye — warna nodejs.org se install karo
npx expo --version   # Expo CLI (npx khud download kar lega, global install ki zaroorat nahi)
```

Expo Go app phone pe install karo:
- **Android:** Play Store → "Expo Go" search karo
- **iPhone:** App Store → "Expo Go"

Phone aur PC **same Wi-Fi network** pe hone chahiye (LAN testing ke liye).

---

### STEP 3 — Mobile project install karo

```bash
cd smartcomp25/mobile
npm install
```

> Ye `mobile/` folder web app se **bilkul alag** hai — apna package.json,
> apna node_modules. Web app ka build isse **affected nahi** hota
> (web ka tsconfig/eslint mobile ko exclude karte hain).

---

### STEP 4 — Backend URL configure karo (.env)

Pehle apne PC ka **LAN IP** pata karo (phone same Wi-Fi se connect karega):

```bash
# Windows (PowerShell):
ipconfig | findstr IPv4          # e.g. 192.168.1.10

# Mac/Linux:
ifconfig | grep "inet " | grep -v 127   # e.g. 192.168.1.10
```

Ab config file banao:

```bash
cd smartcomp25/mobile
cp .env.example .env
```

`.env` kholo aur pehli line edit karo:

```env
# Production backend:
EXPO_PUBLIC_API_URL=https://aapka-domain.com

# YA local testing (apni LAN IP daalo, localhost NAHI):
EXPO_PUBLIC_API_URL=http://192.168.1.10:3000

# Optional — dev me PIN auto-fill ke liye:
EXPO_PUBLIC_APP_PIN=1234
```

> **⚠️ Common mistake #1:** `localhost` likhna. Phone pe `localhost` ka matlab
> **phone khud** hota hai, aapka PC nahi! Hamesha LAN IP (`192.168.x.x`) ya
> production URL use karo.
>
> **⚠️ Common mistake #2:** URL ke end me `/` mat lagao.
> `https://abc.com/` galat hai, `https://abc.com` sahi hai.

Baaki vars (`EXPO_PUBLIC_DEFAULT_COUNTRY_CODE=91`, `EXPO_PUBLIC_LINK_SCHEME=smartcomp`)
default pe chhod do.

> **Runtime me bhi badal sakte ho:** App → More tab → Settings → "Edit server
> URL" — APK ban jane ke baad bhi server URL change hota hai, rebuild nahi
> chahiye (SecureStore me save hota hai).

---

### STEP 5 — Dev server chalao + phone pe test karo

```bash
cd smartcomp25/mobile
npm start
```

Terminal me **QR code** dikhega. Ab:

1. Phone pe **Expo Go** app kholo
2. "Scan QR code" pe tap karo → PC ka QR scan karo
3. App bundle hoke phone pe khul jayegi (pehli baar 1-2 min lagta hai)
4. **Login screen** aayegi → apna **PIN** daalo (wahi jo backend ke `APP_PIN` me hai)
5. Dashboard! 🎉

**Expo Go ke terminal shortcuts:**
- `a` = Android emulator kholo (agar hai)
- `i` = iOS simulator (sirf Mac)
- `r` = app reload
- `j` = dev tools kholo
- `w` = web browser me kholo

Code change karo → save karo → app me turant reload hota hai (hot reload).

---

### STEP 6 — Features explore karo

| Tab | Kya karo |
| --- | --- |
| **Home** | KPI cards (aaj ki sales, pending jobs, dues), 7-day bar chart, recent invoices/jobs, low stock alert |
| **Sales** | Invoice list, search, status filter; koi invoice kholo → items + totals + share button |
| **Service** | Jobs list, search; job kholo → status timeline, parts, payment; **Next Status** button se ek-tap advance |
| **Inventory** | Items, stock, low-stock toggle; camera icon → **barcode scan** karke item dhundo |
| **More** | Customers (list + merged statement), settings, offline queue, web links |

**Offline test karo:** Phone ka Wi-Fi/data OFF karo → app phir bhi purana data
dikhati hai. Naya invoice banao → "queued" dikhega. Internet ON karo → app
foreground pe aate hi auto-sync (More tab pe queue badge dikhta hai).

**+ FAB** (floating button) se naya invoice / job create kar sakte ho.

---

## 5. APK Build (real installable app — Expo Go ki zaroorat nahi)

Testing Expo Go me hoti hai, lekin **shop me daily use** ke liye proper APK
chahiye jo phone pe install ho aur app drawer me SmartComp icon dikhe.

EAS Build cloud pe hota hai — aapke PC pe Android Studio nahi chahiye,
build 5-15 min me Expo ki servers pe hota hai aur download link milta hai.

### STEP 7 — Expo account + EAS setup (one-time, 5 min)

```bash
cd smartcomp25/mobile

# 1. Free Expo account banao (agar nahi hai): https://expo.dev/signup
npx eas login           # email/password daalo

# 2. Project ko EAS se register karo (ONE-TIME — sabse important step!)
npx eas init
```

> **⚠️ `eas init` kya karta hai:** Aapke Expo account pe project register
> karke ek **real Project ID** (UUID format) generate karta hai aur
> `app.json` me `extra.eas.projectId` ko **automatically update** kar deta hai.
> Ye step skip mat karna — push notifications aur EAS build dono isi ID ko
> use karte hain. (Code is ID ko `expo-constants` se padhta hai, koi manual
> edit nahi karna padta.)
>
> `git diff app.json` chala ke confirm kar lo ki projectId badal gaya hai.

### STEP 8 — APK build karo

```bash
# Preview APK (testing + direct install ke liye) — build:apk script use karo:
npx eas build --platform android --profile preview
# ya shortcut:
npm run build:apk
```

Kya hoga:
1. EAS poora project upload karega (1-2 min)
2. Cloud pe build hoga (5-15 min — terminal me live logs)
3. Last me **download URL** milega (browser me bhi khul jata hai)

### STEP 9 — Phone pe APK install karo

1. Download link phone pe kholo (WhatsApp/Telegram se bhi bhej sakte ho)
2. APK download hone pe tap karo
3. Android poochhega "Install unknown apps?" → **Allow** (sirf pehli baar)
4. Install → **SmartComp** icon app drawer me aa jayega
5. Kholo → PIN daalo → kaam shuru!

> APK me pehle se **.env ka EXPO_PUBLIC_API_URL bake** ho jata hai. Baad me
> Settings se bhi badal sakte ho (rebuild nahi chahiye).
>
> **⚠️ HTTP LAN URL + APK:** Agar APK me `http://192.168.x.x` jaisa non-HTTPS
> URL baked hai to Android usse **block kar sakta hai** (cleartext policy).
> Expo Go me ye problem nahi hoti. Solutions:
> - **Best:** Production build me HTTPS backend URL use karo (Render/VPS)
> - **Workaround (sirf internal testing):** `app.json` → `expo.android` me
>   `"usesCleartextTraffic": true` add karke rebuild karo. Production me
>   mat rakhna — HTTPS hi secure hai.

### Production AAB (Play Store ke liye)

```bash
npm run build:android    # → app-bundle (.aab) — Play Store upload ke liye
```

**Play Store publish karne ho to:**
1. $25 one-time Google Play Developer account kharido (https://play.google.com/console)
2. `npm run build:android` se AAB download karo
3. Play Console → "Create app" → AAB upload karo → listing bharo → submit
4. Review 1-7 din me ho jata hai (shop-internal apps ke liye Play ka
   "Internal testing" track sabse fast hai — `eas.json` me pehle se
   configured hai: `submit.production.android.track = "internal"`)

**iPhone / App Store:** `npm run build:ios` — lekin iOS build ke liye **Apple
Developer account** ($99/year) chahiye, aur build sirf Mac se ya EAS cloud pe
hogi. Shop ke liye Android pehle karo — India me 95%+ phones Android hain.

---

## 6. Push Notifications setup

App khud push token register kar leti hai (physical device pe):
1. Pehli baar app kholne pe permission popup aata hai → Allow karo
2. Token backend ke `/api/notifications/register` pe save ho jata hai
   (`PushTokens` collection in Firestore)
3. Backend ab aapko bhej sakta hai: naya job, status change, low stock alerts

**Dhyan rakhna:**
- Push **sirf physical phone** pe kaam karta hai — emulator/simulator pe nahi
- Android 13+ pe notification permission maangna zaroori hai (app khud karti hai)
- `eas init` ke **baad** hi push token generate hota hai (real projectId
  chahiye) — Expo Go testing me bhi

**Testing:** Settings screen me "Push token" dikhta hai — copy karke
https://expo.dev/notifications pe paste karo → test notification turant
aayega.

---

## 7. OTA Updates (optional — app store ke bina update)

Chhote code changes (UI fix, naya screen) ke liye poora APK rebuild karke
sabko dobara install karwana bhaari padta hai. **EAS Update** se JS bundle
directly phones pe update hota hai:

```bash
npx eas update:configure     # one-time
npx eas update --branch production --message "v1.0.1: invoice fix"
```

Users next app-open pe naya code automatically pa lete hain. (Native modules
change hue to full build hi chahiye — camera/permissions wale changes.)

---

## 8. Project structure (developer ke liye)

```
mobile/
├── app.json                 # Expo config (icon, permissions, EAS projectId)
├── eas.json                 # Build profiles (preview=APK, production=AAB)
├── .env                     # EXPO_PUBLIC_API_URL (gitignored)
├── app/                     # Expo Router v4 — file-based routing
│   ├── _layout.tsx          # Root: providers + auth gate
│   ├── login.tsx            # PIN login
│   ├── (tabs)/              # 5 bottom tabs: Home, Sales, Service, Inventory, More
│   ├── invoice/[id].tsx     # Invoice detail
│   ├── invoice/new.tsx      # Create invoice
│   ├── customer/[id].tsx    # Customer merged statement
│   ├── job/[id].tsx         # Job detail
│   ├── job/new.tsx          # Create job
│   ├── barcode.tsx          # Barcode scanner
│   └── settings.tsx         # Server URL, push, offline queue
└── src/
    ├── lib/api.ts           # REST client + manual cookie auth
    ├── lib/offline-queue.ts # AsyncStorage write-replay queue
    ├── lib/config.ts        # Runtime server URL (SecureStore)
    ├── hooks/               # useAuth, useApi (React Query), usePush, useOfflineSync
    ├── components/          # 12 reusable UI components
    └── types/index.ts       # TS types (web API shapes se mirror)
```

**Login kaise kaam karta hai (technical):**
1. App `POST /api/auth/login` me PIN bhejta hai
2. Backend valid PIN pe `smartcomp_auth` HttpOnly cookie set karta hai (30 din)
3. RN ka fetch cookies auto-save NAHI karta — isliye `api.ts` cookie manually
   capture karke **SecureStore** me rakhta hai (iOS Keychain / Android KeyStore)
4. Har next request pe `Cookie:` header ke saath bhejta hai
5. 401 aaye to auto-logout + login screen
6. Wrong PIN 5 baar? Backend 1 min ke liye rate-limit (429) karta hai

---

## 9. Troubleshooting (common problems + solutions)

| Problem | Solution |
| --- | --- |
| **"Cannot connect to server" login pe** | 1) `.env` me URL sahi hai? 2) `localhost` mat likho — LAN IP ya production URL 3) URL end me `/` nahi 4) Backend chalu hai? `curl <URL>/api/health` se check 5) PC firewall port 3000 block to allow karo |
| **QR scan ke baad app load nahi hoti** | Phone aur PC same Wi-Fi pe? Corporate Wi-Fi client isolation rakhta hai — mobile hotspot try karo, ya `npx expo start --tunnel` (internet se tunnel) |
| **"APP_PIN is not configured"** | Backend start karte waqt `APP_PIN=1234` env var set karo. Deployed hai to Render/VPS env vars me add karo aur redeploy |
| **Login pe 429 / "Too many attempts"** | 5 galat PIN ke baad 1 min lock — ruko, sahi PIN yaad karo 😄 |
| **Data blank / sab khali** | Backend ke Firebase env vars missing — root `.env` check karo (web app me data dikh raha hai? to backend theek hai, URL galat hai) |
| **Barcode scanner camera nahi khulta** | Phone Settings → Apps → SmartComp → Permissions → Camera allow. Expo Go me: phone settings → Expo Go → camera |
| **Push notification nahi aata** | 1) Physical device chahiye 2) `eas init` hua? 3) Settings → Push permission "granted"? 4) https://expo.dev/notifications se test karo |
| **Offline writes gayab dikh rahe** | More tab → Offline Queue → entries + retry count dekho → "Flush now" dabao |
| **APK install "App not installed"** | Purani version uninstall karke phir se (debug vs release signing conflict) |
| **Metro bundler error** | `npx expo start --clear` (cache reset). Phir bhi error to `rm -rf node_modules && npm install` |
| **Build fail on EAS** | Terminal me poora error padho — 99% cases me `eas init` skip kiya hai ya login expire hua (`npx eas login` dobara) |

---

## 10. FAQ

**Q: Kya mobile app web app ko replace karegi?**
Nahi. Ye **companion** app hai — owner/shop staff ke daily mobile workflows
(invoice dekhna, job status update, stock check, customer balance). Complex
kaam (GST filing, reports, automation) web pe hi best hain — mobile "More"
tab se web khol deti hai.

**Q: Data web aur mobile me same hai?**
Haan — dono same Firestore backend + same API routes use karte hain. Web pe
invoice banao, mobile pe turant dikhega (pull-to-refresh).

**Q: Offline me kya-kya hota hai?**
Padhna (read) — cached data milta hai. Likhna (invoice/job create) — queue me
jaata hai, internet aane pe auto-replay (max 10 retries). Payment collection
offline create ho sakta hai lekin Razorpay nahi (online-only).

**Q: Kitne phones pe chalegi?**
Jitne chaho — ek APK sabko bhejo. Har apne PIN se login karega (same PIN).
Push token har device ka alag register hota hai.

**Q: App ka naam/icon change karna hai?**
`app.json` → `expo.name`, `version`, aur `mobile/assets/icon.png` badlo →
rebuild. Icon ke liye 1024×1024 PNG chahiye.

**Q: Expiry / license?**
Koi nahi — ye aapka khud ka code hai, koi third-party subscription nahi.
Sirf EAS cloud build free tier ki limit hai (~15/month) — uske baad bhi
local build (Android Studio) se unlimited free.

**Q: iPhone pe kab?**
Code iOS-ready hai (`npm run build:ios`), bas Apple Developer account
($99/yr) chahiye. Pehle Android pe sab settle karo.

---

## 11. Quick Reference Card (print karke rakho)

```bash
# ── DAILY ──────────────────────────────────────────────
cd smartcomp25 && npm run dev          # backend start (APP_PIN ke saath)
cd smartcomp25/mobile && npm start     # metro dev server → Expo Go QR scan

# ── BUILD ──────────────────────────────────────────────
npx eas login                          # one-time
npx eas init                           # one-time (projectId app.json me set)
npx expo start --clear                 # cache-clear restart
npm run build:apk                      # APK (direct install)
npm run build:android                  # AAB (Play Store)
npm run typecheck && npm run lint      # code quality check

# ── CONFIG FILES ───────────────────────────────────────
mobile/.env       → EXPO_PUBLIC_API_URL (backend URL)
mobile/app.json   → name, icon, version, permissions, projectId
mobile/eas.json   → build profiles (preview / production)

# ── USEFUL URLS ────────────────────────────────────────
https://expo.dev/signup        # free Expo account
https://expo.dev/notifications # push token test
https://docs.expo.dev/build    # EAS build docs
```

**Setup order yaad rakhne ka tarika:**
`Backend chalu → npm install → .env URL → npm start → QR scan → PIN →
eas login → eas init → build:apk → install` 🚀


