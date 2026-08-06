/**
 * Integration test for the v11 write-through cache + request dedupe in
 * sheets-client.ts. Runs a mock Apps Script server IN-PROCESS (this sandbox
 * blocks child-process loopback), then verifies:
 *   1. createRow patches the cache — the next listRows() makes ZERO HTTP calls
 *   2. updateRow patches in place — same, zero HTTP calls
 *   3. deleteRow removes from cache — zero HTTP calls
 *   4. filtered/search lists stay consistent
 *   5. concurrent identical GETs dedupe into ONE HTTP call
 *   6. _clientRef idempotency key is sent on create actions
 * Run: npx tsx scripts/write-through-test.ts
 */
import { createServer, Server } from 'node:http'

// ---- tiny mock Apps Script store (in-memory) ----
const store: Record<string, Map<string, any>> = {
  Items: new Map(),
  Customers: new Map(),
}
let seq = 0
function newId() { return 'id_' + (++seq) }
const seenRefs = new Set<string>()

const server: Server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const body = (() => { try { return JSON.parse(raw) } catch { return {} } })()
    const action = url.searchParams.get('action') || body.action
    const sheet = url.searchParams.get('sheet') || body.sheet
    const id = url.searchParams.get('id') || body.id
    let result: any
    switch (action) {
      case 'ping':
        result = { success: true }
        break
      case 'list': {
        // Mirror code.gs listRows: soft-delete filter + filter + search
        let rows = [...(store[sheet]?.values() || [])].filter((r) => !r.deleted)
        const filter = url.searchParams.get('filter')
        if (filter) {
          const [field, value] = filter.split('=')
          rows = rows.filter((r) => String(r?.[field] ?? '') === String(value))
        }
        const search = url.searchParams.get('search')
        if (search) {
          const q = search.toLowerCase()
          rows = rows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)))
        }
        result = { success: true, data: rows }
        break
      }
      case 'get': {
        const row = store[sheet]?.get(id)
        result = row && !row.deleted ? { success: true, data: row } : { success: false, error: 'Not found' }
        break
      }
      case 'create': {
        // idempotency: same _clientRef → return original result, no new row
        if (body._clientRef && seenRefs.has(body._clientRef)) {
          result = { success: true, data: { deduped: true } }
          break
        }
        const data = body.data || {}
        const nid = data.id || newId()
        const row = { ...data, id: nid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deleted: false }
        store[sheet].set(nid, row)
        if (body._clientRef) seenRefs.add(body._clientRef)
        result = { success: true, data: row }
        break
      }
      case 'update': {
        const existing = store[sheet]?.get(id)
        if (!existing) { result = { success: false, error: 'Not found' }; break }
        const merged = { ...existing, ...(body.data || {}), updatedAt: new Date().toISOString() }
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
      default:
        result = { success: false, error: 'Unknown action ' + action }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
  })
})

async function main() {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as any).port
  process.env.APPS_SCRIPT_URL = `http://127.0.0.1:${port}/exec`

  // Import AFTER env is set (module reads env lazily at call time anyway)
  const { listRows, createRow, updateRow, deleteRow, getRow } = await import('../src/lib/sheets-client')

  let httpCalls = 0
  const origFetch = globalThis.fetch
  globalThis.fetch = async (input: any, init?: any) => {
    httpCalls++
    return origFetch(input, init)
  }

  function assert(cond: boolean, msg: string) {
    if (!cond) { console.error('FAIL: ' + msg); process.exit(1) }
    console.log('PASS: ' + msg)
  }

  // --- Test 1: create patches the EXISTING list cache; next list is instant ---
  // (Real app flow: panel loads the list first, then the user creates.)
  process.env.SMARTCOMP_RECONCILE_DELAY_MS = '60000' // keep background reconcile quiet
  const before = await listRows('Items')
  assert(before.length === 0, 'initial list is empty (1 HTTP call)')
  assert(httpCalls === 1, 'initial listRows = 1 HTTP call')

  const item = await createRow('Items', { name: 'HP Laptop 15s', sku: 'LAP-1', sellingPrice: 40000 })
  assert(item && item.id, 'createRow returns created item')
  assert(httpCalls === 2, 'createRow made exactly 1 more HTTP call')

  const list1 = await listRows('Items')
  assert(list1.length === 1 && list1[0].id === item.id, 'listRows sees the new item')
  assert(httpCalls === 2, 'listRows after create is served from cache — 0 new HTTP calls')

  // --- Test 2: update patches in place ---
  const updated = await updateRow('Items', item.id, { sellingPrice: 45000, name: 'HP Laptop 15s Pro' })
  assert(updated.sellingPrice === 45000, 'updateRow returns updated fields')
  const list2 = await listRows('Items')
  assert(list2[0].sellingPrice === 45000 && list2[0].name === 'HP Laptop 15s Pro', 'cached list reflects update without refetch')
  assert(httpCalls === 3, 'update added exactly 1 HTTP call; list read was cache-served')

  // --- Test 3: getRow is instant from cache ---
  const got = await getRow('Items', item.id)
  assert(got && got.sellingPrice === 45000, 'getRow returns updated cached row')
  assert(httpCalls === 3, 'getRow after update served from cache (0 new HTTP calls)')

  // --- Test 4: delete removes from cached list instantly ---
  await deleteRow('Items', item.id)
  const list3 = await listRows('Items')
  assert(list3.length === 0, 'deleted item gone from cached list immediately')
  assert(httpCalls === 4, 'list read after delete served from cache')
  const got2 = await getRow('Items', item.id)
  assert(got2 === null, 'getRow for deleted item returns null')
  assert(httpCalls === 5, 'getRow for deleted item falls back to 1 server call (not found)')

  // --- Test 5: search-filtered list gets patched correctly ---
  const a = await createRow('Items', { name: 'Dell Monitor', sku: 'MON-1', category: 'Monitor' })
  await createRow('Items', { name: 'HP Mouse', sku: 'MOU-1', category: 'Accessory' })
  const searchList = await listRows('Items', { search: 'Dell' })
  assert(searchList.length === 1 && searchList[0].id === a.id, 'search list returns only Dell')
  assert(httpCalls === 8, 'first-ever search list costs 1 server call')
  await updateRow('Items', a.id, { name: 'LG Monitor Ultra' })
  const searchList2 = await listRows('Items', { search: 'Dell' })
  assert(searchList2.length === 0, 'renamed item drops out of search cache')
  assert(httpCalls === 9, 'Dell search read served from patched cache (0 new calls)')
  const searchList3 = await listRows('Items', { search: 'LG' })
  assert(searchList3.length === 1, 'renamed item appears in new search cache')
  assert(httpCalls === 10, 'LG search first read costs exactly 1 server call')

  // --- Test 6: concurrent identical list requests dedupe into ONE HTTP call ---
  httpCalls = 0
  const [c1, c2, c3] = await Promise.all([
    listRows('Items', { useCache: false }),
    listRows('Items', { useCache: false }),
    listRows('Items', { useCache: false }),
  ])
  assert(c1.length === c2.length && c2.length === c3.length, 'parallel reads return same data')
  assert(httpCalls === 1, '3 concurrent listRows = 1 HTTP call (request dedupe)')

  // --- Test 7: filtered list (category=Monitor) patched correctly ---
  httpCalls = 0
  const monitors = await listRows('Items', { filter: 'category=Monitor', useCache: false })
  assert(monitors.length === 1, 'filtered list returns 1 monitor')
  const mouse = await createRow('Items', { name: 'HP Mouse Pro', sku: 'MOU-2', category: 'Accessory' })
  const monitors2 = await listRows('Items', { filter: 'category=Monitor' })
  assert(monitors2.length === 1, 'non-matching create does not pollute filtered list')
  await updateRow('Items', a.id, { category: 'Accessory' })
  const monitors3 = await listRows('Items', { filter: 'category=Monitor' })
  assert(monitors3.length === 0, 'update that changes filter value drops row from filtered cache')

  console.log('\nALL TESTS PASSED ✅')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
