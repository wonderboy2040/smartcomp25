# SmartComp Premium Design + Optimization Upgrade

## Status
- Build: PASS (`npm run build`)
- Runtime smoke test: PASS (`npm run start`, `/`, `/login`, `/api/health`)
- Main app framework: Next.js App Router

## Major fixes from original repo
1. Switched deployment from empty Vite shell to full Next.js app.
2. Added missing runtime dependencies used by panels and API routes.
3. Added Next middleware bridge for PIN protection.
4. Restored complete light/dark theme support.

## Premium Design Upgrade v6.2
- New sticky desktop command bar with active module title, live status, low-stock and enquiry shortcuts.
- Premium glassmorphism surfaces with soft gradients, ambient glow, and better card shadows.
- Improved sidebar depth, active navigation treatment, and background lighting.
- Global card, table, form, button, and loading-state polish across all panels.
- Dark mode hardcoded-color overrides for legacy panels so the full site theme changes consistently.
- Mobile top bar made translucent and theme-aware.
- Reduced-motion accessibility support.

## Optimization Upgrade
- Removed unused Vite build dependencies from `package.json` for a cleaner Next.js deployment.
- Kept dynamic imports / lazy panel loading so heavy modules load only when opened.
- Kept client cache and server cache optimizations already present in the project.
- Added `engines.node = 20.x` for deployment stability.
- Added `npm run check` alias for production build verification.

## Deployment
Use:

```bash
npm install
npm run build
npm run start
```

Required for live data:

```env
APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
```

Optional:

```env
APP_PIN=1234
WA_TOKEN=...
WA_PHONE_NUMBER_ID=...
WA_BUSINESS_NUMBER=...
WA_VERIFY_TOKEN=...
```

## Dialog/Popup Transparency Fix
- Fixed Tailwind v4 theme tokens so `bg-background`, `bg-card`, `bg-popover`, etc. compile to real HSL colors instead of invalid transparent values.
- Added global solid-surface rules for dialogs, alert dialogs, sheets, drawers, select menus, popovers, dropdowns and command dialogs.
- Light theme Add/Edit item modal and all similar site modals now render with an opaque premium card background.

## Deep Recheck + Transparency Hardening Pass
- Rechecked Tailwind v4 theme compilation and fixed invalid color token output.
- Hardened all Radix/Dialog primitives with solid card surfaces and blurred overlays.
- Replaced transparent input/select/textarea bases with `bg-input-background` so form fields stay readable in light and dark themes.
- Added `input-background` and `switch-background` theme tokens for consistent UI controls.
- Removed unused Vite/static-shell files and duplicate unused `src/app/components` UI copy.
- Removed unused heavy dependencies: MUI/Emotion, Popper, motion, DnD, react-router, react-slick, canvas-confetti, date-fns, next-themes, etc.
- Rebuilt package-lock after cleanup.
- Final verification: `npm run build` PASS and runtime smoke test PASS.
