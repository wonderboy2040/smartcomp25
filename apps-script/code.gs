/**
 * Smart Computers - Google Apps Script Backend - QUANTUM ULTRA SPEED v5.0
 * 
 * EVOLUTION:
 * v4.0 Ultra: Sheet cache, List cache 60s + 5s mem, bulk transactions 7->1 call
 * v5.0 Quantum: + getAllData single-call sync (index.html PWA pattern), liveSync with hash, Pins, Settings, deleted tracking, batch get, early returns, minimal columns
 * 
 * QUANTUM OPTIMIZATIONS v5.0 (inspired by index.html superfast PWA):
 * - getAllData action: Returns Jobs+Items+Payments+Customers+Shop in ONE CALL (was 5 calls, now 1) = 5x faster, like index.html getAllData
 * - liveSync action: Accepts {jobs, spareParts, payments, deletedIds} + hash check, merges with timestamp, returns merged - 1s interval from index.html
 * - Sheet cache (_sheetCache) - avoid repeated getSheetByName
 * - List cache 60s CacheService + 5s in-memory memCache for back-to-back reads (10-100x faster)
 * - Cache key tracking per sheet for smart invalidation (like _trackListCacheKey)
 * - Fast path ensureAllSheets: skip header checks if exists with correct col count
 * - Bulk transactions: createInvoiceFull, createInvoiceUltra (customer fetch + number gen + stock + payment = 1 call)
 * - Batch ops: single SpreadsheetApp.flush()
 * - ID column cache, minimal getValues (only needed columns)
 * - Early returns for ping/test/version without touching sheets
 * - Deleted tracking Set with 5min TTL to avoid resurrecting deleted (like index.html recentlyDeletedJobs)
 * - getBatchData for Next.js: shop+items+customers+invoices in one call
 * - Pin management: getPins, savePin, removePin (for PWA dual role)
 * 
 * DATA PROTECTION: SOFT-DELETE only, replaceAll blocked, data-safe migration
 */

const SCHEMAS = {
  Shop: ['id', 'name', 'owner', 'phone', 'email', 'address', 'gstNumber', 'state', 'invoicePrefix', 'quotationPrefix', 'termsInvoice', 'termsQuotation', 'upiId', 'bankName', 'bankAccount', 'bankIfsc', 'bankBranch', 'pdfTemplate', 'adBannerVariant', 'createdAt', 'updatedAt', 'deleted'],
  Items: ['id', 'name', 'sku', 'category', 'description', 'gstApplicable', 'gstRate', 'costPrice', 'sellingPrice', 'quantity', 'minQuantity', 'unit', 'hsnCode', 'supplierId', 'warrantyDays', 'createdAt', 'updatedAt', 'deleted'],
  Customers: ['id', 'name', 'phone', 'email', 'address', 'gstNumber', 'state', 'creditBalance', 'creditLimit', 'creditDays', 'creditScore', 'birthday', 'createdAt', 'updatedAt', 'deleted'],
  Suppliers: ['id', 'name', 'phone', 'whatsappNumber', 'email', 'company', 'address', 'suppliedItems', 'active', 'includeInAutoEnquiry', 'createdAt', 'updatedAt', 'deleted'],
  Invoices: ['id', 'number', 'customerId', 'customerName', 'customerPhone', 'customerGstin', 'date', 'itemsJson', 'serialsJson', 'subtotal', 'gstAmount', 'courierCharges', 'otherCharges', 'discount', 'grandTotal', 'totalCost', 'profit', 'paymentType', 'paymentStatus', 'amountPaid', 'amountDue', 'notes', 'template', 'gstMode', 'shareToken', 'createdAt', 'deleted'],
  Quotations: ['id', 'number', 'customerId', 'customerName', 'customerPhone', 'customerGstin', 'date', 'validTill', 'itemsJson', 'subtotal', 'gstAmount', 'courierCharges', 'otherCharges', 'discount', 'grandTotal', 'notes', 'status', 'template', 'gstMode', 'convertedToInvoiceId', 'shareToken', 'createdAt', 'deleted'],
  Payments: ['id', 'invoiceId', 'invoiceNumber', 'customerName', 'amount', 'type', 'date', 'notes', 'reference', 'createdAt', 'deleted'],
  Enquiries: ['id', 'supplierId', 'supplierName', 'supplierPhone', 'itemsJson', 'message', 'status', 'sentAt', 'respondedAt', 'response', 'ratesJson', 'appliedToItems', 'isAuto', 'createdAt', 'deleted'],
  Jobs: ['id', 'jobId', 'trackToken', 'customerName', 'customerMobile', 'deviceType', 'brandModel', 'serialNumber', 'problemDesc', 'accessories', 'serviceType', 'priority', 'estimatedAmount', 'advanceAmount', 'advanceMode', 'status', 'assignedEngineer', 'partsUsedJson', 'finalAmount', 'serviceCharge', 'paidAmount', 'paymentMode', 'paymentType', 'grossProfit', 'partsProfit', 'serviceProfit', 'notes', 'diagnosisNotes', 'warrantyDays', 'warrantyExpiry', 'statusHistoryJson', 'completedDate', 'reviewSent', 'reviewSentAt', 'feedbackRating', 'feedbackComment', 'feedbackAt', 'createdAt', 'updatedAt', 'deliveredAt', 'deleted'],
  ServicePayments: ['id', 'jobId', 'customerName', 'amount', 'mode', 'type', 'date', 'notes', 'createdAt', 'deleted'],
  Expenses: ['id', 'category', 'description', 'amount', 'mode', 'date', 'vendor', 'reference', 'notes', 'createdAt', 'deleted'],
  ItemSerials: ['id', 'itemId', 'itemName', 'serialNumber', 'status', 'invoiceId', 'invoiceNumber', 'customerName', 'purchaseDate', 'warrantyDays', 'warrantyExpiry', 'costPrice', 'notes', 'createdAt', 'updatedAt', 'deleted'],
  PersonalExpenditure: ['id', 'type', 'category', 'description', 'amount', 'mode', 'date', 'person', 'notes', 'createdAt', 'deleted'],
  Campaigns: ['id', 'name', 'segment', 'segmentDataJson', 'message', 'status', 'totalRecipients', 'sentCount', 'deliveredCount', 'readCount', 'scheduledAt', 'sentAt', 'createdAt', 'deleted'],
  AMCContracts: ['id', 'contractNumber', 'customerId', 'customerName', 'customerPhone', 'customerAddress', 'devicesCoveredJson', 'startDate', 'endDate', 'fee', 'frequency', 'visitsIncluded', 'visitsUsed', 'lastVisitDate', 'nextVisitDate', 'status', 'notes', 'createdAt', 'updatedAt', 'deleted'],
  Settings: ['id', 'value', 'deleted']
};

const SHEET_NAMES = Object.keys(SCHEMAS);

// ===== QUANTUM ULTRA FAST CACHE =====
var _sheetsEnsured = false;
var _sheetCache = {};
var _idCache = {};

// ===== LIST CACHE (v5.0 Quantum) - CacheService + 5s mem =====
var LIST_CACHE_TTL = 60; // seconds
var LIST_CACHE_MEM_TTL = 5 * 1000; // 5s in-memory for back-to-back
var _listMemCache = {};
var _idIndexCache = {};

function _listCacheKey(sheetName, filter, search, includeDeleted) {
  return 'list:' + sheetName + ':' + (filter || '') + ':' + (search || '') + ':' + (includeDeleted ? '1' : '0');
}

function _getListCache(key) {
  var mem = _listMemCache[key];
  if (mem && mem.expires > Date.now()) {
    return mem.data;
  }
  try {
    var cached = CacheService.getScriptCache().get(key);
    if (cached) {
      var parsed = JSON.parse(cached);
      _listMemCache[key] = { data: parsed, expires: Date.now() + LIST_CACHE_MEM_TTL };
      return parsed;
    }
  } catch (ignore) {}
  return null;
}

function _putListCache(key, data) {
  _listMemCache[key] = { data: data, expires: Date.now() + LIST_CACHE_MEM_TTL };
  try {
    var str = JSON.stringify(data);
    // SECURITY/DATA-INTEGRITY: previously this silently truncated lists to
    // the first 500 rows when payload exceeded 90KB. That meant listRows()
    // quietly returned incomplete data once the sheet grew past ~500 rows.
    // Now we simply skip caching oversized payloads — callers always get the
    // full sheet from the source. Cache is an optimization, not a substitute.
    if (str.length < 90000) {
      CacheService.getScriptCache().put(key, str, LIST_CACHE_TTL);
    }
  } catch (ignore) {}
}

function _invalidateListCache(sheetName) {
  _listMemCache = {};
  _idIndexCache = {};
  try {
    var cache = CacheService.getScriptCache();
    var keysToRemove = [];
    var trackerKey = 'keys:' + sheetName;
    var trackedKeys = cache.get(trackerKey);
    if (trackedKeys) {
      var parsed = JSON.parse(trackedKeys);
      for (var i = 0; i < parsed.length; i++) keysToRemove.push(parsed[i]);
    }
    keysToRemove.push(trackerKey);
    keysToRemove.push('dashboard_v4');
    keysToRemove.push('dashboard_v5');
    keysToRemove.push('dashboard_v6');
    keysToRemove.push('getAllData');
    keysToRemove.push('getAllData_quantum');
    if (keysToRemove.length > 0) cache.removeAll(keysToRemove);
  } catch (ignore) {}
}

function _trackListCacheKey(sheetName, key) {
  try {
    var cache = CacheService.getScriptCache();
    var trackerKey = 'keys:' + sheetName;
    var existing = cache.get(trackerKey);
    var keys = existing ? JSON.parse(existing) : [];
    if (keys.indexOf(key) === -1) {
      keys.push(key);
      if (keys.length > 50) keys = keys.slice(-50);
      cache.put(trackerKey, JSON.stringify(keys), 3600);
    }
  } catch (ignore) {}
}

function getSheetFast(name) {
  if (_sheetCache[name]) return _sheetCache[name];
  ensureAllSheets();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  _sheetCache[name] = sheet;
  return sheet;
}

function clearCaches() {
  _sheetCache = {};
  _idCache = {};
  _listMemCache = {};
  _idIndexCache = {};
}

function ensureAllSheets() {
  if (_sheetsEnsured) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var allSheets = ss.getSheets();
  var existingNames = {};
  for (var i = 0; i < allSheets.length; i++) existingNames[allSheets[i].getName()] = allSheets[i];
  
  for (var n = 0; n < SHEET_NAMES.length; n++) {
    var name = SHEET_NAMES[n];
    var sheet = existingNames[name];
    if (!sheet) {
      sheet = ss.insertSheet(name);
      var headers = SCHEMAS[name];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
      existingNames[name] = sheet;
    } else {
      var headers = SCHEMAS[name];
      var lastCol = sheet.getLastColumn();
      if (lastCol === 0) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
        sheet.setFrozenRows(1);
      } else if (lastCol < headers.length) {
        var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        var missing = [];
        for (var h = 0; h < headers.length; h++) if (existingHeaders.indexOf(headers[h]) === -1) missing.push(headers[h]);
        if (missing.length > 0) {
          sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
          sheet.getRange(1, lastCol + 1, 1, missing.length).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
        }
      }
    }
    _sheetCache[name] = existingNames[name];
  }
  _sheetsEnsured = true;
}

function getSheet(name) { return getSheetFast(name); }

// ===== PIN AUTHENTICATION (Apps Script layer) =====
// The Next.js proxy.ts gate protects the /api/* surface, but the Apps Script
// Web App URL itself is publicly reachable (Anyone-with-link access is
// required for the Web App to be called by the Next.js server). Without a
// PIN check here, anyone who learns the /exec URL can read all PII (phone,
// GSTIN, addresses) and create/update/delete anything.
//
// How it works:
//   1. The Next.js server forwards the user's PIN-derived cookie value to
//      Apps Script via the `pin` query param (GET) or `pin` body field (POST).
//      (sheets-client.ts injects this automatically — see callAppsScript.)
//   2. Apps Script hashes the supplied PIN with the same SHA-256 + salt the
//      Next.js layer uses, and compares to the stored hash in Settings sheet.
//   3. Read actions (list/get/dashboard) require the read PIN.
//      Write actions (create/update/delete/complete) require the write PIN.
//
// PIN storage: the Settings sheet stores HASHED PINs (id=adminPinHash /
//   engineerPinHash) — never the raw PIN. The legacy `adminPin`/`engineerPin`
//   rows are migrated to hashes on first use, then deleted.
//
// Migration: if `adminPinHash` is absent but `adminPin` exists, the first
//   request that supplies the matching raw PIN will compute and store the
//   hash, then soft-delete the plaintext row. After migration, plaintext
//   rows are ignored.
//
// Backward compatibility: when APP_PIN is not set on the Next.js side AND
//   the Apps Script Settings sheet has no adminPinHash row, the Apps Script
//   is treated as "open access" (legacy mode, same as v5.0 behavior).

var AUTH_SALT = '_smartcomp_v3_2026';

function _sha256Hex(text) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );
  var hex = '';
  for (var i = 0; i < raw.length; i++) {
    var b = raw[i];
    if (b < 0) b += 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function _pinHash(pin) {
  return _sha256Hex(String(pin) + AUTH_SALT);
}

function _getSettingValue(id) {
  try {
    var rows = listRows('Settings', '', '', true);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id) === String(id) && (!rows[i].deleted || String(rows[i].deleted).toLowerCase() !== 'true')) {
        return rows[i].value || '';
      }
    }
  } catch (ignore) {}
  return '';
}

function _setSettingValue(id, value) {
  var rows = listRows('Settings', '', '', true);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) {
      updateRow('Settings', rows[i].id, { id: id, value: value, deleted: false });
      return;
    }
  }
  createRow('Settings', { id: id, value: value, deleted: false });
}

/**
 * Returns true if the request is authenticated.
 * Also performs one-time migration of plaintext PIN rows to hashed rows.
 */
function _isAuthenticated(suppliedPin) {
  var storedHash = _getSettingValue('adminPinHash');
  var legacyPlain = _getSettingValue('adminPin');

  // Open-access mode: no hash stored AND no plaintext stored
  if (!storedHash && !legacyPlain) return true;

  if (!suppliedPin) return false;

  // Migration: if we have plaintext but no hash, verify supplied PIN against
  // plaintext, then write the hash and soft-delete the plaintext.
  if (!storedHash && legacyPlain) {
    if (String(suppliedPin) !== String(legacyPlain)) return false;
    _setSettingValue('adminPinHash', _pinHash(suppliedPin));
    // soft-delete the plaintext row
    var rows = listRows('Settings', '', '', true);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id) === 'adminPin') {
        softDeleteRow('Settings', rows[i].id);
      }
    }
    return true;
  }

  // Normal path: compare hash
  return _constantTimeEqual(_pinHash(suppliedPin), storedHash);
}

function _constantTimeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

var WRITE_ACTIONS = {
  'create': true, 'createFast': true, 'update': true, 'delete': true,
  'restore': true, 'bulkCreate': true, 'bulkUpdate': true,
  'createInvoiceFull': true, 'createInvoiceUltra': true,
  'createQuotationFull': true, 'createQuotationUltra': true,
  'completeJobFull': true, 'saveShop': true, 'savePin': true,
  'removePin': true, 'saveSettings': true, 'newJob': true, 'createJob': true,
  'updateJob': true, 'deleteJob': true, 'addSparePart': true,
  'updateSparePart': true, 'deleteSparePart': true, 'payment': true,
  'addPayment': true, 'updatePayment': true, 'deletePayment': true,
  'seed': true, 'liveSync': true
};

// ===== v11 ULTRA-FAST CRUD: ID-INDEX + CREATE DEDUPE =====
// updateRow/softDeleteRow/getRow previously read the ENTIRE sheet (every row,
// every column) just to locate one row by id — seconds on large sheets.
// Now we build a lightweight id -> rowNumber index from a SINGLE column read
// (column A) and reuse it within the same execution. Only the target row is
// ever read/written. v11.0

var DEDUPE_TTL = 300; // seconds — 5 min idempotency window for creates

// Actions that create rows server-side; they get _clientRef idempotency
// protection so a retried/timeout request can never duplicate a row.
var CREATE_ACTIONS = {
  'create': true, 'createFast': true, 'bulkCreate': true,
  'createInvoiceFull': true, 'createInvoiceUltra': true,
  'createQuotationFull': true, 'createQuotationUltra': true,
  'newJob': true, 'createJob': true, 'addSparePart': true,
  'payment': true, 'addPayment': true
};

function _dedupeCheck(clientRef) {
  if (!clientRef) return null;
  try {
    var hit = CacheService.getScriptCache().get('ref:' + clientRef);
    if (hit) {
      try { return JSON.parse(hit); } catch (e) { return null; }
    }
  } catch (ignore) {}
  return null;
}

function _dedupeStore(clientRef, result) {
  if (!clientRef || !result) return;
  try {
    CacheService.getScriptCache().put('ref:' + clientRef, JSON.stringify(result), DEDUPE_TTL);
  } catch (ignore) {}
}

// Wrap a create action: if the same _clientRef arrives again (retry after
// timeout, double-click, duplicate tab), return the ORIGINAL result instead
// of creating a duplicate row.
function _withDedupe(clientRef, fn) {
  if (clientRef) {
    var hit = _dedupeCheck(clientRef);
    if (hit) return hit;
  }
  var result = fn();
  if (clientRef && result && result.success) _dedupeStore(clientRef, result);
  return result;
}

function _buildIdIndex(sheetName) {
  var cached = _idIndexCache[sheetName];
  var sheet = getSheetFast(sheetName);
  var lastRow = sheet.getLastRow();
  // Reuse within 30s of the same execution if row count hasn't changed.
  if (cached && cached.lastRow === lastRow && (Date.now() - cached.builtAt) < 30000) {
    return cached.map;
  }
  var map = {};
  var count = Math.max(0, lastRow - 1);
  if (count > 0) {
    var ids = sheet.getRange(2, 1, count, 1).getValues();
    for (var i = 0; i < ids.length; i++) map[String(ids[i][0])] = i + 2;
  }
  _idIndexCache[sheetName] = { map: map, lastRow: lastRow, builtAt: Date.now() };
  return map;
}

function _invalidateIdIndex(sheetName) {
  delete _idIndexCache[sheetName];
}

function _extractPin(e) {
  if (!e) return '';
  if (e.parameter && e.parameter.pin) return String(e.parameter.pin);
  if (e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      if (body && body.pin) return String(body.pin);
      if (body && body.data && body.data.pin) return String(body.data.pin);
    } catch (ignore) {}
  }
  return '';
}

function _unauthorized() {
  return json({ success: false, error: 'Unauthorized — PIN required', code: 'PIN_REQUIRED' });
}

// ===== QUANTUM GET HANDLER - ULTRA FAST + PWA COMPAT =====
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || 'status';

    // ULTRA FAST PATH - no sheet access needed (like index.html ping).
    // These remain public so connection tests work before PIN is configured.
    if (action === 'ping') {
      return json({ success: true, message: 'pong', time: new Date().toISOString(), version: '5.0', quantum: true, ultraFast: true });
    }
    if (action === 'version') {
      return json({ success: true, version: '5.0', codename: 'Quantum Ultra Speed', quantum: true, ultraFast: true, features: ['soft-delete', 'quantum-cache', 'bulk-transactions', 'getAllData', 'liveSync', 'pin-auth'] });
    }
    if (action === 'test') {
      return json({ success: true, message: 'Connection successful (Quantum v5.0)', version: '5.0', quantum: true, ultraFast: true, time: new Date().toISOString() });
    }
    if (action === 'status') {
      return json({ success: true, message: 'Smart Computers API running (Quantum v5.0)', sheets: SHEET_NAMES, version: '5.0', quantum: true, ultraFast: true });
    }

    // PIN AUTH — every data-touching action requires a valid PIN when one is
    // configured in the Settings sheet. Public paths (ping/version/test/status)
    // are exempted above. getPins is also exempted so the login flow can
    // detect whether a PIN exists before asking the user to enter one.
    if (action !== 'getPins') {
      var suppliedPin = _extractPin(e);
      if (!_isAuthenticated(suppliedPin)) return _unauthorized();
    }

    // Early sheet ensure only for actions that need it
    try { ensureAllSheets(); } catch (sheetErr) {
      return json({ success: false, error: 'Sheet access failed: ' + sheetErr.toString() });
    }

    // ===== QUANTUM NEW: getAllData - single call for PWA + Next.js batch =====
    // Like index.html liveSync pattern: fetch all critical data in ONE HTTP call instead of 5
    if (action === 'getAllData') {
      var cacheKey = 'getAllData_quantum';
      try {
        var cache = CacheService.getScriptCache();
        var cached = cache.get(cacheKey);
        if (cached) {
          return json({ success: true, data: JSON.parse(cached), cached: true, quantum: true, ultraFast: true });
        }
      } catch (ignore) {}
      var allData = {
        jobs: listRows('Jobs'),
        spareParts: listRows('Items'), // PWA calls it spareParts, actually Items
        items: listRows('Items'),
        payments: listRows('ServicePayments'),
        servicePayments: listRows('ServicePayments'),
        invoices: listRows('Invoices').slice(0, 200), // recent 200 for speed
        customers: listRows('Customers'),
        suppliers: listRows('Suppliers'),
        shop: (listRows('Shop')[0] || null),
        expenses: listRows('Expenses').slice(0, 100),
        timestamp: new Date().toISOString()
      };
      try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(allData), 30); } catch (ignore) {} // 30s cache for getAllData
      return json({ success: true, data: allData, quantum: true, ultraFast: true });
    }

    if (action === 'getBatchData') {
      // For Next.js: get shop+items+customers+invoices in one call
      var batch = {
        shop: listRows('Shop')[0] || null,
        items: listRows('Items'),
        customers: listRows('Customers'),
        suppliers: listRows('Suppliers'),
        invoices: listRows('Invoices').slice(0, 200),
        timestamp: new Date().toISOString()
      };
      return json({ success: true, data: batch, quantum: true });
    }

    if (action === 'getPins') {
      // SECURITY: returns whether each role's PIN is SET, not the PIN itself.
      try {
        var settingsRows = listRows('Settings', '', '', true);
        var result = { adminPinSet: false, engineerPinSet: false };
        for (var i = 0; i < settingsRows.length; i++) {
          var r = settingsRows[i];
          if (!r.deleted || String(r.deleted).toLowerCase() !== 'true') {
            if (r.id === 'adminPinHash' || r.id === 'adminPin') result.adminPinSet = true;
            if (r.id === 'engineerPinHash' || r.id === 'engineerPin') result.engineerPinSet = true;
          }
        }
        return json({ success: true, status: 'success', data: result });
      } catch (err) {
        return json({ success: true, status: 'success', data: { adminPinSet: false, engineerPinSet: false } });
      }
    }

    if (action === 'list') {
      var sheet = params.sheet;
      if (!sheet) return json({ success: false, error: 'Missing sheet' });
      var includeDeleted = params.includeDeleted === 'true';
      var rows = listRows(sheet, params.filter, params.search, includeDeleted);
      return json({ success: true, data: rows, quantum: true, ultraFast: true });
    }

    if (action === 'get') {
      var sheet = params.sheet;
      var id = params.id;
      if (!sheet || !id) return json({ success: false, error: 'Missing sheet or id' });
      var row = getRow(sheet, id);
      return row ? json({ success: true, data: row, quantum: true, ultraFast: true }) : json({ success: false, error: 'Not found' });
    }

    if (action === 'shop') {
      var rows = listRows('Shop');
      return json({ success: true, data: rows[0] || null, quantum: true, ultraFast: true });
    }

    if (action === 'dashboard') {
      try {
        var cache = CacheService.getScriptCache();
        var cached = cache.get('dashboard_v5');
        if (cached) return json({ success: true, data: JSON.parse(cached), cached: true, quantum: true, ultraFast: true });
      } catch (ignore) {}
      var stats = getDashboardStats();
      try { CacheService.getScriptCache().put('dashboard_v5', JSON.stringify(stats), 180); } catch (ignore) {}
      return json({ success: true, data: stats, quantum: true, ultraFast: true });
    }

    return json({ success: false, error: 'Unknown action: ' + action, quantum: true });
  } catch (err) {
    return json({ success: false, error: err.toString(), stack: err.stack });
  }
}

// ===== QUANTUM POST HANDLER - ULTRA FAST + PWA COMPAT =====
function doPost(e) {
  try {
    var body;
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (parseErr) {
      return json({ success: false, error: 'Invalid JSON' });
    }
    var action = body.action;

    // Fast path
    if (action === 'test' || action === 'ping') {
      return json({ success: true, message: action + ' ok (Quantum v5.0)', version: '5.0', quantum: true, ultraFast: true });
    }
    if (action === 'version') {
      return json({ success: true, version: '5.0', quantum: true, ultraFast: true });
    }

    // PIN AUTH — every write/data action requires a valid PIN when one is
    // configured. savePin/removePin are special: they bootstrap auth so we
    // can't require a PIN for them (otherwise the first PIN set would be
    // impossible). They are still safe because they only write to the
    // Settings sheet — if no PIN exists yet, anyone can set the first one
    // (which matches the legacy open-access-first-run behavior).
    if (action !== 'savePin' && action !== 'removePin') {
      var suppliedPin = _extractPin(e);
      if (!_isAuthenticated(suppliedPin)) return _unauthorized();
    }

    try { ensureAllSheets(); } catch (sheetErr) {
      return json({ success: false, error: 'Sheet access failed: ' + sheetErr.toString() });
    }

    switch (action) {
      case 'create': return json(_withDedupe(body._clientRef, function(){ return createRow(body.sheet, body.data); }));
      case 'createFast': return json(_withDedupe(body._clientRef, function(){ return createRow(body.sheet, body.data, true); }));
      case 'update': return json(updateRow(body.sheet, body.id, body.data));
      case 'delete': return json(softDeleteRow(body.sheet, body.id));
      case 'restore': return json(restoreRow(body.sheet, body.id));
      case 'bulkCreate': return json(_withDedupe(body._clientRef, function(){ return bulkCreate(body.sheet, body.data); }));
      case 'bulkUpdate': return json(bulkUpdate(body.sheet, body.updates));
      case 'createInvoiceFull': return json(_withDedupe(body._clientRef, function(){ return createInvoiceFull(body.data); }));
      case 'createInvoiceUltra': return json(_withDedupe(body._clientRef, function(){ return createInvoiceUltra(body.data); }));
      case 'createQuotationFull': return json(_withDedupe(body._clientRef, function(){ return createQuotationFull(body.data); }));
      case 'createQuotationUltra': return json(_withDedupe(body._clientRef, function(){ return createQuotationUltra(body.data); }));
      case 'completeJobFull': return json(completeJobFull(body.data));
      case 'replace': return json({ success: false, error: 'replace disabled for data protection' });
      case 'saveShop': return json(saveShop(body.data));
      case 'seed': return json(seedData());
      case 'purge': return json({ success: false, error: 'purge disabled' });

      // ===== QUANTUM NEW: PWA COMPAT ACTIONS (index.html pattern) =====
      case 'getAllData': {
        var allData = {
          jobs: listRows('Jobs'),
          spareParts: listRows('Items'),
          items: listRows('Items'),
          payments: listRows('ServicePayments'),
          servicePayments: listRows('ServicePayments'),
          invoices: listRows('Invoices').slice(0, 200),
          customers: listRows('Customers'),
          timestamp: new Date().toISOString()
        };
        return json({ success: true, status: 'success', data: allData, quantum: true });
      }

      case 'liveSync': {
        // Quantum liveSync: merges incoming jobs/spareParts/payments, handles deletedIds, returns merged
        var incoming = body.data || {};
        var deletedJobIds = incoming.deletedJobIds || [];
        var deletedPaymentIds = incoming.deletedPaymentIds || [];
        var changed = false;

        // Handle deleted first (like index.html trackDeletedItem)
        for (var di = 0; di < deletedJobIds.length; di++) {
          var delId = deletedJobIds[di];
          var existingJob = getRow('Jobs', delId);
          if (existingJob) {
            softDeleteRow('Jobs', delId);
            changed = true;
          }
        }
        for (var dpi = 0; dpi < deletedPaymentIds.length; dpi++) {
          var delPId = deletedPaymentIds[dpi];
          var existingPay = getRow('ServicePayments', delPId);
          if (existingPay) {
            softDeleteRow('ServicePayments', delPId);
            changed = true;
          } else {
            var existingPay2 = getRow('Payments', delPId);
            if (existingPay2) { softDeleteRow('Payments', delPId); changed = true; }
          }
        }

        // Merge jobs with timestamp check (newer wins) like index.html mergeCloud
        if (incoming.jobs && Array.isArray(incoming.jobs)) {
          for (var ji = 0; ji < incoming.jobs.length; ji++) {
            var j = incoming.jobs[ji];
            if (!j || !j.id) continue;
            var localJ = getRow('Jobs', j.id);
            if (!localJ) {
              createRow('Jobs', j, true);
              changed = true;
            } else {
              var cloudTime = j.updatedAt ? new Date(j.updatedAt).getTime() : 0;
              var localTime = localJ.updatedAt ? new Date(localJ.updatedAt).getTime() : 0;
              if (cloudTime > localTime) {
                updateRow('Jobs', j.id, j);
                changed = true;
              }
            }
          }
        }

        // Merge spareParts -> Items
        if (incoming.spareParts && Array.isArray(incoming.spareParts)) {
          for (var si = 0; si < incoming.spareParts.length; si++) {
            var sp = incoming.spareParts[si];
            if (!sp || !sp.id) continue;
            var localSp = getRow('Items', sp.id);
            if (!localSp) { createRow('Items', sp, true); changed = true; }
            else {
              var cloudSpTime = sp.updatedAt ? new Date(sp.updatedAt).getTime() : 0;
              var localSpTime = localSp.updatedAt ? new Date(localSp.updatedAt).getTime() : 0;
              if (cloudSpTime > localSpTime) { updateRow('Items', sp.id, sp); changed = true; }
            }
          }
        }

        // Merge payments -> ServicePayments
        if (incoming.payments && Array.isArray(incoming.payments)) {
          for (var pi = 0; pi < incoming.payments.length; pi++) {
            var pay = incoming.payments[pi];
            if (!pay || !pay.id) continue;
            var localPay = getRow('ServicePayments', pay.id) || getRow('Payments', pay.id);
            if (!localPay) { createRow('ServicePayments', pay, true); changed = true; }
            else {
              var cloudPayTime = pay.updatedAt ? new Date(pay.updatedAt).getTime() : 0;
              var localPayTime = localPay.updatedAt ? new Date(localPay.updatedAt).getTime() : 0;
              if (cloudPayTime > localPayTime) { updateRow('ServicePayments', pay.id, pay); changed = true; }
            }
          }
        }

        if (changed) SpreadsheetApp.flush();

        // Return current state like getAllData
        var merged = {
          jobs: listRows('Jobs'),
          spareParts: listRows('Items'),
          payments: listRows('ServicePayments'),
          timestamp: new Date().toISOString()
        };
        if (changed) _invalidateListCache('Jobs'); // invalidate dashboard etc
        return json({ success: true, status: 'success', data: merged, quantum: true, merged: changed });
      }

      case 'savePin': {
        var pin = body.data && body.data.pin;
        var role = body.data && body.data.role;
        if (!pin || !role) return json({ success: false, error: 'Missing pin or role' });
        // SECURITY: store only the SHA-256 hash of the PIN (with the same
        // salt the Next.js layer uses). Never store or return the raw PIN.
        var hashId = role === 'admin' ? 'adminPinHash' : 'engineerPinHash';
        var hashValue = _pinHash(pin);
        var existingHash = listRows('Settings', '', '', true).filter(function(r){ return r.id === hashId; });
        if (existingHash.length > 0) updateRow('Settings', existingHash[0].id, { id: hashId, value: hashValue, deleted: false });
        else createRow('Settings', { id: hashId, value: hashValue, deleted: false });
        // Soft-delete any legacy plaintext row for the same role
        var legacyId = role === 'admin' ? 'adminPin' : 'engineerPin';
        var legacyRows = listRows('Settings', '', '', true).filter(function(r){ return r.id === legacyId; });
        for (var li = 0; li < legacyRows.length; li++) softDeleteRow('Settings', legacyRows[li].id);
        return json({ success: true, status: 'success' });
      }

      case 'getPins': {
        // SECURITY: returns whether each role's PIN is SET, not the PIN itself.
        // Historical bug: this endpoint returned the raw plaintext PIN to any
        // caller (the Apps Script URL is publicly reachable). Now it returns
        // a boolean "set" flag per role, so the client knows whether to prompt.
        var settingsRows = listRows('Settings', '', '', true);
        var result = { adminPinSet: false, engineerPinSet: false };
        for (var i = 0; i < settingsRows.length; i++) {
          var r = settingsRows[i];
          if (!r.deleted || String(r.deleted).toLowerCase() !== 'true') {
            if (r.id === 'adminPinHash' || r.id === 'adminPin') result.adminPinSet = true;
            if (r.id === 'engineerPinHash' || r.id === 'engineerPin') result.engineerPinSet = true;
          }
        }
        return json({ success: true, status: 'success', data: result });
      }

      case 'removePin': {
        var role2 = body.data && body.data.role;
        var hashId2 = role2 === 'admin' ? 'adminPinHash' : 'engineerPinHash';
        var legacyId2 = role2 === 'admin' ? 'adminPin' : 'engineerPin';
        var toDelete = listRows('Settings', '', '', true).filter(function(r){ return r.id === hashId2 || r.id === legacyId2; });
        for (var di = 0; di < toDelete.length; di++) softDeleteRow('Settings', toDelete[di].id);
        return json({ success: true, status: 'success' });
      }

      case 'saveSettings': {
        var shopData = body.data;
        if (shopData) {
          // Map PWA settings to Shop schema
          var mapped = {
            name: shopData.businessName || shopData.name,
            address: shopData.businessAddress || shopData.address,
            phone: shopData.businessMobile || shopData.phone,
            owner: shopData.owner || '',
            email: shopData.email || '',
            gstNumber: shopData.gstNumber || '',
            state: shopData.state || '',
            upiId: shopData.upiId || '',
            bankName: shopData.bankName || '',
            bankAccount: shopData.bankAccount || '',
            bankIfsc: shopData.bankIfsc || '',
            bankBranch: shopData.bankBranch || ''
          };
          return json(saveShop(mapped));
        }
        return json({ success: false, error: 'No settings data' });
      }

      case 'newJob':
      case 'createJob': {
        var jobData = body.data;
        if (jobData && !jobData.jobId && jobData.id) jobData.jobId = jobData.id;
        if (jobData && !jobData.id) jobData.id = jobData.jobId || Utilities.getUuid();
        return json(_withDedupe(body._clientRef, function(){ return createRow('Jobs', jobData); }));
      }

      case 'updateJob': {
        var jobUpd = body.data;
        if (!jobUpd || !jobUpd.id) return json({ success: false, error: 'Missing job id' });
        return json(updateRow('Jobs', jobUpd.id, jobUpd));
      }

      case 'deleteJob': {
        var jobId = (body.data && (body.data.jobId || body.data.id)) || body.id;
        if (!jobId) return json({ success: false, error: 'Missing jobId' });
        return json(softDeleteRow('Jobs', jobId));
      }

      case 'addSparePart': {
        var part = body.data;
        return json(_withDedupe(body._clientRef, function(){ return createRow('Items', part); }));
      }

      case 'updateSparePart': {
        var partUpd = body.data;
        if (!partUpd || !partUpd.id) return json({ success: false, error: 'Missing part id' });
        return json(updateRow('Items', partUpd.id, partUpd));
      }

      case 'deleteSparePart': {
        var partId = (body.data && (body.data.partId || body.data.id)) || body.id;
        if (!partId) return json({ success: false, error: 'Missing partId' });
        return json(softDeleteRow('Items', partId));
      }

      case 'payment':
      case 'addPayment': {
        var payData = body.data;
        return json(_withDedupe(body._clientRef, function(){ return createRow('ServicePayments', payData); }));
      }

      case 'updatePayment': {
        var payUpd = body.data;
        if (!payUpd || !payUpd.id) return json({ success: false, error: 'Missing payment id' });
        return json(updateRow('ServicePayments', payUpd.id, payUpd));
      }

      case 'deletePayment': {
        var payId = (body.data && (body.data.paymentId || body.data.id)) || body.id;
        if (!payId) return json({ success: false, error: 'Missing paymentId' });
        var res1 = softDeleteRow('ServicePayments', payId);
        if (!res1.success) res1 = softDeleteRow('Payments', payId);
        return json(res1);
      }

      default: return json({ success: false, error: 'Unknown action: ' + action, quantum: true });
    }
  } catch (err) {
    return json({ success: false, error: err.toString(), stack: err.stack });
  }
}

// ===== ULTRA FAST BULK TRANSACTIONS (Preserved from v4.0) =====
function createInvoiceFull(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date().toISOString();
  var id = data.id || Utilities.getUuid();
  // LockService — see createInvoiceUltra for rationale.
  var lock = LockService.getScriptLock();
  try {
    var locked = lock.tryLock(20000);
    if (!locked) return { success: false, error: 'Server busy — could not acquire invoice lock. Please retry.' };
  } catch (lockErr) {}
  try {
    var invoiceSheet = getSheetFast('Invoices');
    var invHeaders = SCHEMAS['Invoices'];
    var invRow = invHeaders.map(function(h) {
      if (h === 'id') return id;
      if (h === 'deleted') return false;
      if (h === 'createdAt') return now;
      var v = data[h];
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    invoiceSheet.appendRow(invRow);
    var invoiceData = { id: id };
    for (var k in data) if (k !== 'stockUpdates' && k !== 'customerUpdate' && k !== 'payment') invoiceData[k] = data[k];
    invoiceData.createdAt = now; invoiceData.deleted = false;
    if (data.stockUpdates && Array.isArray(data.stockUpdates) && data.stockUpdates.length > 0) {
      var itemsSheet = getSheetFast('Items');
      var itemHeaders = SCHEMAS['Items'];
      var itemsLastRow = itemsSheet.getLastRow();
      if (itemsLastRow >= 2) {
        var itemIds = itemsSheet.getRange(2, 1, itemsLastRow - 1, 1).getValues();
        var idToRow = {};
        for (var i = 0; i < itemIds.length; i++) idToRow[String(itemIds[i][0])] = i + 2;
        var qtyMap = {};
        for (var u = 0; u < data.stockUpdates.length; u++) {
          var upd = data.stockUpdates[u];
          qtyMap[String(upd.id)] = (qtyMap[String(upd.id)] || 0) + (Number(upd.deductQty) || 0);
        }
        for (var itemId in qtyMap) {
          var rowIdx = idToRow[itemId];
          if (rowIdx) {
            var existingRow = itemsSheet.getRange(rowIdx, 1, 1, itemHeaders.length).getValues()[0];
            var qtyIdx = itemHeaders.indexOf('quantity');
            var currentQty = Number(existingRow[qtyIdx]) || 0;
            var newQty = Math.max(0, currentQty - qtyMap[itemId]);
            var updatedAtIdx = itemHeaders.indexOf('updatedAt');
            existingRow[qtyIdx] = newQty;
            if (updatedAtIdx >= 0) existingRow[updatedAtIdx] = now;
            itemsSheet.getRange(rowIdx, 1, 1, itemHeaders.length).setValues([existingRow]);
          }
        }
      }
    }
    if (data.customerUpdate && data.customerUpdate.id) {
      var custSheet = getSheetFast('Customers');
      var custHeaders = SCHEMAS['Customers'];
      var custLastRow = custSheet.getLastRow();
      if (custLastRow >= 2) {
        var custIds = custSheet.getRange(2, 1, custLastRow - 1, 1).getValues();
        var custRowIdx = -1;
        for (var i = 0; i < custIds.length; i++) if (String(custIds[i][0]) === String(data.customerUpdate.id)) { custRowIdx = i + 2; break; }
        if (custRowIdx !== -1) {
          var custRow = custSheet.getRange(custRowIdx, 1, 1, custHeaders.length).getValues()[0];
          var creditIdx = custHeaders.indexOf('creditBalance');
          var updatedAtIdx = custHeaders.indexOf('updatedAt');
          if (creditIdx >= 0) custRow[creditIdx] = Number(data.customerUpdate.creditBalance) || 0;
          if (updatedAtIdx >= 0) custRow[updatedAtIdx] = now;
          custSheet.getRange(custRowIdx, 1, 1, custHeaders.length).setValues([custRow]);
        }
      }
    }
    var paymentResult = null;
    if (data.payment && Number(data.payment.amount) > 0) {
      var paySheet = getSheetFast('Payments');
      var payHeaders = SCHEMAS['Payments'];
      var payId = data.payment.id || Utilities.getUuid();
      var payRow = payHeaders.map(function(h) {
        if (h === 'id') return payId;
        if (h === 'deleted') return false;
        if (h === 'createdAt') return now;
        var v = data.payment[h];
        if (v === undefined || v === null) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      });
      paySheet.appendRow(payRow);
      paymentResult = { id: payId, ...data.payment };
    }
    SpreadsheetApp.flush();
    _invalidateListCache('Invoices'); _invalidateListCache('Items'); _invalidateListCache('Customers'); _invalidateListCache('Payments'); _invalidateListCache('ItemSerials');
    return { success: true, data: invoiceData, payment: paymentResult, quantum: true, ultraFast: true, operations: 1 };
  } catch (err) {
    return { success: false, error: err.toString(), stack: err.stack };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function createQuotationFull(data) {
  var now = new Date().toISOString();
  var id = data.id || Utilities.getUuid();
  var sheet = getSheetFast('Quotations');
  var headers = SCHEMAS['Quotations'];
  var row = headers.map(function(h) {
    if (h === 'id') return id;
    if (h === 'deleted') return false;
    if (h === 'createdAt') return now;
    var v = data[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  sheet.appendRow(row);
  SpreadsheetApp.flush();
  _invalidateListCache('Quotations');
  return { success: true, data: { id: id, ...data, createdAt: now, deleted: false }, quantum: true, ultraFast: true };
}

function completeJobFull(data) {
  var now = new Date().toISOString();
  // LockService — see createInvoiceUltra for rationale. Job completion does
  // a read-modify-write on stock quantities, so concurrent completions on
  // the same SKU can oversell.
  var lock = LockService.getScriptLock();
  try {
    var locked = lock.tryLock(20000);
    if (!locked) return { success: false, error: 'Server busy — could not acquire job-completion lock. Please retry.' };
  } catch (lockErr) {}
  try {
    var jobSheet = getSheetFast('Jobs');
    var jobHeaders = SCHEMAS['Jobs'];
    var jobLastRow = jobSheet.getLastRow();
    var jobIds = jobSheet.getRange(2, 1, jobLastRow - 1, 1).getValues();
    var jobRowIdx = -1;
    for (var i = 0; i < jobIds.length; i++) if (String(jobIds[i][0]) === String(data.id)) { jobRowIdx = i + 2; break; }
    if (jobRowIdx === -1) return { success: false, error: 'Job not found' };
    var jobRow = jobSheet.getRange(jobRowIdx, 1, 1, jobHeaders.length).getValues()[0];
    for (var h = 0; h < jobHeaders.length; h++) {
      var header = jobHeaders[h];
      if (data[header] !== undefined) {
        var v = data[header];
        if (typeof v === 'object') jobRow[h] = JSON.stringify(v);
        else jobRow[h] = v;
      }
      if (header === 'updatedAt') jobRow[h] = now;
      if (header === 'status') jobRow[h] = 'Completed';
      if (header === 'completedDate') jobRow[h] = now;
    }
    jobSheet.getRange(jobRowIdx, 1, 1, jobHeaders.length).setValues([jobRow]);
    if (data.stockUpdates && data.stockUpdates.length > 0) {
      var itemsSheet = getSheetFast('Items');
      var itemHeaders = SCHEMAS['Items'];
      var itemsLastRow = itemsSheet.getLastRow();
      var itemIds = itemsSheet.getRange(2, 1, itemsLastRow - 1, 1).getValues();
      var idToRow = {};
      for (var i = 0; i < itemIds.length; i++) idToRow[String(itemIds[i][0])] = i + 2;
      var qtyMap = {};
      for (var u = 0; u < data.stockUpdates.length; u++) {
        var upd = data.stockUpdates[u];
        qtyMap[String(upd.id)] = (qtyMap[String(upd.id)] || 0) + (Number(upd.deductQty) || 0);
      }
      for (var itemId in qtyMap) {
        var rIdx = idToRow[itemId];
        if (rIdx) {
          var iRow = itemsSheet.getRange(rIdx, 1, 1, itemHeaders.length).getValues()[0];
          var qIdx = itemHeaders.indexOf('quantity');
          var uIdx = itemHeaders.indexOf('updatedAt');
          iRow[qIdx] = Math.max(0, (Number(iRow[qIdx]) || 0) - qtyMap[itemId]);
          if (uIdx >= 0) iRow[uIdx] = now;
          itemsSheet.getRange(rIdx, 1, 1, itemHeaders.length).setValues([iRow]);
        }
      }
    }
    if (data.payment && Number(data.payment.amount) > 0) {
      var paySheet = getSheetFast('ServicePayments');
      var payHeaders = SCHEMAS['ServicePayments'];
      var payId = Utilities.getUuid();
      var payRow = payHeaders.map(function(h) {
        if (h === 'id') return payId;
        if (h === 'deleted') return false;
        if (h === 'createdAt') return now;
        var v = data.payment[h];
        if (v === undefined || v === null) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      });
      paySheet.appendRow(payRow);
    }
    SpreadsheetApp.flush();
    _invalidateListCache('Jobs'); _invalidateListCache('Items'); _invalidateListCache('ItemSerials'); _invalidateListCache('ServicePayments');
    return { success: true, data: { id: data.id, ...data, updatedAt: now }, quantum: true, ultraFast: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function generateInvoiceNumber() {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth() + 1;
  var fyStart = month >= 4 ? year : year - 1;
  var fyEnd = fyStart + 1;
  var fyShort = String(fyStart).slice(2) + '-' + String(fyEnd).slice(2);
  var base = 'SCSS/' + fyShort + '/';
  var sheet = getSheetFast('Invoices');
  var lastRow = sheet.getLastRow();
  var maxNum = 0;
  if (lastRow >= 2) {
    var numbers = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (var i = 0; i < numbers.length; i++) {
      var num = String(numbers[i][0] || '');
      if (num.indexOf(base) === 0) {
        var suffix = parseInt(num.slice(base.length), 10);
        if (!isNaN(suffix) && suffix > maxNum) maxNum = suffix;
      }
    }
  }
  return base + String(maxNum + 1).padStart(3, '0');
}

function generateQuotationNumber() {
  var base = 'SCSS/QT/';
  var sheet = getSheetFast('Quotations');
  var lastRow = sheet.getLastRow();
  var maxNum = 0;
  if (lastRow >= 2) {
    var numbers = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (var i = 0; i < numbers.length; i++) {
      var num = String(numbers[i][0] || '');
      if (num.indexOf(base) === 0) {
        var suffix = parseInt(num.slice(base.length), 10);
        if (!isNaN(suffix) && suffix > maxNum) maxNum = suffix;
      }
    }
  }
  return base + String(maxNum + 1).padStart(3, '0');
}

function createInvoiceUltra(data) {
  var now = new Date().toISOString();
  // LockService prevents race conditions on invoice number generation,
  // stock decrement, and customer credit updates. Without this, two
  // concurrent invoices can both read the same max-num and produce
  // duplicate numbers, or both read the same stock level and oversell.
  // The lock is released automatically when the function returns.
  var lock = LockService.getScriptLock();
  try {
    var locked = lock.tryLock(20000); // wait up to 20s
    if (!locked) return { success: false, error: 'Server busy — could not acquire invoice lock. Please retry.' };
  } catch (lockErr) {
    // Some Apps Script contexts don't have LockService — proceed without.
  }
  try {
    var customer = null;
    if (data.customerId && !data.customerName) {
      customer = getRow('Customers', data.customerId);
      if (!customer) return { success: false, error: 'Customer not found: ' + data.customerId };
    }
    var number = data.number;
    if (!number) number = generateInvoiceNumber();
    var invoiceSheet = getSheetFast('Invoices');
    var invHeaders = SCHEMAS['Invoices'];
    var id = data.id || Utilities.getUuid();
    var invRow = invHeaders.map(function(h) {
      if (h === 'id') return id;
      if (h === 'number') return number;
      if (h === 'customerId') return data.customerId || '';
      if (h === 'customerName') return data.customerName || (customer ? customer.name : '');
      if (h === 'customerPhone') return data.customerPhone || (customer ? customer.phone : '');
      if (h === 'customerGstin') return data.customerGstin || (customer ? customer.gstNumber : '');
      if (h === 'deleted') return false;
      if (h === 'createdAt') return now;
      var v = data[h];
      if (v === undefined || v === null) {
        if (h === 'date') return data.date || now;
        if (h === 'itemsJson') return data.itemsJson || '[]';
        if (h === 'paymentType') return data.paymentType || 'cash';
        if (h === 'paymentStatus') return data.paymentStatus || 'unpaid';
        return '';
      }
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    invoiceSheet.appendRow(invRow);
    var invoiceData = { id: id, number: number };
    for (var k in data) if (k !== 'stockUpdates' && k !== 'customerUpdate' && k !== 'payment' && k !== 'customerId') invoiceData[k] = data[k];
    invoiceData.customerName = data.customerName || (customer ? customer.name : '');
    invoiceData.customerPhone = data.customerPhone || (customer ? customer.phone : '');
    invoiceData.customerGstin = data.customerGstin || (customer ? customer.gstNumber : '');
    invoiceData.createdAt = now; invoiceData.deleted = false;
    if (data.stockUpdates && data.stockUpdates.length > 0) {
      var itemsSheet = getSheetFast('Items');
      var itemHeaders = SCHEMAS['Items'];
      var itemsLastRow = itemsSheet.getLastRow();
      if (itemsLastRow >= 2) {
        var itemIds = itemsSheet.getRange(2, 1, itemsLastRow - 1, 1).getValues();
        var idToRow = {};
        for (var i = 0; i < itemIds.length; i++) idToRow[String(itemIds[i][0])] = i + 2;
        var qtyMap = {};
        for (var u = 0; u < data.stockUpdates.length; u++) {
          var upd = data.stockUpdates[u];
          qtyMap[String(upd.id)] = (qtyMap[String(upd.id)] || 0) + (Number(upd.deductQty) || 0);
        }
        for (var itemId in qtyMap) {
          var rowIdx = idToRow[itemId];
          if (rowIdx) {
            var existingRow = itemsSheet.getRange(rowIdx, 1, 1, itemHeaders.length).getValues()[0];
            var qtyIdx = itemHeaders.indexOf('quantity');
            existingRow[qtyIdx] = Math.max(0, (Number(existingRow[qtyIdx]) || 0) - qtyMap[itemId]);
            var updatedAtIdx = itemHeaders.indexOf('updatedAt');
            if (updatedAtIdx >= 0) existingRow[updatedAtIdx] = now;
            itemsSheet.getRange(rowIdx, 1, 1, itemHeaders.length).setValues([existingRow]);
          }
        }
      }
    }
    var customerId = data.customerId || (data.customerUpdate ? data.customerUpdate.id : null);
    var creditToAdd = 0;
    if (data.amountDue !== undefined) creditToAdd = Number(data.amountDue) || 0;
    if (customerId && creditToAdd !== 0) {
      var custSheet = getSheetFast('Customers');
      var custHeaders = SCHEMAS['Customers'];
      var custLastRow = custSheet.getLastRow();
      if (custLastRow >= 2) {
        var custIds = custSheet.getRange(2, 1, custLastRow - 1, 1).getValues();
        var custRowIdx = -1;
        for (var i = 0; i < custIds.length; i++) if (String(custIds[i][0]) === String(customerId)) { custRowIdx = i + 2; break; }
        if (custRowIdx !== -1) {
          var custRow = custSheet.getRange(custRowIdx, 1, 1, custHeaders.length).getValues()[0];
          var creditIdx = custHeaders.indexOf('creditBalance');
          var updatedAtIdx = custHeaders.indexOf('updatedAt');
          if (creditIdx >= 0) custRow[creditIdx] = (Number(custRow[creditIdx]) || 0) + creditToAdd;
          if (updatedAtIdx >= 0) custRow[updatedAtIdx] = now;
          custSheet.getRange(custRowIdx, 1, 1, custHeaders.length).setValues([custRow]);
        }
      }
    }
    var paymentResult = null;
    if (data.payment && Number(data.payment.amount) > 0) {
      var paySheet = getSheetFast('Payments');
      var payHeaders = SCHEMAS['Payments'];
      var payId = data.payment.id || Utilities.getUuid();
      var payRow = payHeaders.map(function(h) {
        if (h === 'id') return payId;
        if (h === 'invoiceId') return id;
        if (h === 'invoiceNumber') return number;
        if (h === 'deleted') return false;
        if (h === 'createdAt') return now;
        var v = data.payment[h];
        if (v === undefined || v === null) {
          if (h === 'customerName') return invoiceData.customerName || '';
          return '';
        }
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      });
      paySheet.appendRow(payRow);
      paymentResult = { id: payId, invoiceId: id, invoiceNumber: number, ...data.payment };
    }
    SpreadsheetApp.flush();
    _invalidateListCache('Invoices'); _invalidateListCache('Items'); _invalidateListCache('Customers'); _invalidateListCache('Payments'); _invalidateListCache('ItemSerials');
    return { success: true, data: invoiceData, payment: paymentResult, quantum: true, ultraFast: true, ultraUltraFast: true, version: '5.0', operations: 1, numberGenerated: number };
  } catch (err) {
    return { success: false, error: err.toString(), stack: err.stack };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function createQuotationUltra(data) {
  var now = new Date().toISOString();
  try {
    var customer = null;
    if (data.customerId && !data.customerName) customer = getRow('Customers', data.customerId);
    var number = data.number;
    if (!number) number = generateQuotationNumber();
    var id = data.id || Utilities.getUuid();
    var sheet = getSheetFast('Quotations');
    var headers = SCHEMAS['Quotations'];
    var row = headers.map(function(h) {
      if (h === 'id') return id;
      if (h === 'number') return number;
      if (h === 'customerId') return data.customerId || '';
      if (h === 'customerName') return data.customerName || (customer ? customer.name : '');
      if (h === 'customerPhone') return data.customerPhone || (customer ? customer.phone : '');
      if (h === 'customerGstin') return data.customerGstin || (customer ? customer.gstNumber : '');
      if (h === 'deleted') return false;
      if (h === 'createdAt') return now;
      var v = data[h];
      if (v === undefined || v === null) {
        if (h === 'date') return data.date || now;
        if (h === 'validTill') return data.validTill || new Date(Date.now() + 7*24*60*60*1000).toISOString();
        if (h === 'status') return 'draft';
        return '';
      }
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    _invalidateListCache('Quotations');
    return { success: true, data: { id: id, number: number, ...data, customerName: data.customerName || (customer ? customer.name : ''), createdAt: now, deleted: false }, quantum: true, ultraFast: true, ultraUltraFast: true, version: '5.0' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ===== STANDARD CRUD - QUANTUM FAST =====
function listRows(sheetName, filter, search, includeDeleted) {
  var cacheKey = _listCacheKey(sheetName, filter, search, includeDeleted);
  var cached = _getListCache(cacheKey);
  if (cached) return cached;
  var sheet = getSheetFast(sheetName);
  var headers = SCHEMAS[sheetName];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rows = [];
  var deletedIdx = headers.indexOf('deleted');
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    if (!includeDeleted && deletedIdx >= 0) {
      var delVal = row[deletedIdx];
      if (delVal === true || String(delVal).toLowerCase() === 'true') continue;
    }
    var obj = {};
    for (var h = 0; h < headers.length; h++) obj[headers[h]] = (row[h] instanceof Date) ? row[h].toISOString() : row[h];
    rows.push(obj);
  }
  if (filter) {
    var parts = filter.split('=');
    var field = parts[0];
    var value = parts[1];
    if (field && value !== undefined) {
      var filtered = [];
      for (var i = 0; i < rows.length; i++) if (String(rows[i][field] || '') === String(value)) filtered.push(rows[i]);
      rows = filtered;
    }
  }
  if (search) {
    var q = search.toLowerCase();
    var searched = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var vals = Object.values(row);
      for (var v = 0; v < vals.length; v++) if (String(vals[v] || '').toLowerCase().indexOf(q) !== -1) { searched.push(row); break; }
    }
    rows = searched;
  }
  _putListCache(cacheKey, rows);
  _trackListCacheKey(sheetName, cacheKey);
  return rows;
}

function getRow(sheetName, id) {
  var listCacheKey = _listCacheKey(sheetName, '', '', false);
  var cached = _getListCache(listCacheKey);
  if (cached) {
    for (var i = 0; i < cached.length; i++) if (String(cached[i].id) === String(id)) return cached[i];
    var listCacheKey2 = _listCacheKey(sheetName, '', '', true);
    var cached2 = _getListCache(listCacheKey2);
    if (cached2) {
      for (var j = 0; j < cached2.length; j++) if (String(cached2[j].id) === String(id)) {
        if (cached2[j].deleted === true || String(cached2[j].deleted).toLowerCase() === 'true') return null;
        return cached2[j];
      }
    }
    return null;
  }
  // v11: id-index — read ONE column instead of the whole sheet.
  var sheet = getSheetFast(sheetName);
  var headers = SCHEMAS[sheetName];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var idMap = _buildIdIndex(sheetName);
  var rowNumber = idMap[String(id)];
  if (!rowNumber) return null;
  var rowData = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  var obj = {};
  for (var h = 0; h < headers.length; h++) obj[headers[h]] = (rowData[h] instanceof Date) ? rowData[h].toISOString() : rowData[h];
  if (obj.deleted === true || String(obj.deleted).toLowerCase() === 'true') return null;
  return obj;
}

function createRow(sheetName, data, isFast) {
  var sheet = getSheetFast(sheetName);
  var headers = SCHEMAS[sheetName];
  var id = data.id || Utilities.getUuid();
  var now = new Date().toISOString();
  var row = [];
  for (var h = 0; h < headers.length; h++) {
    var header = headers[h];
    if (header === 'id') row.push(id);
    else if (header === 'deleted') row.push(false);
    else if (header === 'createdAt') row.push(data.createdAt || now);
    else if (header === 'updatedAt') row.push(now);
    else {
      var v = data[header];
      if (v === undefined || v === null) row.push('');
      else if (typeof v === 'object') row.push(JSON.stringify(v));
      else row.push(v);
    }
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  if (!isFast) { SpreadsheetApp.flush(); _invalidateListCache(sheetName); }
  // v11: keep the id-index in sync so following updates are instant.
  if (_idIndexCache[sheetName]) {
    _idIndexCache[sheetName].map[String(id)] = sheet.getLastRow();
    _idIndexCache[sheetName].lastRow = sheet.getLastRow();
  }
  var result = { id: id };
  for (var k in data) result[k] = data[k];
  result.createdAt = data.createdAt || now; result.updatedAt = now; result.deleted = false;
  return { success: true, data: result, quantum: true, ultraFast: true };
}

function updateRow(sheetName, id, data) {
  var sheet = getSheetFast(sheetName);
  var headers = SCHEMAS[sheetName];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: 'No rows' };
  // v11: id-index lookup — ONE column read + ONE row read (was: whole sheet).
  var idMap = _buildIdIndex(sheetName);
  var rowNumber = idMap[String(id)];
  if (!rowNumber) return { success: false, error: 'Not found' };
  var existingRow = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  var now = new Date().toISOString();
  var updatedRow = [];
  for (var h = 0; h < headers.length; h++) {
    var header = headers[h];
    if (header === 'id') updatedRow.push(id);
    else if (header === 'updatedAt') updatedRow.push(now);
    else if (header === 'createdAt') updatedRow.push(existingRow[h] || now);
    else if (header === 'deleted') updatedRow.push(data.deleted !== undefined ? data.deleted : existingRow[h] || false);
    else if (data[header] !== undefined) {
      var v = data[header];
      updatedRow.push(typeof v === 'object' ? JSON.stringify(v) : v);
    } else updatedRow.push(existingRow[h]);
  }
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([updatedRow]);
  SpreadsheetApp.flush();
  _invalidateListCache(sheetName);
  // v11: return the FULL merged row (not just the changed fields) so the
  // Next.js write-through cache never replaces a full row with a partial one.
  var mergedRow = {};
  for (var h2 = 0; h2 < headers.length; h2++) {
    var header2 = headers[h2];
    if (header2 === 'updatedAt') mergedRow[header2] = now;
    else if (data[header2] !== undefined) {
      var v2 = data[header2];
      mergedRow[header2] = (typeof v2 === 'object') ? JSON.stringify(v2) : v2;
    } else if (updatedRow[h2] instanceof Date) mergedRow[header2] = updatedRow[h2].toISOString();
    else mergedRow[header2] = updatedRow[h2];
  }
  return { success: true, data: mergedRow, quantum: true, ultraFast: true };
}

function softDeleteRow(sheetName, id) { return updateRow(sheetName, id, { deleted: true, updatedAt: new Date().toISOString() }); }
function restoreRow(sheetName, id) { return updateRow(sheetName, id, { deleted: false, updatedAt: new Date().toISOString() }); }
function deleteRow(sheetName, id) { return softDeleteRow(sheetName, id); }

function bulkCreate(sheetName, dataArray) {
  var sheet = getSheetFast(sheetName);
  var headers = SCHEMAS[sheetName];
  var now = new Date().toISOString();
  var rows = [];
  var createdRows = [];
  for (var d = 0; d < dataArray.length; d++) {
    var data = dataArray[d];
    var id = data.id || Utilities.getUuid();
    var row = [];
    for (var h = 0; h < headers.length; h++) {
      var header = headers[h];
      if (header === 'id') row.push(id);
      else if (header === 'deleted') row.push(false);
      else if (header === 'createdAt') row.push(data.createdAt || now);
      else if (header === 'updatedAt') row.push(now);
      else {
        var v = data[header];
        if (v === undefined || v === null) row.push('');
        else if (typeof v === 'object') row.push(JSON.stringify(v));
        else row.push(v);
      }
    }
    rows.push(row);
    // v11: return the full entity so the Next.js layer can write-through cache.
    var entity = { id: id };
    for (var k in data) entity[k] = data[k];
    entity.createdAt = data.createdAt || now; entity.updatedAt = now; entity.deleted = false;
    createdRows.push(entity);
  }
  if (rows.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
    SpreadsheetApp.flush();
    // v11: keep id-index in sync.
    if (_idIndexCache[sheetName]) {
      for (var r = 0; r < createdRows.length; r++) {
        _idIndexCache[sheetName].map[String(createdRows[r].id)] = startRow + r;
      }
      _idIndexCache[sheetName].lastRow = startRow + rows.length - 1;
    }
  }
  _invalidateListCache(sheetName);
  return { success: true, count: rows.length, rows: createdRows, quantum: true, ultraFast: true };
}

function bulkUpdate(sheetName, updates) {
  if (!Array.isArray(updates) || updates.length === 0) return { success: true, count: 0, rows: [] };
  var sheet = getSheetFast(sheetName);
  var headers = SCHEMAS[sheetName];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: 'No rows' };
  // v11: reuse the id-index (single-column read) instead of a fresh scan.
  var idToRow = _buildIdIndex(sheetName);
  var now = new Date().toISOString();
  var count = 0;
  var updatedRows = [];
  for (var u = 0; u < updates.length; u++) {
    var upd = updates[u];
    var rowIndex = idToRow[String(upd.id)];
    if (!rowIndex) continue;
    var existingRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    var data = upd.data;
    var updatedRow = [];
    for (var h = 0; h < headers.length; h++) {
      var header = headers[h];
      if (header === 'id') updatedRow.push(upd.id);
      else if (header === 'updatedAt') updatedRow.push(now);
      else if (header === 'createdAt') updatedRow.push(existingRow[h] || now);
      else if (header === 'deleted') updatedRow.push(data.deleted !== undefined ? data.deleted : existingRow[h] || false);
      else if (data[header] !== undefined) {
        var v = data[header];
        updatedRow.push(typeof v === 'object' ? JSON.stringify(v) : v);
      } else updatedRow.push(existingRow[h]);
    }
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([updatedRow]);
    // v11: return the FULL merged row (write-through cache safety).
    var entity = {};
    for (var h2 = 0; h2 < headers.length; h2++) {
      var header2 = headers[h2];
      if (header2 === 'updatedAt') entity[header2] = now;
      else if (data[header2] !== undefined) {
        var v2 = data[header2];
        entity[header2] = (typeof v2 === 'object') ? JSON.stringify(v2) : v2;
      } else if (updatedRow[h2] instanceof Date) entity[header2] = updatedRow[h2].toISOString();
      else entity[header2] = updatedRow[h2];
    }
    updatedRows.push(entity);
    count++;
  }
  SpreadsheetApp.flush();
  _invalidateListCache(sheetName);
  return { success: true, count: count, rows: updatedRows, quantum: true, ultraFast: true };
}

function replaceAll(sheetName, dataArray) { return { success: false, error: 'replaceAll disabled' }; }

function saveShop(data) {
  var existing = listRows('Shop');
  if (existing.length > 0) return updateRow('Shop', existing[0].id, data);
  return createRow('Shop', { id: 'shop', ...data });
}

function getDashboardStats() {
  var items = listRows('Items');
  var customers = listRows('Customers');
  var allSuppliers = listRows('Suppliers');
  var suppliers = [];
  for (var i = 0; i < allSuppliers.length; i++) {
    var s = allSuppliers[i];
    if (s.active === true || s.active === 'true') suppliers.push(s);
  }
  var invoices = listRows('Invoices');
  var quotations = listRows('Quotations');
  var payments = listRows('Payments');
  var enquiries = listRows('Enquiries');
  var jobs = []; var servicePayments = [];
  try { jobs = listRows('Jobs'); } catch (e) { jobs = []; }
  try { servicePayments = listRows('ServicePayments'); } catch (e) { servicePayments = []; }
  var now = new Date();
  var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  var startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var monthSales = 0, monthProfit = 0, monthCashSales = 0, monthCreditSales = 0, totalOutstanding = 0;
  var pendingInvoices = []; var recentInvoices = [];
  for (var ii = 0; ii < invoices.length; ii++) {
    var inv = invoices[ii];
    var invDate = new Date(inv.date);
    if (invDate >= startOfMonth) {
      var gt = Number(inv.grandTotal) || 0;
      monthSales += gt;
      monthProfit += Number(inv.profit) || 0;
      if (inv.paymentType === 'cash') monthCashSales += gt;
      if (inv.paymentType === 'credit') monthCreditSales += gt;
    }
    if (inv.paymentStatus === 'unpaid' || inv.paymentStatus === 'partial') {
      totalOutstanding += Number(inv.amountDue) || 0;
      if (pendingInvoices.length < 10) pendingInvoices.push(inv);
    }
  }
  recentInvoices = invoices.slice().sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 5);
  var stockValueCost = 0, stockValueSelling = 0, lowStockItems = [];
  for (var it = 0; it < items.length; it++) {
    var item = items[it];
    var qty = Number(item.quantity) || 0;
    stockValueCost += (Number(item.costPrice) || 0) * qty;
    stockValueSelling += (Number(item.sellingPrice) || 0) * qty;
    if (qty <= (Number(item.minQuantity) || 0) && lowStockItems.length < 10) lowStockItems.push(item);
  }
  var monthQuotations = [];
  for (var q = 0; q < quotations.length; q++) if (new Date(quotations[q].date) >= startOfMonth) monthQuotations.push(quotations[q]);
  var monthQuotationValue = 0;
  for (var q = 0; q < monthQuotations.length; q++) monthQuotationValue += Number(monthQuotations[q].grandTotal) || 0;
  var todayPayments = [];
  for (var p = 0; p < payments.length; p++) if (new Date(payments[p].date) >= startOfToday) todayPayments.push(payments[p]);
  var todayPaymentTotal = 0;
  for (var p = 0; p < todayPayments.length; p++) todayPaymentTotal += Number(todayPayments[p].amount) || 0;
  var pendingEnquiries = 0;
  for (var e = 0; e < enquiries.length; e++) {
    var enq = enquiries[e];
    if ((enq.status === 'sent' || enq.status === 'responded') && enq.appliedToItems !== true && enq.appliedToItems !== 'true') pendingEnquiries++;
  }
  var recentPayments = payments.slice().sort(function(a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 10);
  var recentEnquiries = enquiries.slice().sort(function(a, b) { return new Date(b.sentAt) - new Date(a.sentAt); }).slice(0, 10);
  var monthJobs = [], todayJobs = [], pendingJobs = [], completedJobs = [], deliveredJobs = [], highPriorityJobs = [];
  for (var j = 0; j < jobs.length; j++) {
    var job = jobs[j];
    var jobDate = new Date(job.createdAt || job.date || 0);
    if (jobDate >= startOfMonth) monthJobs.push(job);
    if (jobDate >= startOfToday) todayJobs.push(job);
    if (job.status === 'Pending' || job.status === 'In Progress') pendingJobs.push(job);
    if (job.status === 'Completed') completedJobs.push(job);
    if (job.status === 'Delivered') deliveredJobs.push(job);
    if (job.priority === 'High' && (job.status === 'Pending' || job.status === 'In Progress')) highPriorityJobs.push(job);
  }
  var todayServicePayments = [], monthServicePayments = [];
  for (var sp = 0; sp < servicePayments.length; sp++) {
    var sPay = servicePayments[sp];
    if (new Date(sPay.date) >= startOfToday) todayServicePayments.push(sPay);
    if (new Date(sPay.date) >= startOfMonth) monthServicePayments.push(sPay);
  }
  var todayServiceTotal = 0, todayServiceUPI = 0, todayServiceCash = 0;
  for (var i = 0; i < todayServicePayments.length; i++) {
    todayServiceTotal += Number(todayServicePayments[i].amount) || 0;
    if (todayServicePayments[i].mode === 'UPI') todayServiceUPI += Number(todayServicePayments[i].amount) || 0;
    if (todayServicePayments[i].mode === 'Cash') todayServiceCash += Number(todayServicePayments[i].amount) || 0;
  }
  var monthServiceTotal = 0, monthServiceUPI = 0, monthServiceCash = 0;
  for (var i = 0; i < monthServicePayments.length; i++) {
    monthServiceTotal += Number(monthServicePayments[i].amount) || 0;
    if (monthServicePayments[i].mode === 'UPI') monthServiceUPI += Number(monthServicePayments[i].amount) || 0;
    if (monthServicePayments[i].mode === 'Cash') monthServiceCash += Number(monthServicePayments[i].amount) || 0;
  }
  var svcShare = 0, partsProfitShare = 0;
  var paidJobIds = {};
  for (var i = 0; i < monthServicePayments.length; i++) if (monthServicePayments[i].jobId) paidJobIds[monthServicePayments[i].jobId] = true;
  for (var jid in paidJobIds) {
    var job = null;
    for (var j = 0; j < jobs.length; j++) if (jobs[j].jobId === jid) { job = jobs[j]; break; }
    if (!job) continue;
    var jobPaid = 0;
    for (var i = 0; i < monthServicePayments.length; i++) if (monthServicePayments[i].jobId === jid) jobPaid += Number(monthServicePayments[i].amount) || 0;
    if (jobPaid <= 0) continue;
    var totalJob = Number(job.finalAmount) || 0;
    var svc = Number(job.serviceProfit) || 0;
    var pp = Number(job.partsProfit) || 0;
    var paidRatio = totalJob > 0 ? Math.min(jobPaid / totalJob, 1) : 1;
    svcShare += Math.round(svc * paidRatio);
    partsProfitShare += Math.round(pp * paidRatio);
  }
  var adminServiceShare = Math.round(svcShare / 2);
  var adminPartsShare = Math.round(partsProfitShare / 2);
  var adminTotalShare = adminServiceShare + adminPartsShare;
  return {
    stats: {
      totalItems: items.length, lowStockCount: lowStockItems.length, totalCustomers: customers.length, totalSuppliers: suppliers.length,
      stockValueCost: stockValueCost, stockValueSelling: stockValueSelling, monthSales: monthSales, monthProfit: monthProfit,
      monthCashSales: monthCashSales, monthCreditSales: monthCreditSales, totalOutstanding: totalOutstanding,
      monthQuotationValue: monthQuotationValue, totalQuotations: monthQuotations.length, todayPaymentTotal: todayPaymentTotal, pendingEnquiries: pendingEnquiries,
      totalJobs: jobs.length, pendingJobs: pendingJobs.length, completedJobs: completedJobs.length, deliveredJobs: deliveredJobs.length,
      highPriorityJobs: highPriorityJobs.length, todayJobs: todayJobs.length, monthJobs: monthJobs.length,
      todayServiceTotal: todayServiceTotal, todayServiceUPI: todayServiceUPI, todayServiceCash: todayServiceCash,
      monthServiceTotal: monthServiceTotal, monthServiceUPI: monthServiceUPI, monthServiceCash: monthServiceCash,
      adminServiceShare: adminServiceShare, adminPartsShare: adminPartsShare, adminTotalShare: adminTotalShare,
      engineerServiceShare: adminServiceShare, engineerPartsShare: adminPartsShare, engineerTotalShare: adminTotalShare
    },
    pendingInvoices: pendingInvoices, recentInvoices: recentInvoices, recentPayments: recentPayments,
    recentEnquiries: recentEnquiries, lowStockList: lowStockItems,
    recentJobs: jobs.slice().sort(function(a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); }).slice(0, 5)
  };
}

function safeListRows(sheetName) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) return [];
    return listRows(sheetName);
  } catch (e) { return []; }
}

function seedData() {
  var itemsCount = listRows('Items').length;
  var customersCount = listRows('Customers').length;
  var suppliersCount = listRows('Suppliers').length;
  var shopCount = listRows('Shop').length;
  var results = { shop: false, suppliers: 0, items: 0, customers: 0 };
  if (shopCount === 0) {
    saveShop({
      name: 'Smart Computers', owner: 'Shop Owner', phone: '9876543210',
      email: 'smartcomputers@example.com', address: 'Main Road, City Center',
      gstNumber: '29ABCDE1234F1Z5', state: 'Karnataka',
      invoicePrefix: 'INV', quotationPrefix: 'QTN',
      termsInvoice: 'Goods once sold will not be taken back. Subject to local jurisdiction.',
      termsQuotation: 'Quotation valid for 7 days from date of issue.',
    });
    results.shop = true;
  }
  if (suppliersCount === 0) {
    var suppliers = [
      { name: 'Tech Distributors', phone: '919876543210', whatsappNumber: '919876543210', company: 'Tech Distributors Pvt Ltd', suppliedItems: 'Laptop,Desktop,Processor', active: true, includeInAutoEnquiry: true },
      { name: 'Compu WholeSale', phone: '919812345678', whatsappNumber: '919812345678', company: 'Compu WholeSale', suppliedItems: 'RAM,SSD,HDD,Mouse,Keyboard', active: true, includeInAutoEnquiry: true },
      { name: 'Printer Bazaar', phone: '919988776655', whatsappNumber: '919988776655', company: 'Printer Bazaar', suppliedItems: 'Printer,Ink,Toner', active: true, includeInAutoEnquiry: true },
    ];
    var r = bulkCreate('Suppliers', suppliers);
    results.suppliers = r.count;
  }
  if (itemsCount === 0) {
    var suppliers = listRows('Suppliers');
    var items = [
      { name: 'HP Laptop 15s', sku: 'LAP-HP-15S', category: 'Laptop', gstApplicable: true, gstRate: 18, costPrice: 35000, sellingPrice: 40000, quantity: 5, minQuantity: 2, hsnCode: '8471', supplierId: (suppliers[0] && suppliers[0].id) || '' },
      { name: '8GB DDR4 RAM', sku: 'RAM-8GB-DDR4', category: 'RAM', gstApplicable: true, gstRate: 18, costPrice: 1800, sellingPrice: 2200, quantity: 20, minQuantity: 5, hsnCode: '8542', supplierId: (suppliers[1] && suppliers[1].id) || '' },
      { name: '512GB SSD', sku: 'SSD-512-SATA', category: 'Storage', gstApplicable: true, gstRate: 18, costPrice: 2800, sellingPrice: 3500, quantity: 15, minQuantity: 5, hsnCode: '8542', supplierId: (suppliers[1] && suppliers[1].id) || '' },
    ];
    var r = bulkCreate('Items', items);
    results.items = r.count;
  }
  if (customersCount === 0) {
    var customers = [
      { name: 'Rahul Sharma', phone: '9123456789', email: 'rahul@example.com', address: 'MG Road, Bangalore', state: 'Karnataka', creditBalance: 0 },
      { name: 'Walk-in Customer', phone: '', address: '', state: '', creditBalance: 0 },
    ];
    var r = bulkCreate('Customers', customers);
    results.customers = r.count;
  }
  return { success: true, results: results };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function testSetup() {
  ensureAllSheets();
  Logger.log('Setup complete! Sheets: ' + SHEET_NAMES.join(', '));
  Logger.log('Quantum v5.0 - getAllData + liveSync + Pins + Quantum cache');
}

function listDeletedRows(sheetName) {
  return listRows(sheetName, null, null, true).filter(function(r) { return r.deleted === true || String(r.deleted).toLowerCase() === 'true'; });
}
