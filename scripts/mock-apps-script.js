// Mock Google Apps Script backend for E2E testing the Next.js API routes.
// Simulates code.gs behavior (list/create/update/delete + soft delete).
const http = require('http')

const store = {
  Items: new Map(),
  Customers: new Map(),
  Invoices: new Map(),
  Payments: new Map(),
  Quotations: new Map(),
  Jobs: new Map(),
  Suppliers: new Map(),
  Expenses: new Map(),
  ServicePayments: new Map(),
  Shop: new Map(),
}
let seq = 0

function fullRow(headers, data, id, now) {
  const row = { id, deleted: false, createdAt: data.createdAt || now, updatedAt: now }
  headers.forEach((h) => {
    if (h === 'id' || h === 'deleted' || h === 'createdAt' || h === 'updatedAt') return
    if (!(h in row)) row[h] = data[h] !== undefined && data[h] !== null ? data[h] : ''
  })
  // keep any extra fields the caller passed (mock mirrors code.gs full-schema rows)
  for (const k of Object.keys(data || {})) {
    if (!(k in row)) row[k] = data[k]
  }
  return row
}

function headersOf(sheet) {
  switch (sheet) {
    case 'Items': return ['id', 'name', 'sku', 'category', 'description', 'gstApplicable', 'gstRate', 'costPrice', 'sellingPrice', 'quantity', 'minQuantity', 'unit', 'hsnCode', 'supplierId', 'warrantyDays', 'createdAt', 'updatedAt', 'deleted']
    case 'Customers': return ['id', 'name', 'phone', 'email', 'address', 'gstNumber', 'state', 'creditBalance', 'creditLimit', 'creditDays', 'creditScore', 'birthday', 'createdAt', 'updatedAt', 'deleted']
    default: return ['id', 'createdAt', 'updatedAt', 'deleted']
  }
}

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const url = new URL(req.url, 'http://localhost')
    let body = {}
    try { body = JSON.parse(raw) } catch {}
    const action = url.searchParams.get('action') || body.action
    const sheet = url.searchParams.get('sheet') || body.sheet
    const id = url.searchParams.get('id') || body.id
    const now = new Date().toISOString()
    let result

    switch (action) {
      case 'ping':
      case 'test':
        result = { success: true, version: '5.0' }
        break
      case 'list': {
        let rows = [...(store[sheet]?.values() || [])].filter((r) => !r.deleted)
        const filter = url.searchParams.get('filter')
        if (filter) { const [f, v] = filter.split('='); rows = rows.filter((r) => String(r?.[f] ?? '') === String(v)) }
        const search = url.searchParams.get('search')
        if (search) { const q = search.toLowerCase(); rows = rows.filter((r) => Object.values(r).some((x) => String(x ?? '').toLowerCase().includes(q))) }
        result = { success: true, data: rows }
        break
      }
      case 'get': {
        const row = store[sheet]?.get(id)
        result = row && !row.deleted ? { success: true, data: row } : { success: false, error: 'Not found' }
        break
      }
      case 'create': {
        const data = body.data || {}
        const nid = data.id || 'id_' + (++seq)
        const row = fullRow(headersOf(sheet), data, nid, now)
        store[sheet].set(nid, row)
        result = { success: true, data: row }
        break
      }
      case 'update': {
        const existing = store[sheet]?.get(id)
        if (!existing) { result = { success: false, error: 'Not found' }; break }
        const merged = { ...existing, ...(body.data || {}), updatedAt: now }
        store[sheet].set(id, merged)
        result = { success: true, data: merged }
        break
      }
      case 'delete': {
        const existing = store[sheet]?.get(id)
        if (!existing) { result = { success: false, error: 'Not found' }; break }
        existing.deleted = true
        result = { success: true, data: existing }
        break
      }
      case 'createInvoiceUltra': {
        // Mirrors code.gs createInvoiceUltra: creates invoice + payment row if payment provided
        const data = body.data || {}
        const nid = data.id || 'inv_' + (++seq)
        const now2 = new Date().toISOString()
        const invoiceRow = {
          id: nid,
          number: data.number || `SCSS/26-27/${String(seq).padStart(3, '0')}`,
          customerId: data.customerId || '',
          customerName: data.customerName || 'Test Customer',
          customerPhone: data.customerPhone || '',
          customerGstin: data.customerGstin || '',
          date: data.date || now2,
          itemsJson: data.itemsJson || '[]',
          subtotal: Number(data.subtotal) || 0,
          gstAmount: Number(data.gstAmount) || 0,
          courierCharges: Number(data.courierCharges) || 0,
          otherCharges: Number(data.otherCharges) || 0,
          discount: Number(data.discount) || 0,
          grandTotal: Number(data.grandTotal) || 0,
          totalCost: Number(data.totalCost) || 0,
          profit: Number(data.profit) || 0,
          paymentType: data.paymentType || 'cash',
          paymentStatus: data.paymentStatus || 'unpaid',
          amountPaid: Number(data.amountPaid) || 0,
          amountDue: Number(data.amountDue) || 0,
          notes: data.notes || '',
          createdAt: now2,
          deleted: false,
        }
        store.Invoices.set(nid, invoiceRow)
        let paymentResult = null
        if (data.payment && Number(data.payment.amount) > 0) {
          const payId = 'pay_' + (++seq)
          const payRow = {
            id: payId,
            invoiceId: nid,
            invoiceNumber: invoiceRow.number,
            customerName: invoiceRow.customerName,
            amount: Number(data.payment.amount),
            type: data.payment.type || 'Cash',
            date: data.payment.date || now2,
            notes: data.payment.notes || '',
            createdAt: now2,
            deleted: false,
          }
          store.Payments.set(payId, payRow)
          paymentResult = { id: payId, ...data.payment }
        }
        result = { success: true, data: invoiceRow, payment: paymentResult }
        break
      }
      case 'createQuotationUltra': {
        const data = body.data || {}
        const nid = data.id || 'qtn_' + (++seq)
        const now2 = new Date().toISOString()
        const qRow = {
          id: nid,
          number: data.number || `SCSS/QT/${String(seq).padStart(3, '0')}`,
          customerId: data.customerId || '',
          customerName: data.customerName || 'Test Customer',
          date: data.date || now2,
          itemsJson: data.itemsJson || '[]',
          subtotal: Number(data.subtotal) || 0,
          gstAmount: Number(data.gstAmount) || 0,
          courierCharges: Number(data.courierCharges) || 0,
          otherCharges: Number(data.otherCharges) || 0,
          discount: Number(data.discount) || 0,
          grandTotal: Number(data.grandTotal) || 0,
          notes: data.notes || '',
          status: data.status || 'draft',
          createdAt: now2,
          deleted: false,
        }
        store.Quotations.set(nid, qRow)
        result = { success: true, data: qRow }
        break
      }
      case 'dashboard':
        result = { success: true, data: { stats: { totalItems: store.Items.size } } }
        break
      case 'shop':
        result = { success: true, data: store.Shop.values().next().value || null }
        break
      case 'getAllData':
      case 'getBatchData':
        result = { success: true, data: {} }
        break
      default:
        result = { success: false, error: 'Unknown action ' + action }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
  })
})

server.listen(Number(process.env.MOCK_PORT || 4100), '127.0.0.1', () => {
  console.log('MOCK APPS SCRIPT READY on', server.address().port)
})
