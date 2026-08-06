import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'
import { formatCurrency, numberToWords, type InvoiceCalc } from './calc'
import { BUSINESS_GROWTH } from './business-growth'

export interface ShopInfo {
  name: string
  owner?: string
  phone?: string
  email?: string
  address?: string
  gstNumber?: string
  state?: string
  logoUrl?: string
  upiId?: string
  bankName?: string
  bankAccount?: string
  bankIfsc?: string
  bankBranch?: string
}

export interface CustomerInfo {
  name: string
  phone?: string
  email?: string
  address?: string
  gstNumber?: string
  state?: string
  stateCode?: string
}

export interface PdfDocData {
  number: string
  date: Date
  shop: ShopInfo
  customer: CustomerInfo
  calc: InvoiceCalc
  notes?: string
  terms?: string
  validTill?: Date
  amountPaid?: number
  amountDue?: number
  paymentType?: string
  paymentStatus?: string
  docType: 'invoice' | 'quotation' | 'service'
  templateId?: string
  placeOfSupply?: string
  reverseCharge?: boolean
  eWayBillNo?: string
  roundOff?: number
  bankDetails?: ShopInfo
  productImages?: any
  adBannerVariant?: string
  docId?: string
  copyType?: 'ORIGINAL FOR RECIPIENT' | 'DUPLICATE FOR TRANSPORTER' | 'TRIPLICATE FOR SUPPLIER'
  /**
   * 'gst'    → standard GST invoice with HSN, CGST/SGST/IGST, GSTIN
   * 'non-gst'→ retail invoice for walk-in customers (no GST columns, no GSTIN,
   *            labeled "RETAIL INVOICE" instead of "TAX INVOICE").
   * Defaults to 'gst' for backward compatibility.
   */
  gstMode?: 'gst' | 'non-gst'
}

// Template palettes + ad-banner variants live in their own dependency-free
// module so client components can import them without pulling jspdf into the
// browser bundle. Re-exported here so server-side callers are unaffected.
export * from './pdf-templates'
import { PDF_TEMPLATES } from './pdf-templates'


const N = {
  white: [255, 255, 255] as [number, number, number],
  black: [0, 0, 0] as [number, number, number],
  dark: [15, 23, 42] as [number, number, number],
  textDark: [15, 23, 42] as [number, number, number],
  textMid: [71, 85, 105] as [number, number, number],
  textLight: [100, 116, 139] as [number, number, number],
  textVLight: [148, 163, 184] as [number, number, number],
  bgRow: [248, 250, 252] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
}

function isLightBg(bg: [number, number, number]): boolean {
  const brightness = (bg[0] * 299 + bg[1] * 587 + bg[2] * 114) / 1000
  return brightness > 200
}

function mixColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01', 'himachal pradesh': '02', 'punjab': '03', 'chandigarh': '04',
  'uttarakhand': '05', 'haryana': '06', 'delhi': '07', 'rajasthan': '08', 'uttar pradesh': '09',
  'bihar': '10', 'sikkim': '11', 'arunachal pradesh': '12', 'nagaland': '13', 'manipur': '14',
  'mizoram': '15', 'tripura': '16', 'meghalaya': '17', 'assam': '18', 'west bengal': '19',
  'jharkhand': '20', 'odisha': '21', 'chhattisgarh': '22', 'madhya pradesh': '23', 'gujarat': '24',
  'dadra and nagar haveli and daman and diu': '26', 'maharashtra': '27', 'andhra pradesh': '28',
  'karnataka': '29', 'goa': '30', 'lakshadweep': '31', 'kerala': '32', 'tamil nadu': '33',
  'puducherry': '34', 'andaman and nicobar islands': '35', 'telangana': '36', 'andhra pradesh (new)': '37',
  'ladakh': '38'
}

function getStateCode(state: string): string {
  if (!state) return ''
  return STATE_CODES[state.toLowerCase().trim()] || ''
}

function calculateHSNSummary(items: any[]) {
  const map = new Map<string, any>()
  for (const item of items) {
    const hsn = item.hsnCode || 'N/A'
    const key = `${hsn}|${item.gstRate || 0}`
    if (!map.has(key)) {
      map.set(key, { hsn, taxable: 0, cgstRate: 0, cgstAmt: 0, sgstRate: 0, sgstAmt: 0, igstRate: 0, igstAmt: 0, total: 0, gstRate: Number(item.gstRate) || 0 })
    }
    const entry = map.get(key)!
    entry.taxable += Number(item.amount) || 0
    const gstAmt = Number(item.gstAmount) || 0
    entry.cgstRate = (Number(item.gstRate) || 0) / 2
    entry.sgstRate = (Number(item.gstRate) || 0) / 2
    entry.cgstAmt += gstAmt / 2
    entry.sgstAmt += gstAmt / 2
    entry.igstRate = Number(item.gstRate) || 0
    entry.igstAmt += gstAmt
    entry.total += (Number(item.amount) || 0) + gstAmt
  }
  return Array.from(map.values())
}

// Generate Invoice / Quotation / Service PDF
export async function generateInvoicePdf(data: PdfDocData): Promise<Buffer> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const pageWidth = 210
  const margin = 10
  const usableWidth = pageWidth - margin * 2

  // ===== EXACT FULL UNCROPPED AD BANNER GEOMETRY (1000x285 ASPECT RATIO) =====
  const variant = data.adBannerVariant || 'flyer'

  const posterW = usableWidth // 186mm full width
  const posterH = Math.round(usableWidth * (285 / 1000)) // 53mm exact 1000x285 proportion
  const posterX = margin // 12mm

  const FOOTER_Y = 293
  const FOOTER_LINE = 290
  const AD_BAND_BOTTOM = 288
  const AD_BAND_TOP = AD_BAND_BOTTOM - posterH // 235mm

  // Signature block positioned strictly ABOVE top of banner
  const SIG_LINE_Y = AD_BAND_TOP - 10 // 225mm
  const CONTENT_LIMIT = SIG_LINE_Y - 5 // 220mm

  let pageNumber = 1
  const pageEnds: Record<number, number> = {}
  let y = 0

  const isInvoice = data.docType === 'invoice'
  const isService = data.docType === 'service'
  const isNonGst = data.gstMode === 'non-gst'
  const tpl = PDF_TEMPLATES.find((t) => t.id === data.templateId) || PDF_TEMPLATES[0]
  const HB = tpl.headerBg
  const HT = tpl.headerText
  const A = tpl.accent
  const TH = tpl.tableHead
  const LB = tpl.lightBg
  const lightHeader = isLightBg(HB)
  const subColor = lightHeader ? N.textMid : ([200, 210, 230] as [number, number, number])

  const drawFooter = (pageNum: number, totalPages = 1) => {
    doc.setDrawColor(...N.border)
    doc.setLineWidth(0.15)
    doc.line(margin, FOOTER_LINE, pageWidth - margin, FOOTER_LINE)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...N.textVLight)
    const footerText = `${isInvoice ? 'Invoice' : isService ? 'Service Invoice' : 'Quotation'} ${data.number} | ${data.shop.name || 'Smart Computers'} | ${
      totalPages > 1 ? `Page ${pageNum} of ${totalPages} | ` : ''
    }Computer generated | ${formatDateTime(new Date())}`
    doc.text(footerText, pageWidth / 2, FOOTER_Y, { align: 'center', maxWidth: usableWidth })

    // Google Review prompt on the footer (small, subtle) — boosts SEO + reviews
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...A)
    doc.text(
      `⭐ Review us on Google: ${BUSINESS_GROWTH.googleReviewUrl}`,
      pageWidth / 2,
      FOOTER_Y - 3,
      { align: 'center', maxWidth: usableWidth },
    )
  }

  const addPageIfNeeded = (requiredSpace: number): boolean => {
    if (y + requiredSpace > CONTENT_LIMIT) {
      pageEnds[pageNumber] = y
      drawFooter(pageNumber, pageNumber + 1)
      doc.addPage()
      pageNumber++
      y = margin + 5
      return true
    }
    return false
  }

  // ===== HEADER WITH OFFICIAL EMBEDDED METALLIC SHIELD LOGO =====
  const logoImg = data.productImages?.logo || data.shop?.logoUrl
  const hasLogo = !!logoImg

  const logoW = 28
  const logoH = 28
  const logoX = margin
  const logoY = 5

  const shopNameX = hasLogo ? margin + logoW + 4 : margin // 42mm if logo present
  const maxInfoWidth = hasLogo ? 72 : 96

  const shopNameText = data.shop.name || 'Smart Computers'
  const nameFontSize = shopNameText.length > 22 ? 14 : 17

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(nameFontSize)
  const nameLines = doc.splitTextToSize(shopNameText, maxInfoWidth)

  let addrLineCount = 0
  if (data.shop.address) {
    const addrLines = doc.splitTextToSize(data.shop.address, maxInfoWidth)
    addrLineCount = Math.min(addrLines.length, 2)
  }
  
  let contactPresent = !!(data.shop.phone || data.shop.email)
  let gstPresent = !!data.shop.gstNumber

  const calculatedHeaderHeight = Math.max(34, (nameLines.length * 4.5) + (addrLineCount * 3.5) + (contactPresent ? 3.5 : 0) + (gstPresent ? 4 : 0) + 12)

  // Draw Header Background
  doc.setFillColor(...HB)
  doc.rect(0, 0, pageWidth, calculatedHeaderHeight, 'F')

  // Accent Bottom Line
  doc.setFillColor(...A)
  doc.rect(0, calculatedHeaderHeight, pageWidth, 1.2, 'F')
  if (tpl.premium) {
    doc.setFillColor(...LB)
    doc.rect(0, calculatedHeaderHeight + 1.2, pageWidth, 0.5, 'F')
  }

  // Draw Official Crest Shield Logo on Top Left
  if (hasLogo) {
    try {
      // Detect image format from the data URL prefix.
      // jsPDF's addImage signature is: addImage(imageData, format, x, y, w, h)
      // The previous code passed logoX (a number) as the format, which
      // silently failed and the logo was never rendered.
      const logoStr = String(logoImg)
      let fmt: 'JPEG' | 'PNG' | 'WEBP' = 'JPEG'
      if (logoStr.startsWith('data:image/png')) fmt = 'PNG'
      else if (logoStr.startsWith('data:image/webp')) fmt = 'WEBP'
      else if (logoStr.startsWith('data:image/jpeg') || logoStr.startsWith('data:image/jpg')) fmt = 'JPEG'
      // Default to JPEG (sharp compresses all images to JPEG in productImages.ts)

      doc.addImage(logoStr, fmt, logoX, logoY, logoW, logoH, undefined, 'FAST')
    } catch {
      // Last-resort fallback: try without compression / format spec
      try {
        doc.addImage(String(logoImg), 'JPEG', logoX, logoY, logoW, logoH)
      } catch {}
    }
  }

  // Draw Shop Name beside logo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(nameFontSize)
  doc.setTextColor(...HT)
  doc.text(nameLines, shopNameX, 11)

  // Draw Shop Address & Details beside logo
  let currentHeaderY = 11 + (nameLines.length * 4.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...subColor)

  if (data.shop.address) {
    const addrLines = doc.splitTextToSize(data.shop.address, maxInfoWidth)
    doc.text(addrLines.slice(0, 2), shopNameX, currentHeaderY)
    currentHeaderY += Math.min(addrLines.length, 2) * 3.2
  }

  if (data.shop.state) {
    const stateCode = getStateCode(data.shop.state)
    doc.text(`${data.shop.state}${stateCode ? ` (${stateCode})` : ''}`, shopNameX, currentHeaderY)
    currentHeaderY += 3.2
  }

  let contactLine = ''
  if (data.shop.phone) contactLine += `Ph: ${data.shop.phone}`
  if (data.shop.email) contactLine += `${contactLine ? ' | ' : ''}${data.shop.email}`
  if (contactLine) {
    doc.text(contactLine, shopNameX, currentHeaderY)
    currentHeaderY += 3.2
  }

  if (data.shop.gstNumber && !isNonGst) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...HT)
    doc.text(`GSTIN: ${data.shop.gstNumber}`, shopNameX, currentHeaderY)
  } else if (isNonGst) {
    // For non-GST invoices, show "Retail Invoice" tag instead of GSTIN
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...A)
    doc.text('RETAIL INVOICE (Non-GST)', shopNameX, currentHeaderY)
  }

  // Right Side Document Title Block - "INVOICE" badge with Copy Type Subtitle
  const titleBoxX = pageWidth - margin - 58
  doc.setFillColor(...(lightHeader ? LB : A))
  doc.roundedRect(titleBoxX, 7, 58, 11, 1, 1, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...(lightHeader ? A : N.white))
  const docTitle = isNonGst
    ? (isService ? 'RETAIL BILL' : 'RETAIL INVOICE')
    : isInvoice ? 'TAX INVOICE' : isService ? 'SERVICE INVOICE' : 'QUOTATION'
  doc.text(docTitle, titleBoxX + 29, 13, { align: 'center' })

  // Subtitle Copy Type Tag
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.5)
  doc.setTextColor(...(lightHeader ? A : N.white))
  const copySubtitle = data.copyType || (isNonGst ? 'RETAIL COPY' : isInvoice ? 'ORIGINAL FOR RECIPIENT' : 'OFFICIAL DOCUMENT')
  doc.text(copySubtitle, titleBoxX + 29, 16.5, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...subColor)
  let rightY = 22.5
  doc.text(`No: ${data.number}`, titleBoxX + 58, rightY, { align: 'right' })
  rightY += 3.5
  doc.text(`Date: ${formatDate(data.date)}`, titleBoxX + 58, rightY, { align: 'right' })
  rightY += 3.5

  if (!isInvoice && !isService && data.validTill) {
    doc.text(`Valid Till: ${formatDate(data.validTill)}`, titleBoxX + 58, rightY, { align: 'right' })
  }

  // CLEARANCE GAP BEFORE BILL TO SECTION
  y = calculatedHeaderHeight + 6

  // ===== BILL TO / SHIP TO SECTION =====
  const boxW = (usableWidth - 4) / 2
  const boxH = 17
  const billX = margin
  const shipX = margin + boxW + 4

  doc.setFillColor(...N.bgRow)
  doc.setDrawColor(...N.border)
  doc.setLineWidth(0.2)
  doc.roundedRect(billX, y, boxW, boxH, 1, 1, 'FD')
  doc.roundedRect(shipX, y, boxW, boxH, 1, 1, 'FD')

  // Bill To Content
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(...A)
  doc.text('BILL TO / CUSTOMER DETAILS', billX + 3, y + 3.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...N.textDark)
  doc.text(data.customer.name || 'Walk-in Customer', billX + 3, y + 7.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...N.textMid)
  let custY = y + 11
  if (data.customer.phone) {
    doc.text(`Mobile: ${data.customer.phone}`, billX + 3, custY)
    custY += 3
  }
  if (data.customer.gstNumber) {
    doc.setFont('helvetica', 'bold')
    doc.text(`GSTIN: ${data.customer.gstNumber}`, billX + 3, custY)
  }

  // Ship To / Status Content
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(...A)
  doc.text(isService ? 'SERVICE DETAILS' : 'PAYMENT & SHIPPING DETAILS', shipX + 3, y + 3.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...N.textMid)
  if (isService) {
    doc.text(`Device: ${data.notes || 'Repair / Service'}`, shipX + 3, y + 7.5)
  } else {
    doc.text(`Payment: ${(data.paymentType || 'CASH').toUpperCase()} | Status: ${(data.paymentStatus || 'UNPAID').toUpperCase()}`, shipX + 3, y + 7.5)
    if (Number(data.amountDue) > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...N.red)
      doc.text(`Balance Due: ${formatCurrency(data.amountDue || 0)}`, shipX + 3, y + 11.5)
    }
  }

  y += boxH + 3

  // ===== ITEMS TABLE =====
  // For non-GST invoices, hide HSN, Taxable, GST columns (no GST applicable).
  const tableHeaders = isNonGst
    ? ['#', 'Item name', 'Qty', 'Rate (Rs.)', 'Amount (Rs.)']
    : ['#', 'Item name', 'HSN/SAC', 'Qty', 'Rate (Rs.)', 'Taxable', 'GST (Rs.)', 'Amount (Rs.)']

  const tableBody = isNonGst
    ? data.calc.items.map((item, index) => [
        index + 1,
        item.name + (item.sku ? `\nSKU: ${item.sku}` : ''),
        item.quantity,
        item.rate.toFixed(2),
        item.amount.toFixed(2),
      ])
    : data.calc.items.map((item, index) => [
        index + 1,
        item.name + (item.sku ? `\nSKU: ${item.sku}` : ''),
        item.hsnCode || '-',
        item.quantity,
        item.rate.toFixed(2),
        item.amount.toFixed(2),
        item.gstAmount > 0 ? `${item.gstAmount.toFixed(2)} (${item.gstRate}%)` : '-',
        item.total.toFixed(2),
      ])

  autoTable(doc, {
    startY: y,
    head: [tableHeaders],
    body: tableBody,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.5,
      textColor: N.textDark,
      valign: 'middle',
    },
    headStyles: {
      fillColor: TH,
      textColor: N.white,
      fontStyle: 'bold',
      halign: 'left',
    },
    columnStyles: isNonGst
      ? {
          0: { halign: 'center', cellWidth: 10 },
          1: { halign: 'left', cellWidth: 'auto' },
          2: { halign: 'right', cellWidth: 20 },
          3: { halign: 'right', cellWidth: 30 },
          4: { halign: 'right', cellWidth: 35 },
        }
      : {
          0: { halign: 'center', cellWidth: 8 },
          1: { halign: 'left', cellWidth: 'auto' },
          2: { halign: 'center', cellWidth: 16 },
          3: { halign: 'right', cellWidth: 12 },
          4: { halign: 'right', cellWidth: 22 },
          5: { halign: 'right', cellWidth: 22 },
          6: { halign: 'right', cellWidth: 24 },
          7: { halign: 'right', cellWidth: 25 },
        },
    alternateRowStyles: {
      fillColor: N.bgRow,
    },
    didDrawPage: () => {},
  })

  // CLEARANCE GAP AFTER TABLE
  y = (doc as any).lastAutoTable.finalY + 4

  // ===== HSN SUMMARY TABLE (If GST applicable) =====
  const hsnSummary = calculateHSNSummary(data.calc.items)
  if (!isNonGst && hsnSummary.length > 0 && hsnSummary.some((h) => h.total > 0)) {
    addPageIfNeeded(20)
    const hsnHeaders = ['HSN/SAC', 'Taxable Value', 'CGST', 'SGST', 'Total Tax']
    const hsnRows = hsnSummary.map((h) => [
      `${h.hsn} (${h.gstRate}%)`,
      `Rs. ${h.taxable.toFixed(2)}`,
      `Rs. ${h.cgstAmt.toFixed(2)}`,
      `Rs. ${h.sgstAmt.toFixed(2)}`,
      `Rs. ${h.total.toFixed(2)}`,
    ])

    autoTable(doc, {
      startY: y,
      head: [hsnHeaders],
      body: hsnRows,
      margin: { left: margin, right: margin },
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 1.5, textColor: N.textMid },
      headStyles: { fillColor: N.bgRow, textColor: N.textDark, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { halign: 'right', cellWidth: 35 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 35 },
        4: { halign: 'right', cellWidth: 'auto' },
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  addPageIfNeeded(20)

  // ===== TOTALS & AMOUNT IN WORDS SECTION WITH CGST (9%) & SGST (9%) =====
  const totalsW = 75
  const totalsX = pageWidth - margin - totalsW
  const wordsY = y

  // Compute effective CGST/SGST rate percentage
  const effectiveGstRate = data.calc.items.find((i) => i.gstApplicable && Number(i.gstRate) > 0)?.gstRate || 18
  const halfGstRate = effectiveGstRate / 2

  // Calculations Box Right Side
  doc.setFillColor(...N.bgRow)
  doc.setDrawColor(...N.border)
  doc.setLineWidth(0.2)
  
  let currentTotY = wordsY
  const drawRow = (label: string, value: string, bold = false, color = N.textDark) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...color)
    doc.text(label, totalsX + 3, currentTotY + 3.5)
    doc.text(value, totalsX + totalsW - 3, currentTotY + 3.5, { align: 'right' })
    currentTotY += 4.0
  }

  drawRow('Sub Total', formatCurrency(data.calc.subtotal))
  if (!isNonGst && data.calc.cgstAmount > 0) drawRow(`CGST (${halfGstRate}%)`, formatCurrency(data.calc.cgstAmount))
  if (!isNonGst && data.calc.sgstAmount > 0) drawRow(`SGST (${halfGstRate}%)`, formatCurrency(data.calc.sgstAmount))
  if (data.calc.courierCharges > 0) drawRow('Courier Charges', formatCurrency(data.calc.courierCharges))
  if (data.calc.discount > 0) drawRow('Discount', `- ${formatCurrency(data.calc.discount)}`, true, N.green)

  // Grand Total Highlight
  doc.setFillColor(...A)
  doc.rect(totalsX, currentTotY, totalsW, 6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...N.white)
  doc.text('GRAND TOTAL', totalsX + 3, currentTotY + 4.2)
  doc.text(formatCurrency(data.calc.grandTotal), totalsX + totalsW - 3, currentTotY + 4.2, { align: 'right' })
  currentTotY += 7

  if (Number(data.amountPaid) > 0) drawRow('Paid / Advance', `- ${formatCurrency(Number(data.amountPaid) || 0)}`, true, N.green)
  if (Number(data.amountDue) > 0) drawRow('Balance Due', formatCurrency(Number(data.amountDue) || 0), true, N.red)

  const totalsBoxH = currentTotY - wordsY
  doc.rect(totalsX, wordsY, totalsW, totalsBoxH)

  // Amount in Words Left Side
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(...N.textVLight)
  doc.text('AMOUNT IN WORDS', margin, wordsY + 3)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...N.textDark)
  const wordsText = numberToWords(data.calc.grandTotal)
  const wordsLines = doc.splitTextToSize(wordsText, totalsX - margin - 6)
  doc.text(wordsLines.slice(0, 2), margin, wordsY + 6.5)

  let leftY = wordsY + 14

  // Bank Details & UPI QR Left Side
  if (data.shop.bankName || data.shop.bankAccount || data.shop.upiId) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...A)
    doc.text('BANK DETAILS & UPI PAYMENTS', margin, leftY)
    leftY += 3.2

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...N.textMid)
    if (data.shop.bankName) {
      doc.text(`Bank: ${data.shop.bankName} ${data.shop.bankBranch ? `(${data.shop.bankBranch})` : ''}`, margin, leftY)
      leftY += 2.8
    }
    if (data.shop.bankAccount) {
      doc.text(`A/c: ${data.shop.bankAccount} | IFSC: ${data.shop.bankIfsc || '-'}`, margin, leftY)
      leftY += 2.8
    }

    const isPaidDoc = (isInvoice || data.docType === 'service') && ((Number(data.amountDue) || 0) <= 0 || data.paymentStatus === 'paid')
    if (data.shop.upiId && !isPaidDoc) {
      try {
        const qrAmount = isInvoice || data.docType === 'service' ? (Number(data.amountDue) || 0) : data.calc.grandTotal
        if (qrAmount > 0) {
          const upiLink = `upi://pay?pa=${encodeURIComponent(data.shop.upiId)}&pn=${encodeURIComponent(data.shop.name || 'Shop')}&am=${qrAmount.toFixed(2)}&cu=INR`
          // Generate QR as PNG (smaller than JPEG for B/W images)
          const qrDataUrl = await QRCode.toDataURL(upiLink, { width: 80, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
          const qrSize = 14
          // Add as PNG (correct format for QR codes)
          doc.addImage(qrDataUrl, 'PNG', margin, leftY, qrSize, qrSize, undefined, 'FAST')
          doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...A)
          doc.text('Scan & Pay via UPI', margin + qrSize + 3, leftY + 3.5)
          doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...N.textMid)
          doc.text(`UPI: ${data.shop.upiId}`, margin + qrSize + 3, leftY + 7)
          leftY += qrSize + 2
        }
      } catch {}
    }
  }

  y = Math.max(currentTotY + 2, leftY + 2)

  // ===== AUTHORIZED SIGNATURE BLOCK (Attaches to bottom of Page 1 if content fits) =====
  addPageIfNeeded(16)
  doc.setPage(pageNumber)
  const sigBoxX = pageWidth - margin - 50
  
  const targetSigY = Math.min(SIG_LINE_Y, Math.max(y + 12, SIG_LINE_Y - 8))

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...N.textDark)
  doc.text(`For ${data.shop.name || 'Smart Computers'}:`, sigBoxX + 25, targetSigY - 4, { align: 'center' })

  doc.setDrawColor(...N.textVLight)
  doc.setLineWidth(0.2)
  doc.line(sigBoxX, targetSigY, pageWidth - margin, targetSigY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...N.textLight)
  doc.text('Authorized Signatory', sigBoxX + 25, targetSigY + 3.5, { align: 'center' })

  // ===== 1000x285 PX CENTERED HORIZONTAL BANNER BELOW INVOICE =====
  const drawAdBanner = (topY: number, bandH: number) => {
    const by = topY
    const imgs: Record<string, string> = data.productImages || {}
    const phone = data.shop.phone || ''

    // Premium Flyer Poster Graphic (Exact 1000x285 px format)
    if (variant === 'flyer') {
      if (imgs['flyer']) {
        try {
          const src = String(imgs['flyer'])
          let fmt: 'JPEG' | 'PNG' | 'WEBP' = 'JPEG'
          if (src.startsWith('data:image/png')) fmt = 'PNG'
          else if (src.startsWith('data:image/webp')) fmt = 'WEBP'
          doc.addImage(src, fmt, posterX, by, posterW, bandH, undefined, 'FAST')
          return
        } catch {
          try {
            doc.addImage(String(imgs['flyer']), 'JPEG', posterX, by, posterW, bandH)
            return
          } catch {}
        }
      }
    }

    // High-Res Product Grid Poster Graphic (Exact 1000x285 px format)
    if (variant === 'grid') {
      if (imgs['productgrid']) {
        try {
          const src = String(imgs['productgrid'])
          let fmt: 'JPEG' | 'PNG' | 'WEBP' = 'JPEG'
          if (src.startsWith('data:image/png')) fmt = 'PNG'
          else if (src.startsWith('data:image/webp')) fmt = 'WEBP'
          doc.addImage(src, fmt, posterX, by, posterW, bandH, undefined, 'FAST')
          return
        } catch {
          try {
            doc.addImage(String(imgs['productgrid']), 'JPEG', posterX, by, posterW, bandH)
            return
          } catch {}
        }
      }
    }

    // Featured variant — left headline panel + 4 product tiles
    if (variant === 'featured') {
      const featuredShopName = data.shop.name || 'Smart Computers'
      const leftW = 50
      const rightX = posterX + leftW + 2
      const rightW = posterW - leftW - 2
      const tileW = (rightW - 6) / 4 // 4 tiles with 2mm gaps

      // Left panel — headline + shop name + phone
      doc.setFillColor(...A)
      doc.rect(posterX, by, leftW, bandH, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(...N.white)
      doc.text('WE ALSO', posterX + 3, by + 8)
      doc.text('SUPPLY', posterX + 3, by + 14)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      doc.text(featuredShopName.slice(0, 22), posterX + 3, by + 22)
      if (phone) {
        doc.setFontSize(6)
        doc.text(`Call: ${phone}`, posterX + 3, by + 27)
      }

      // Right — 4 product tiles with images
      const tiles = [
        { src: imgs['computers'], label: 'Computers' },
        { src: imgs['laptop'], label: 'Laptops' },
        { src: imgs['printers'], label: 'Printers' },
        { src: imgs['accessories'], label: 'Accessories' },
      ]
      tiles.forEach((tile, i) => {
        const tx = rightX + i * (tileW + 2)
        // Background card
        doc.setFillColor(...N.white)
        doc.setDrawColor(...mixColor(A, N.white, 0.7))
        doc.setLineWidth(0.2)
        doc.roundedRect(tx, by + 2, tileW, bandH - 4, 1, 1, 'FD')
        // Image
        if (tile.src) {
          try {
            const src = String(tile.src)
            let fmt: 'JPEG' | 'PNG' | 'WEBP' = 'JPEG'
            if (src.startsWith('data:image/png')) fmt = 'PNG'
            else if (src.startsWith('data:image/webp')) fmt = 'WEBP'
            const imgH = bandH - 14
            doc.addImage(src, fmt, tx + 1, by + 3, tileW - 2, imgH, undefined, 'FAST')
          } catch {
            try { doc.addImage(String(tile.src), 'JPEG', tx + 1, by + 3, tileW - 2, bandH - 14) } catch {}
          }
        }
        // Label
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.5)
        doc.setTextColor(...N.textDark)
        doc.text(tile.label, tx + tileW / 2, by + bandH - 3, { align: 'center' })
      })
      return
    }

    // Strip variant — compact horizontal strip with 4 small product images
    if (variant === 'strip') {
      doc.setFillColor(...mixColor(A, N.white, 0.94))
      doc.setDrawColor(...A)
      doc.setLineWidth(0.3)
      doc.roundedRect(posterX, by, posterW, bandH, 1, 1, 'FD')

      // Left text
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...A)
      doc.text('WE ALSO SUPPLY', posterX + 4, by + 6)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.5)
      doc.setTextColor(...N.textMid)
      doc.text('Computers • Laptops • Printers • Accessories', posterX + 4, by + 11)

      // 4 small product images on the right
      const tiles = [imgs['computers'], imgs['laptop'], imgs['printers'], imgs['accessories']]
      const imgSize = bandH - 6
      const startX = posterX + posterW - 4 - (4 * (imgSize + 2))
      tiles.forEach((src, i) => {
        if (src) {
          try {
            const s = String(src)
            let fmt: 'JPEG' | 'PNG' | 'WEBP' = 'JPEG'
            if (s.startsWith('data:image/png')) fmt = 'PNG'
            else if (s.startsWith('data:image/webp')) fmt = 'WEBP'
            doc.addImage(s, fmt, startX + i * (imgSize + 2), by + 3, imgSize, imgSize, undefined, 'FAST')
          } catch {
            try { doc.addImage(String(src), 'JPEG', startX + i * (imgSize + 2), by + 3, imgSize, imgSize) } catch {}
          }
        }
      })

      // Phone on right edge
      if (phone) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(...A)
        doc.text(`Call: ${phone}`, posterX + posterW - 4, by + bandH - 4, { align: 'right' })
      }
      return
    }

    // Fallback Card (Centered)
    doc.setFillColor(...mixColor(A, N.white, 0.94))
    doc.setDrawColor(...A)
    doc.setLineWidth(0.3)
    doc.roundedRect(posterX, by, posterW, bandH, 1, 1, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...A)
    doc.text('SMART COMPUTERS IT SOLUTIONS', posterX + 6, by + 10)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...N.textMid)
    doc.text('Computers • Laptops • Printers • CCTV • Accessories & Repair Center', posterX + 6, by + 15)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...N.textDark)
    doc.text(phone ? `Call / WhatsApp: ${phone}` : 'Authorized Center', posterX + posterW - 6, by + 12, { align: 'right' })
  }

  // Draw Ad Banner on all pages
  for (let i = 1; i <= pageNumber; i++) {
    doc.setPage(i)
    drawAdBanner(AD_BAND_TOP, posterH)
    drawFooter(i, pageNumber)
  }

  doc.setPage(pageNumber)
  return Buffer.from(doc.output('arraybuffer'))
}
