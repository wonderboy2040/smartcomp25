# Invoices, Quotations & Service Jobs — Advanced Upgrade + Payment Fix (v11.2)

**Date:** 2026-08-05
**Scope:** Full recheck of Invoices, Quotations (conversion), Service Jobs & Payments flows; critical payment-record bug fixed; advanced features added. Verified with 19 automated E2E tests through real API routes.

---

## 🔴 THE CRITICAL BUG (aapka "amount paid nahi ho raha")

**Symptom:** Invoice create karte waqt "Amount Paid" (Cash/UPI/Card) dalne par — invoice par `Paid` dikh jaata tha, **par Payments sheet/list me koi payment entry NAHI banti thi.** Money ledger se gayab — Payments panel, cash-flow report, invoice detail sab me missing.

**Root cause (2-layer):**
1. `POST /api/invoices` sirf `amountPaid` number bhejta tha — par Apps Script (`createInvoiceUltra`) payment row **tabhi** banata hai jab `payment` OBJECT aaye (`{amount, type, date}`). Bina object ke woh sirf invoice ka field set karta tha.
2. Neeche layering: `quotations/[id]` convert flow me bhi wahi problem — converted invoice par payment record nahi banta tha.

**Fix:** Invoice create + quotation convert dono me `payment` object pass hota hai → **payment ek hi call me Payments sheet me record** hota hai (type normalize: UPI/Cash/Card/Bank Transfer).

---

## 🆕 Advanced improvements

### Invoices
| Feature | Detail |
|---|---|
| **💰 Payment at creation** | Amount Paid dene par **Payments entry turant banti hai** (single ultra call) |
| **💵 Quick "Record Payment" button** | Har unpaid/partial invoice row par 🟢 Wallet button — dialog me amount + type, balance check ke saath |
| **Paid / Due column** | Desktop table me naya column + mobile card me "Paid: X • Due: Y" |
| **Over-payment guard** | Payment kabhi balance due se zyada nahi ho sakti (clear error + balance batata hai) |
| **Edit me payment** | Invoice edit karte waqt Amount Paid badhao → **delta payment auto-record** hota hai |
| **Partial-edit safety** | Bina items bheje edit karne par totals 0 nahi hote (grandTotal preserved) |

### Quotations
| Feature | Detail |
|---|---|
| **Convert + Payment** | Convert dialog ab payment le sakta hai: `amountPaid`, `paymentType` → invoice + payment dono bante hain |
| **Stock toggle** | `deductStock: false` se bina stock deduct kiye convert (advance booking) |
| **Duplicate-guard** | Already converted quotation dobara convert nahi ho sakta |
| **Template/GST passthrough** | Quotation ka template + gstMode invoice me carry hota hai |
| **Credit only for due** | Customer credit sirf unpaid portion ka badhta hai (pehle full amount ka badhta tha) |

### Service Jobs
| Feature | Detail |
|---|---|
| **paymentType on job** | Complete/recordPayment par job par `Final`/`Partial`/`Unpaid` set hota hai (reporting ke liye) |
| **Payment notes/date** | Record payment me custom date + notes support |
| **Delete cleanup** | Job delete karne par uske ServicePayments bhi soft-delete hote hain (ledger clean) |
| **Final/Partial type** | Payment type ab automatically sahi set hota hai |
| *(Pehle se)* | Advance payment at creation, complete flow, stock validation, warranty, status history, WhatsApp notify |

### Payments (shared)
| Feature | Detail |
|---|---|
| **Rate limiting** | Payments writes ab rate-limited hain (abuse protection) |
| **Balance validation** | Overpay + already-paid invoice reject |
| **Credit clamp** | Customer credit sirf actual due tak reduce hota hai |

---

## ✅ Verification — 19/19 E2E tests PASS (real API routes + mock Apps Script)

| # | Test | Result |
|---|---|---|
| 1 | Invoice create + amountPaid=5000 → invoice partial/paid=5000/due=5000 | ✅ |
| 1b | **Payment row created in Payments sheet (THE BUG FIX)** | ✅ |
| 1c | Payment type normalized `upi` → `UPI`, amount=5000 | ✅ |
| 2 | Invoice detail GET returns payments array | ✅ |
| 3 | Over-payment (99999) rejected with 400 + balance message | ✅ |
| 4 | Pay remaining 5000 → invoice `paid`, amountPaid=10000 | ✅ |
| 5 | Quotation convert with amountPaid=3000 → payment row + credit=5000 (only due) | ✅ |
| 6 | Job advance 1000 → ServicePayments entry | ✅ |
| 7 | Invoice edit amountPaid 0→2000 → invoice updated + delta payment row | ✅ |

`npx tsc --noEmit` — clean ✅ · `npm run build` — passes ✅

---

## Files changed

| File | Change |
|---|---|
| `src/app/api/invoices/route.ts` | `payment` object pass (create), type normalization |
| `src/app/api/invoices/[id]/route.ts` | amountPaid edit + delta payment, partial-edit safety, amountPaid in payload |
| `src/app/api/payments/route.ts` | Rate limit, overpay guard, credit clamp |
| `src/app/api/payments/[id]/route.ts` | (existing delete-reversal verified) |
| `src/app/api/quotations/[id]/route.ts` | Advanced convert: payment/stock/template options, duplicate guard, credit-only-due |
| `src/app/api/jobs/[id]/route.ts` | paymentType, payment notes/date, delete cleanup |
| `src/components/panels/Invoices.tsx` | Quick Record Payment dialog + button, Paid/Due column |
| `scripts/e2e-payments-test.sh` | **NEW** — 19-assertion payment-flow E2E suite |
| `scripts/mock-apps-script.js` | Mock extended (createInvoiceUltra etc.) |
