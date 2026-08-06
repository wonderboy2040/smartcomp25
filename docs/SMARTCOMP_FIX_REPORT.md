# SmartComp Fix Report — 2026-07-24

## Summary
Pulled the GitHub repository, performed a deep build/type/lint/audit pass, fixed issues found, upgraded Service Jobs logic, and prepared a clean source-code ZIP.

## Key fixes and upgrades

### Service Jobs upgraded
- Added safer Service Job completion flow:
  - Validates final amount.
  - Normalizes parts used.
  - Validates stock availability before deduction.
  - Calculates service profit, parts profit, engineer share, admin share, paid amount, and balance due consistently.
  - Prevents delivered jobs from being completed again.
  - Prevents direct status-change completion without using the dedicated completion action.
- Improved service payment handling:
  - Advance remains separate from paidAmount.
  - Completion records only the amount actually received now.
  - Quick payment cannot exceed balance due.
- Added balance/due/overdue display support in Service Jobs UI.
- Added safer delivered transition: only completed jobs can be marked delivered.
- Added service feedback fields support in Apps Script schema.

### Document/share fixes
- Fixed document HTML viewer timer ref TypeScript issue.
- Added persistent `shareToken` columns to Apps Script schemas for invoices and quotations.
- WhatsApp invoice/quotation sharing now generates/stores share tokens and includes public online document links.

### Code quality and validation
- Added working ESLint TypeScript/TSX parser configuration.
- Added `typecheck`, `lint`, and `audit:prod` scripts.
- Removed unused/invalid ESLint disable comments.
- Upgraded Next.js from 15.5.20 to 15.5.21.
- Added dependency overrides for patched PostCSS and Sharp versions.

## Validation completed
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run audit:prod` ✅ — 0 high production vulnerabilities
- `npm run build` ✅ — production build successful

## Important deployment note
After deploying this code, copy the updated `apps-script/code.gs` into Google Apps Script and deploy a new Web App version so the new schema columns (`shareToken`, `feedbackRating`, `feedbackComment`, `feedbackAt`) are created/recognized in Google Sheets.
