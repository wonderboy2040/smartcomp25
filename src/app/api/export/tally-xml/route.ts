import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { apiLimiter, exportLimiter, getClientIp } from '@/lib/rate-limit'
import { safeJsonParse } from '@/lib/utils'

/**
 * GET /api/export/tally-xml?from=&to=
 *
 * v13 NEW: Tally XML Export (Tally 9.x / Tally Prime compatible).
 *
 * Exports all invoices + payments + expenses in the given date range
 * (default: current financial year) as Tally XML format ready for
 * import into Tally Prime / Tally 9.x.
 *
 * The XML uses standard Tally message envelopes:
 *   <ENVELOPE><HEADER>...</HEADER><BODY>...</BODY></ENVELOPE>
 *
 * Vouchers generated:
 *   - Sales invoice    -> VoucherType "Sales" with inventory allocation
 *   - Payment received -> VoucherType "Receipt"
 *   - Expense          -> VoucherType "Payment"
 *
 * Each voucher is wrapped in a Tally <DATA><TALLYMESSAGE> block. The output
 * can be directly imported via Tally's "Import Data" -> "XML" menu.
 */
function xmlEscape(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function isoToTallyDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  // Tally expects YYYYMMDD
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = exportLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const from = url.searchParams.get('from') || ''
    const to = url.searchParams.get('to') || ''

    let fromDate: Date
    let toDate: Date
    if (from) fromDate = new Date(from)
    else {
      const now = new Date()
      const m = now.getMonth() + 1
      const y = now.getFullYear()
      fromDate = new Date(m >= 4 ? y : y - 1, 3, 1)
    }
    if (to) toDate = new Date(to)
    else toDate = new Date()

    const fromMs = fromDate.getTime()
    const toMs = toDate.getTime()

    const [invoices, payments, expenses, shops] = await Promise.all([
      listRows<any>('Invoices').catch(() => []),
      listRows<any>('Payments').catch(() => []),
      listRows<any>('Expenses').catch(() => []),
      listRows<any>('Shop').catch(() => []),
    ])
    const shop = shops[0] || {}
    const shopName = xmlEscape(String(shop.name || 'Smart Computers'))

    const inRange = (d: string) => {
      if (!d) return false
      const t = new Date(d).getTime()
      return t >= fromMs && t <= toMs
    }

    const myInvoices = invoices.filter((i: any) => inRange(String(i?.date || i?.createdAt || '')))
    const myPayments = payments.filter((p: any) => inRange(String(p?.date || p?.createdAt || '')))
    const myExpenses = expenses.filter((e: any) => inRange(String(e?.date || e?.createdAt || '')))

    const voucherParts: string[] = []

    for (const inv of myInvoices) {
      const date = isoToTallyDate(String(inv?.date || inv?.createdAt || ''))
      if (!date) continue
      const invNum = xmlEscape(String(inv?.number || inv?.id || ''))
      const customerName = xmlEscape(String(inv?.customerName || 'Cash Customer'))
      const grandTotal = (Number(inv?.grandTotal) || 0).toFixed(2)
      const subtotal = (Number(inv?.subtotal) || 0).toFixed(2)
      const gstAmount = Number(Number(inv?.gstAmount) || 0)
      // v13.1 fix: prefer stored split when present (matches the actual printed
      // invoice), only fall back to inferring from state codes when the invoice
      // has no stored CGST/SGST/IGST amounts.
      const storedCgst = Number(inv?.cgstAmount) || 0
      const storedSgst = Number(inv?.sgstAmount) || 0
      const storedIgst = Number(inv?.igstAmount) || 0

      const shopStateCode = String(shop?.gstNumber || '').slice(0, 2)
      const custGstin = String(inv?.customerGstin || '')
      const custStateCode = custGstin ? custGstin.slice(0, 2) : ''
      // v13.1 fix: previously isIntra defaulted to false for B2C customers
      // (no GSTIN) — meaning unregistered local sales were exported as IGST
      // (inter-state), which is wrong for a local shop. Default to true when
      // the customer has no GSTIN (assume intra-state B2C; the standard case
      // for a local retailer).
      const isIntra =
        storedCgst > 0 || storedSgst > 0
          ? true
          : storedIgst > 0
            ? false
            : custGstin
              ? !!shopStateCode && !!custStateCode && shopStateCode === custStateCode
              : true // B2C unregistered → assume intra-state

      const cgstVal = storedCgst > 0 ? storedCgst : isIntra ? gstAmount / 2 : 0
      const sgstVal = storedSgst > 0 ? storedSgst : isIntra ? gstAmount / 2 : 0
      const igstVal = storedIgst > 0 ? storedIgst : isIntra ? 0 : gstAmount

      // v13.1 fix: tax ledger entries (CGST, SGST, IGST) as separate
      // ALLLEDGERENTRIES.LIST blocks — previously the tax was wrapped in a
      // DUTYHEADDETAILS.LIST placed OUTSIDE any ALLLEDGERENTRIES.LIST,
      // producing malformed XML that Tally would reject on import. The
      // proper Tally structure has one ledger entry per tax component.
      let taxLedgersXml = ''
      if (cgstVal > 0) {
        taxLedgersXml += `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>CGST</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${cgstVal.toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`
      }
      if (sgstVal > 0) {
        taxLedgersXml += `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>SGST</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${sgstVal.toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`
      }
      if (igstVal > 0) {
        taxLedgersXml += `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>IGST</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${igstVal.toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`
      }

      // Inventory entries — each line item with its own DUTYHEADDETAILS.LIST
      // placed INSIDE the ALLINVENTORYENTRIES.LIST block (where Tally expects
      // it). Previously this block was at the voucher level, breaking import.
      let itemsXml = ''
      const items: any[] = safeJsonParse<any[]>(inv?.itemsJson, [])
      for (const item of items) {
        const itemName = xmlEscape(String(item?.name || 'Item'))
        const qty = Number(item?.quantity || 0).toFixed(2)
        const rate = (Number(item?.sellingPrice || item?.rate || 0)).toFixed(2)
        const amount = (Number(item?.amount || item?.total || 0)).toFixed(2)
        const lineGstRate = Number(item?.gstRate || 0)
        const lineTaxable = Number(item?.amount || item?.total || 0)
        const lineGst = (lineTaxable * lineGstRate) / 100
        const halfLineGst = lineGst / 2
        let dutyXml = ''
        if (lineGst > 0) {
          if (isIntra) {
            dutyXml = `
            <DUTYHEADDETAILS.LIST>
              <DUTYHEADNAME>CGST</DUTYHEADNAME>
              <AMOUNT>${halfLineGst.toFixed(2)}</AMOUNT>
            </DUTYHEADDETAILS.LIST>
            <DUTYHEADDETAILS.LIST>
              <DUTYHEADNAME>SGST</DUTYHEADNAME>
              <AMOUNT>${halfLineGst.toFixed(2)}</AMOUNT>
            </DUTYHEADDETAILS.LIST>`
          } else {
            dutyXml = `
            <DUTYHEADDETAILS.LIST>
              <DUTYHEADNAME>IGST</DUTYHEADNAME>
              <AMOUNT>${lineGst.toFixed(2)}</AMOUNT>
            </DUTYHEADDETAILS.LIST>`
          }
        }
        itemsXml += `
        <ALLINVENTORYENTRIES.LIST>
          <STOCKITEMNAME>${itemName}</STOCKITEMNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${amount}</AMOUNT>
          <ACTUALQTY>${qty} Nos</ACTUALQTY>
          <BILLEDQTY>${qty} Nos</BILLEDQTY>
          <RATE>${rate}/Nos</RATE>${dutyXml}
        </ALLINVENTORYENTRIES.LIST>`
      }

      voucherParts.push(`
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${date}</DATE>
        <PARTYNAME>${customerName}</PARTYNAME>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${invNum}</VOUCHERNUMBER>
        <REFERENCE>${invNum}</REFERENCE>
        <PARTYLEDGERNAME>${customerName}</PARTYLEDGERNAME>
        <EFFECTIVEDATE>${date}</EFFECTIVEDATE>
        <NARRATION>Invoice ${invNum}</NARRATION>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${customerName}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${grandTotal}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Sales</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${(-Number(subtotal)).toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>${taxLedgersXml}${itemsXml}
      </VOUCHER>
    </TALLYMESSAGE>`)
    }

    for (const p of myPayments) {
      const date = isoToTallyDate(String(p?.date || p?.createdAt || ''))
      if (!date) continue
      const amount = (Number(p?.amount) || 0).toFixed(2)
      const customerName = xmlEscape(String(p?.customerName || 'Cash Customer'))
      const refNo = xmlEscape(String(p?.reference || p?.id || ''))
      const payType = String(p?.type || p?.mode || 'Cash').toLowerCase()
      const ledgerName = payType.includes('upi') ? 'UPI' :
        payType.includes('bank') ? 'Bank' :
        payType.includes('card') ? 'Card' :
        payType.includes('cheque') ? 'Cheque' : 'Cash'

      voucherParts.push(`
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${date}</DATE>
        <PARTYNAME>${customerName}</PARTYNAME>
        <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
        <REFERENCE>${refNo}</REFERENCE>
        <PARTYLEDGERNAME>${customerName}</PARTYLEDGERNAME>
        <EFFECTIVEDATE>${date}</EFFECTIVEDATE>
        <NARRATION>Payment received ${refNo}</NARRATION>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${ledgerName}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${customerName}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`)
    }

    for (const e of myExpenses) {
      const date = isoToTallyDate(String(e?.date || e?.createdAt || ''))
      if (!date) continue
      const amount = (Number(e?.amount) || 0).toFixed(2)
      const category = xmlEscape(String(e?.category || 'Expenses'))
      const vendor = xmlEscape(String(e?.vendor || ''))
      const refNo = xmlEscape(String(e?.reference || e?.id || ''))
      const mode = String(e?.mode || 'Cash').toLowerCase()
      const ledgerName = mode.includes('upi') ? 'UPI' :
        mode.includes('bank') ? 'Bank' :
        mode.includes('card') ? 'Card' :
        mode.includes('cheque') ? 'Cheque' : 'Cash'

      voucherParts.push(`
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Payment" ACTION="Create" OBJVIEW="Accounting Voucher View">
        <DATE>${date}</DATE>
        <PARTYNAME>${vendor || ledgerName}</PARTYNAME>
        <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
        <REFERENCE>${refNo}</REFERENCE>
        <PARTYLEDGERNAME>${ledgerName}</PARTYLEDGERNAME>
        <EFFECTIVEDATE>${date}</EFFECTIVEDATE>
        <NARRATION>${xmlEscape(String(e?.description || category))}</NARRATION>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${category}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${ledgerName}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>`)
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA DESC="SmartComp Export">
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COMPANY>${shopName}</COMPANY>
          <COMPANYNAME>${shopName}</COMPANYNAME>
        </TALLYMESSAGE>${voucherParts.join('')}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`

    const filename = `tally-${fromDate.toISOString().slice(0, 10)}-to-${toDate.toISOString().slice(0, 10)}.xml`

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-RateLimit-Remaining': check.remaining.toString(),
        'X-Export-Stats': `${myInvoices.length} invoices, ${myPayments.length} payments, ${myExpenses.length} expenses`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
