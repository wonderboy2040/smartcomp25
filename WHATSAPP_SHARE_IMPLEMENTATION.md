# WhatsApp Share Implementation — v13.7 (Unified Flow)

## What the user asked (v13.7)

1. **Quotation-style share everywhere** — invoices and service jobs must share
   exactly like quotations: the message text ALWAYS arrives in WhatsApp together
   with the PDF.
2. **Respectful greeting** — male customers get *"Respected Sir,"*, female
   customers get *"Respected Madam,"* in every WhatsApp share (invoices,
   quotations, service jobs).

## The problem that was fixed

The old mobile path used `navigator.share({ files, text })` (Web Share API).
WhatsApp on Android **drops the text** when a file comes through the OS share
sheet — so invoices shared as a PDF attachment with **no message**. Quotations
happened to feel right because their text was pre-filled via `wa.me`.

## The v13.7 unified flow (identical on every device, every doc type)

`shareWhatsAppPdf()` in `src/lib/whatsapp.ts` — used by **Invoices**,
**Quotations**, and **Service Jobs** (Share Invoice template):

1. **Cloud API first (if configured)** — `POST /api/whatsapp/send-pdf`
   generates the PDF server-side (WeasyPrint, pixel-perfect with the preview)
   and delivers it to the customer's WhatsApp directly, with the respectful
   message as the document caption. Nothing manual.
2. **Fallback (no WA_TOKEN needed)**:
   - The PDF **auto-downloads** to the device (Downloads folder / recent files).
   - The customer's WhatsApp chat **opens with the full message pre-filled**
     (`wa.me/<phone>?text=…`) — the text is also copied to the clipboard.
   - One tap: attach 📎 → the just-downloaded PDF → send. The pre-filled text
     becomes the **document caption**, so the customer receives **one message:
     PDF + text together**.

Deterministic: the text ALWAYS arrives — same behavior on Android, iOS, and
desktop (WhatsApp Web).

## Respectful greeting (Sir / Madam)

`src/lib/customer-gender.ts`:

| Priority | Source | Example |
|---|---|---|
| 1 | Explicit **Gender** field on the customer (new — see below) | `male` → Sir, `female` → Madam |
| 2 | Name prefix | `Mr./Shri/Mohd.` → Sir, `Mrs./Miss/Smt./Kumari` → Madam |
| 3 | Business-name detection | `Rahul Traders`, `XYZ Computers` → neutral |
| 4 | Common Indian first-name dictionary (~350 names) | `Ramesh` → Sir, `Priya` → Madam |
| 5 | Suffix hints | `Bhaveshbhai` → Sir, `Kinjalben`/`Kaur`/`Devi` → Madam |
| — | No match | `Dear {FirstName},` (never guesses wrong) |

Greeting line: `Respected Sir,` / `Respected Madam,` / `Dear {Name},` /
`Dear Customer,` — applied in:

- `buildProfessionalShareMessage` (invoices, quotations, service invoices)
- All 7 service-job templates in `src/lib/whatsapp-templates.ts`
  (Device Received, In Progress, Completed, Share Invoice, Payment Reminder,
  Delivered, Not Repaired)
- `buildInvoiceShareMessage` + `buildPaymentReminderMessage`

## Customer Gender field (new, optional)

- **Customer dialog** (Customers panel): Gender dropdown —
  *Auto (detect from name)* / *Male — greet as Sir* / *Female — greet as Madam* /
  *Other*. Default "Auto" keeps name inference.
- **API**: `POST/PUT /api/customers` accept `gender` (`male|female|other`),
  stored on the Customers sheet (Firestore — schemaless, no migration).
- **Invoice/Quotation lists**: `/api/invoices` and `/api/quotations` embed
  `customer.gender` (parallel **cached** Customers read — no extra latency
  after the first hit) so the share button has gender available instantly.
- **Jobs**: store `customerGender` when provided at creation; otherwise
  infer from the name.

## Files changed (v13.7)

| File | Change |
|---|---|
| `src/lib/customer-gender.ts` | NEW — gender inference + respectful greeting |
| `src/lib/whatsapp.ts` | Unified share flow (removed native-share text-drop path), `customerGender` param, respectful greetings |
| `src/lib/whatsapp-templates.ts` | Sir/Madam greeting in all 7 service templates |
| `src/components/ServiceWhatsAppModal.tsx` | Share Invoice now uses the same unified `shareWhatsAppPdf` flow |
| `src/components/panels/Invoices.tsx` / `Quotations.tsx` | Pass `customerGender` to the share |
| `src/components/panels/Customers.tsx` | Gender dropdown in the customer dialog |
| `src/lib/validators.ts` | `gender` in customer schema |
| `src/app/api/customers/route.ts` + `[id]/route.ts` | Accept/persist `gender` |
| `src/app/api/invoices/route.ts` / `quotations/route.ts` | Embed `customer.gender` (parallel cached read) |
| `src/app/api/jobs/route.ts` | Accept `customerGender` passthrough |

## Performance fixes in the same release (v13.7)

- **PanelBoundary memo fix** — every tab switch used to re-render ALL mounted
  panels (new `children` elements + changed `active` prop defeated `memo`).
  Now panels render via stable `Comp` refs + `isSelected`, so only the
  boundaries that actually flip re-render. Panel switching is now near-instant
  even with 6-10 heavy panels mounted.
- **Single-layout rendering** — Invoices, Quotations, Customers, Stock, Jobs,
  Payments no longer render BOTH the mobile card list and the desktop table
  (one was always hidden by CSS — phones were rendering 200 invisible table
  rows). Now only the viewport-matching layout is rendered
  (`useIsDesktop` hook, `src/hooks/use-media-query.ts`).
- **Instant scroll on panel switch** (was animated smooth-scroll).
- **LRU mounted-panels cap 6 → 10** — fewer evictions/remounts/refetches now
  that hidden panels no longer re-render.

## Testing checklist

- [ ] Share an invoice on mobile → WhatsApp opens in the customer's chat with
      the message pre-filled + PDF in Downloads → attach → text arrives as caption
- [ ] Share a quotation → identical behavior
- [ ] Service job → WhatsApp button → "Share Invoice" → identical behavior
- [ ] Male customer (e.g. "Ramesh Kumar") → "Respected Sir,"
- [ ] Female customer (e.g. "Priya" / "Mrs. Sharma") → "Respected Madam,"
- [ ] Business customer (e.g. "Rahul Traders") → "Dear Rahul,"
- [ ] Customer dialog → Gender dropdown saves and is used on next share
- [ ] Tab switching between busy panels feels instant (no re-render lag)
