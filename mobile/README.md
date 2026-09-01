# SmartComp Mobile App (React Native / Expo)

> **🚀 Setup ke liye poora guide:** [`MOBILE_SETUP_GUIDE.md`](./MOBILE_SETUP_GUIDE.md)
> — zero se lekar APK build + install tak, step-by-step (Hinglish me).

A companion mobile app for the SmartComp web backend. Talks to the same
`/api/*` routes that the web UI uses, with PIN-based auth, offline-first
write queue, barcode scanner, and push notifications.

> Sits in `mobile/` — completely separate from the Next.js web app.
> The web app's `tsconfig.json` and `eslint.config.mjs` explicitly
> exclude `mobile/**` so the Next.js build (`npx next build`) and the
> web lint (`npx eslint src`) are NOT affected by this directory.

## Architecture

```
mobile/
├── app/                          # Expo Router v4 (file-based routes)
│   ├── _layout.tsx               # Root: providers + auth gate
│   ├── login.tsx                 # PIN entry (auth-cookie capture)
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Bottom tab bar (5 tabs)
│   │   ├── index.tsx             # Dashboard (KPIs, charts, recent activity)
│   │   ├── sales.tsx             # Invoices list (search + status filter)
│   │   ├── service.tsx           # Service jobs list
│   │   ├── inventory.tsx         # Items + stock (with barcode scan button)
│   │   └── more.tsx              # More menu (customers, reports, settings)
│   ├── invoice/
│   │   ├── [id].tsx              # Invoice detail (items table, totals, share)
│   │   └── new.tsx               # Create invoice (mobile-friendly)
│   ├── customer/
│   │   ├── list.tsx              # Customer list (search)
│   │   └── [id].tsx              # Customer detail + merged statement
│   ├── job/
│   │   ├── [id].tsx              # Job detail (status timeline, parts, payment)
│   │   └── new.tsx               # Create service job
│   ├── barcode.tsx               # Camera-based barcode scanner
│   ├── settings.tsx              # Server URL, push, offline queue, cache
│   └── +not-found.tsx            # 404
└── src/
    ├── lib/
    │   ├── api.ts                # REST client (manual cookie persistence)
    │   ├── auth.ts               # PIN auth (login, logout, status)
    │   ├── config.ts             # Server URL (SecureStore) + scheme
    │   ├── offline-queue.ts      # AsyncStorage-backed write replay queue
    │   ├── storage.ts            # AsyncStorage cache layer (read-through)
    │   ├── theme.ts              # Color + spacing tokens (matches web palette)
    │   ├── format.ts             # INR + date + phone formatters (en-IN)
    │   └── haptics.ts            # Haptic feedback wrappers
    ├── hooks/
    │   ├── useAuth.tsx           # Auth context provider
    │   ├── useApi.ts             # React Query wrappers (useDashboard, useInvoices, …)
    │   ├── useOfflineSync.ts     # Queue size + flush trigger
    │   └── usePushNotifications.ts  # Expo push token registration
    ├── components/               # Card, StatCard, SearchBar, Button, FAB,
    │                             #   ListRow, Badge, Avatar, ScreenHeader,
    │                             #   EmptyState, ErrorView, LoadingSpinner
    └── types/index.ts            # Shared TS types (mirror web app API shapes)
```

## Getting started

### Prerequisites

- **Node.js 20+** (matches the web app)
- **Expo CLI** — install once globally: `npm install -g expo-cli`
  - Or use `npx expo <cmd>` to run without global install.
- For Android testing: an Android Studio emulator OR a physical Android
  device in USB-debugging mode.
- For iOS testing (macOS only): Xcode + iOS Simulator, OR a physical
  iPhone with a free Apple Developer account.

### Install + run

```bash
cd mobile
npm install

# Configure backend URL (see .env.example for full list)
cp .env.example .env
# Edit .env → set EXPO_PUBLIC_API_URL=https://smartcomp.shop

# Start the dev server (Metro)
npm start
# or: npx expo start

# Press `a` to open Android, `i` to open iOS, or scan the QR code
# with the Expo Go app on your phone.
```

### Production build

```bash
# 1. Install EAS CLI globally
npm install -g eas-cli

# 2. Log in to your Expo account (one-time)
eas login

# 3. Configure EAS project (one-time — creates eas.json)
eas build:configure

# 4. Build APK for testing
npm run build:apk
# → EAS uploads the project, builds an APK on Expo's cloud,
#   and gives you a download URL.

# 5. Production AAB (Android App Bundle, for Play Store)
npm run build:android

# 6. Production IPA (iOS, for App Store — requires Apple Developer account)
npm run build:ios
```

See the official EAS Build docs at https://docs.expo.dev/build/introduction/.

## Configuration

| Variable                    | Required | Description                                                         |
| --------------------------- | -------- | ------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`       | Yes      | Base URL of your deployed SmartComp web app (no trailing slash).    |
| `EXPO_PUBLIC_APP_PIN`       | No       | Pre-shared PIN (4-8 digits). Auto-fills the login form for testing. |
| `EXPO_PUBLIC_DEFAULT_COUNTRY_CODE` | No | Default phone country code (default: `91` for India).              |
| `EXPO_PUBLIC_LINK_SCHEME`   | No       | Deep link scheme (default: `smartcomp`). Must match `app.json`.    |

These variables are also configurable at runtime via the Settings
screen — server URL is stored in `expo-secure-store` and persists
across app restarts.

## Auth flow

The web backend uses PIN-based auth (see `src/proxy.ts` + `src/app/api/auth/login/route.ts`):

1. Mobile app POSTs `{ pin }` to `/api/auth/login`.
2. The backend validates the PIN against the `APP_PIN` env var, hashes
   it with a salt, and sets an HttpOnly `smartcomp_auth` cookie (30-day
   expiry).
3. **React Native's `fetch` does NOT persist cookies the way browsers
   do** — so the mobile `api.ts` interceptor captures the `Set-Cookie`
   header manually, stores the cookie value in `expo-secure-store`,
   and re-sends it as a `Cookie:` header on every subsequent request.
4. On app restart, the cookie is loaded from SecureStore before the
   first request fires.
5. If a request fails with HTTP 401, the auth cookie is invalidated
   and the user is redirected to the login screen.

## Offline-first behaviour

The mobile app has a 2-layer cache:

- **Layer 1 — In-memory:** React Query's default cache (60s stale time).
- **Layer 2 — Disk:** `AsyncStorage` per-endpoint cache. The `useApiGet`
  hook checks the disk cache first; if the data is fresh (within TTL),
  it serves from disk without a network call.

Write operations (`POST` / `PUT` / `DELETE`) are wrapped by
`useOfflineMutation`, which:

1. Executes the write attempt immediately.
2. On network failure (or HTTP 401/503), enqueues the write in the
   `offline-queue` (backed by `AsyncStorage`).
3. Auto-replays on the next app foreground event (`AppState === 'active'`).
4. Honors a max-retry count (10) — after 10 retries, the entry is
   dropped and the user is notified.

The "More" tab shows the queue size as a badge + a "Flush now" button
to manually drain it. The "Settings" screen shows the queue entries
with their retry counts and last-error messages.

## Native features

| Feature                | Implementation                                                                 |
| ---------------------- | ------------------------------------------------------------------------------ |
| Barcode / QR scan      | `expo-barcode-scanner` — full-screen camera with custom targeting reticle.    |
| Push notifications     | `expo-notifications` — auto-registers the device on first foreground, posts token to `/api/notifications/register`. |
| Haptics                | `expo-haptics` — light/medium/heavy impact + success/error/warning/select.    |
| Secure storage         | `expo-secure-store` — auth cookie + push token + server URL persisted securely (Keychain on iOS, KeyStore on Android). |
| Deep links             | `smartcomp://` scheme + `https://smartcomp.shop` universal links.               |
| Clipboard              | `expo-clipboard` — copy invoice/job IDs, push token.                          |

## Compared to the web app

The mobile app is **read-mostly** — it focuses on the workflows an
owner needs when away from the shop:

| Web feature                                  | Mobile status                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Dashboard                                    | ✅ Full KPI grid + 7-day bar chart + recent invoices/jobs + low-stock list |
| Sales (invoices list + create)              | ✅ List + search + status filter; ✅ Mobile-friendly create (less complex than web) |
| Service jobs (list + create + status update) | ✅ List + search + status filter; ✅ Mobile-friendly create; ✅ Status advance button |
| Inventory (items + stock)                   | ✅ List + search + low-stock toggle + barcode scan button                  |
| Customer statements (merged ledger)         | ✅ Full table with opening/closing balance + per-row debit/credit          |
| Reports                                      | ➡️ Opens web app (linking) — complex multi-tab reports are best on big screens. |
| AI Chatbot, AutomationHub, GST Reconciliation, etc. | ➡️ Opens web app                                                    |

For complex flows (parts assignment on jobs, per-item discounts on
invoices, multi-currency, GST return filing, etc.) the user should
open the web app — the mobile app explicitly links out via the "More"
tab.

## Troubleshooting

**"Cannot connect to server" on login**:
- Check `EXPO_PUBLIC_API_URL` in `.env` (or Settings → Edit server URL).
- Make sure the URL doesn't end with `/`.
- If running on a physical device, `localhost` won't work — use your
  machine's LAN IP (e.g. `http://192.168.1.10:3000`) or the production
  URL.
- The backend must have `APP_PIN` set as an env var for PIN auth to be
  active. If not set, the mobile app skips login automatically.

**"Camera access denied" on barcode scan**:
- iOS: Settings → SmartComp → enable Camera.
- Android: App info → Permissions → Camera → Allow.

**Push notifications not registered**:
- Must be on a physical device (emulators can't receive push).
- Check Settings → Push Notifications → Permission is `granted`.
- Token is registered with `/api/notifications/register` — if that
  route is missing on your backend version, the app silently skips
  registration. Update the backend.

## License

Proprietary — SmartComp.
