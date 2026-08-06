import { NextRequest, NextResponse } from 'next/server'
import { listRows, isConfigured } from '@/lib/sheets-client'

/**
 * Universal smart-search endpoint.
 * Searches across invoices, items, customers, jobs, quotations, suppliers
 * with a single lightweight regex-free scoring routine. No external libs.
 */

type SearchHit = {
  type: string
  id: string
  title: string
  subtitle: string
  score: number
}

function score(text: string | undefined | null, q: string): number {
  if (!text) return 0
  const s = String(text).toLowerCase()
  const ql = q.toLowerCase()
  if (!s) return 0
  if (s === ql) return 100
  if (s.startsWith(ql)) return 80
  if (s.includes(ql)) return 50
  return 0
}

function searchAll(q: string, datasets: {
  invoices?: any[]
  items?: any[]
  customers?: any[]
  jobs?: any[]
  quotations?: any[]
  suppliers?: any[]
}): SearchHit[] {
  const hits: SearchHit[] = []
  const push = (h: SearchHit) => { if (h.score > 0) hits.push(h) }

  for (const inv of datasets.invoices || []) {
    const s = score(inv.number, q) + score(inv.customerName, q) * 0.7
    push({
      type: 'invoice',
      id: String(inv.id || ''),
      title: inv.number || 'Invoice',
      subtitle: inv.customerName || 'Walk-in',
      score: s,
    })
  }
  for (const it of datasets.items || []) {
    const s = score(it.name, q) + score(it.sku, q) * 0.7 + score(it.category, q) * 0.4
    push({
      type: 'item',
      id: String(it.id || ''),
      title: it.name || 'Item',
      subtitle: it.sku || '',
      score: s,
    })
  }
  for (const c of datasets.customers || []) {
    const s = score(c.name, q) + score(c.phone, q) * 0.7
    push({
      type: 'customer',
      id: String(c.id || ''),
      title: c.name || 'Customer',
      subtitle: c.phone || '',
      score: s,
    })
  }
  for (const j of datasets.jobs || []) {
    const s = score(j.jobId, q) + score(j.customerName, q) * 0.7 + score(j.brandModel, q) * 0.5
    push({
      type: 'job',
      id: String(j.id || ''),
      title: j.jobId || 'Job',
      subtitle: `${j.customerName || ''} ${j.brandModel || ''}`.trim(),
      score: s,
    })
  }
  for (const qt of datasets.quotations || []) {
    const s = score(qt.number, q) + score(qt.customerName, q) * 0.7
    push({
      type: 'quotation',
      id: String(qt.id || ''),
      title: qt.number || 'Quotation',
      subtitle: qt.customerName || 'Walk-in',
      score: s,
    })
  }
  for (const sup of datasets.suppliers || []) {
    const s = score(sup.name, q) + score(sup.contactPerson, q) * 0.5
    push({
      type: 'supplier',
      id: String(sup.id || ''),
      title: sup.name || 'Supplier',
      subtitle: sup.contactPerson || '',
      score: s,
    })
  }

  return hits.sort((a, b) => b.score - a.score)
}

async function doSearch(q: string, limit: number) {
  if (!isConfigured()) return { results: [], query: q, total: 0 }
  const [invoices, items, customers, jobs, quotations, suppliers] = await Promise.all([
    listRows<any>('Invoices').then(r => r.slice(0, 200)).catch(() => []),
    listRows<any>('Items').catch(() => []),
    listRows<any>('Customers').catch(() => []),
    listRows<any>('Jobs').then(r => r.slice(0, 150)).catch(() => []),
    listRows<any>('Quotations').then(r => r.slice(0, 100)).catch(() => []),
    listRows<any>('Suppliers').catch(() => []),
  ])
  const results = searchAll(q, { invoices, items, customers, jobs, quotations, suppliers }).slice(0, limit)
  return { results, query: q, total: results.length }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const q = url.searchParams.get('q') || url.searchParams.get('query') || ''
    const limit = parseInt(url.searchParams.get('limit') || '15')

    if (!q || q.trim().length < 2) {
      return NextResponse.json({ results: [], query: q, message: 'Query too short, minimum 2 characters' })
    }
    const out = await doSearch(q, limit)
    return NextResponse.json(out, { headers: { 'Cache-Control': 'public, max-age=30' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Search error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { query, limit = 15 } = body
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 })
    const out = await doSearch(String(query), Number(limit) || 15)
    return NextResponse.json(out)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
