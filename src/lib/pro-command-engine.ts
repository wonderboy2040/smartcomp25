/**
 * SmartComp Pro Command Engine v7.0
 * Universal Search + Quick Actions + Voice + Natural Language
 * Spotlight-style command palette
 */

export interface Command {
  id: string
  title: string
  description: string
  category: 'navigation' | 'action' | 'create' | 'search' | 'report' | 'ai'
  icon: string
  keywords: string[]
  action: () => void | Promise<void>
  shortcut?: string
  premium?: boolean
}

export interface SearchResult {
  id: string
  type: 'invoice' | 'customer' | 'item' | 'job' | 'quotation' | 'payment' | 'supplier'
  title: string
  subtitle: string
  meta: string
  score: number
  /** Nav id of the panel this result lives in — used to jump there on click. */
  tab: string
  url?: string
  data: any
}

export interface QuickStat {
  label: string
  value: string
  change: number
  trend: 'up' | 'down' | 'stable'
}

/** Sheets columns arrive as strings, numbers, or undefined — normalise before display. */
function str(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * Universal fuzzy search across all data
 */
export function universalSearch(
  query: string,
  data: {
    invoices?: any[]
    customers?: any[]
    items?: any[]
    jobs?: any[]
    quotations?: any[]
    suppliers?: any[]
  }
): SearchResult[] {
  if (!query || query.trim().length < 2) return []

  const q = query.toLowerCase().trim()
  const results: SearchResult[] = []

  // Every collection is coerced: a list route can answer with a
  // `{ data, pagination }` envelope instead of a bare array, and `.forEach`
  // on that object throws and takes the whole panel down.
  const rows = (value: unknown): any[] => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const inner = (value as { data?: unknown }).data
      if (Array.isArray(inner)) return inner
    }
    return []
  }

  // Sheets hands back numbers for numeric-looking columns (phone, HSN code,
  // invoice numbers), so `text.toLowerCase` is not always a function.
  const scoreMatch = (value: unknown, query: string): number => {
    if (value === null || value === undefined) return 0
    const lower = String(value).toLowerCase()
    if (!lower) return 0
    if (lower === query) return 100
    if (lower.startsWith(query)) return 90
    if (lower.includes(query)) return 70
    // fuzzy: check if all chars in order
    let qi = 0
    for (let i = 0; i < lower.length && qi < query.length; i++) {
      if (lower[i] === query[qi]) qi++
    }
    if (qi === query.length) return 40
    return 0
  }

  const best = (texts: unknown[]) => texts.reduce<number>((m, t) => Math.max(m, scoreMatch(t, q)), 0)

  // Search invoices
  ;rows(data.invoices).forEach(inv => {
    const maxScore = best([inv.number, inv.customerName, inv.customerPhone, inv.grandTotal])
    if (maxScore > 0) {
      results.push({
        id: `inv_${inv.id}`,
        type: 'invoice',
        title: str(inv.number) || `INV ${str(inv.id).slice(0, 8)}`,
        subtitle: str(inv.customerName) || 'Customer',
        meta: `Rs.${Number(inv.grandTotal || 0).toLocaleString()} • ${str(inv.paymentStatus) || 'unpaid'}`,
        score: maxScore + (str(inv.number).toLowerCase().includes(q) ? 10 : 0),
        tab: 'invoices',
        data: inv,
      })
    }
  })

  // Search customers
  ;rows(data.customers).forEach(cust => {
    const maxScore = best([cust.name, cust.phone, cust.email])
    if (maxScore > 0) {
      results.push({
        id: `cust_${cust.id}`,
        type: 'customer',
        title: str(cust.name) || str(cust.phone) || 'Customer',
        subtitle: str(cust.phone) || str(cust.email),
        meta: `${cust._count?.invoices ?? cust.totalInvoices ?? 0} invoices • Rs.${Number(cust.totalSpent || 0).toLocaleString()} spent`,
        score: maxScore + 5,
        tab: 'customers',
        data: cust,
      })
    }
  })

  // Search items
  ;rows(data.items).forEach(item => {
    const maxScore = best([item.name, item.sku, item.category, item.hsnCode])
    if (maxScore > 0) {
      results.push({
        id: `item_${item.id}`,
        type: 'item',
        title: str(item.name) || str(item.sku) || 'Item',
        subtitle: [str(item.sku), str(item.category)].filter(Boolean).join(' • '),
        meta: `${Number(item.quantity) || 0} ${str(item.unit) || 'pcs'} • Rs.${Number(item.sellingPrice || 0).toLocaleString()}`,
        score: maxScore,
        tab: 'stock',
        data: item,
      })
    }
  })

  // Search jobs
  ;rows(data.jobs).forEach(job => {
    const maxScore = best([job.jobId, job.customerName, job.device, job.problem, job.customerPhone])
    if (maxScore > 0) {
      results.push({
        id: `job_${job.id}`,
        type: 'job',
        title: str(job.jobId) || `${str(job.device)} - ${str(job.customerName)}`,
        subtitle: [str(job.customerName), str(job.device)].filter(Boolean).join(' • '),
        meta: `${str(job.status) || 'Pending'} • ${str(job.priority) || 'Normal'} priority`,
        score: maxScore,
        tab: 'jobs',
        data: job,
      })
    }
  })

  // Search quotations
  ;rows(data.quotations).forEach(qt => {
    const maxScore = best([qt.number, qt.customerName])
    if (maxScore > 0) {
      results.push({
        id: `qt_${qt.id}`,
        type: 'quotation',
        title: str(qt.number) || `QT ${str(qt.id).slice(0, 8)}`,
        subtitle: str(qt.customerName) || 'Customer',
        meta: `Rs.${Number(qt.grandTotal || 0).toLocaleString()} • ${str(qt.status) || 'sent'}`,
        score: maxScore,
        tab: 'quotations',
        data: qt,
      })
    }
  })

  // Search suppliers
  ;rows(data.suppliers).forEach(sup => {
    const maxScore = best([sup.name, sup.company, sup.phone])
    if (maxScore > 0) {
      results.push({
        id: `sup_${sup.id}`,
        type: 'supplier',
        title: str(sup.name) || str(sup.company) || 'Supplier',
        subtitle: str(sup.company) || str(sup.phone),
        meta: str(sup.suppliedItems),
        score: maxScore,
        tab: 'suppliers',
        data: sup,
      })
    }
  })

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
}

/**
 * Generate smart quick actions based on context
 */
export interface ContextAction {
  title: string
  description: string
  icon: string
  priority: number
  actionId: string
  /** Nav id the action opens when clicked. */
  tab: string
}

export function generateContextActions(data: {
  invoices?: any[]
  items?: any[]
  jobs?: any[]
  dashboard?: any
}): ContextAction[] {
  const actions: ContextAction[] = []
  const list = (value: unknown): any[] => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const inner = (value as { data?: unknown }).data
      if (Array.isArray(inner)) return inner
    }
    return []
  }

  // Low stock
  const lowStock = list(data.items).filter((it: any) => Number(it.quantity) <= Number(it.minQuantity))
  if (lowStock.length > 0) {
    actions.push({
      title: `Reorder ${lowStock.length} Low Stock Items`,
      description: `${lowStock.slice(0, 2).map((i: any) => str(i.name)).join(', ')}${lowStock.length > 2 ? ` +${lowStock.length - 2} more` : ''}`,
      icon: 'Package',
      priority: lowStock.length > 5 ? 100 : 70,
      actionId: 'reorder_low_stock',
      tab: 'stock',
    })
  }

  // Overdue invoices
  const overdue = list(data.invoices).filter((inv: any) => Number(inv.amountDue) > 0)
  if (overdue.length > 0) {
    const totalDue = overdue.reduce((s: number, inv: any) => s + Number(inv.amountDue), 0)
    actions.push({
      title: `Collect Rs.${totalDue.toLocaleString()} Outstanding`,
      description: `${overdue.length} invoices pending payment`,
      icon: 'Wallet',
      priority: totalDue > 50000 ? 95 : 60,
      actionId: 'collect_payments',
      tab: 'payments',
    })
  }

  // Pending jobs
  const pendingJobs = list(data.jobs).filter((j: any) => j.status === 'Pending' || j.status === 'In Progress')
  if (pendingJobs.length > 3) {
    actions.push({
      title: `${pendingJobs.length} Service Jobs Need Attention`,
      description: `${pendingJobs.filter((j: any) => j.priority === 'High').length} high priority`,
      icon: 'Wrench',
      priority: 80,
      actionId: 'view_pending_jobs',
      tab: 'jobs',
    })
  }

  // Daily report
  const hour = new Date().getHours()
  if (hour >= 9 && hour <= 11) {
    actions.push({
      title: 'Review Morning Dashboard',
      description: 'Check today sales, payments, pending tasks',
      icon: 'BarChart3',
      priority: 40,
      actionId: 'view_dashboard',
      tab: 'dashboard',
    })
  }

  // AI insights
  actions.push({
    title: 'Generate AI Business Insights',
    description: 'Get super intelligence analysis & recommendations',
    icon: 'Brain',
    priority: 50,
    actionId: 'ai_insights',
    tab: 'ai',
  })

  return actions.sort((a, b) => b.priority - a.priority).slice(0, 6)
}

/**
 * Voice command processor (client-side intent mapping)
 */
export function processVoiceCommand(transcript: string): { intent: string; params: Record<string, string>; response: string } {
  const text = transcript.toLowerCase().trim()

  if (text.includes('show') && (text.includes('invoice') || text.includes('bill'))) {
    return {
      intent: 'navigate',
      params: { tab: 'invoices' },
      response: 'Showing invoices panel',
    }
  }
  if (text.includes('new invoice') || text.includes('create invoice')) {
    return {
      intent: 'create',
      params: { type: 'invoice' },
      response: 'Opening new invoice form',
    }
  }
  if (text.includes('stock') && (text.includes('show') || text.includes('open'))) {
    return { intent: 'navigate', params: { tab: 'stock' }, response: 'Opening stock panel' }
  }
  if (text.includes('customer')) {
    return { intent: 'navigate', params: { tab: 'customers' }, response: 'Opening customers' }
  }
  if (text.includes('dashboard') || text.includes('home')) {
    return { intent: 'navigate', params: { tab: 'dashboard' }, response: 'Going to dashboard' }
  }
  if (text.includes('service') || text.includes('job')) {
    return { intent: 'navigate', params: { tab: 'jobs' }, response: 'Opening service jobs' }
  }
  if (text.includes('report') || text.includes('analytics')) {
    return { intent: 'navigate', params: { tab: 'reports' }, response: 'Opening reports' }
  }
  if (text.includes('payment')) {
    return { intent: 'navigate', params: { tab: 'payments' }, response: 'Opening payments' }
  }
  if (text.match(/(search|find).*(invoice|bill).*(number|no)?\s*([a-z0-9\/-]+)/)) {
    const match = text.match(/([a-z0-9\/-]{3,})$/)
    return {
      intent: 'search',
      params: { query: match?.[1] || '', type: 'invoice' },
      response: `Searching for ${match?.[1]}`,
    }
  }
  if (text.includes('low stock')) {
    return { intent: 'search', params: { query: 'low stock', filter: 'lowStock' }, response: 'Finding low stock items' }
  }
  if (text.includes('how much') && text.includes('sales')) {
    return { intent: 'ai_query', params: { query: 'sales today' }, response: 'Checking sales data' }
  }

  return {
    intent: 'unknown',
    params: {},
    response: `Sorry, I didn't understand "${transcript}". Try: "show invoices", "new invoice", "low stock", "customers", "service jobs"`,
  }
}

// ===== KEYBOARD SHORTCUTS =====

// Only shortcuts the Command Center actually binds are listed. The panel
// renders this verbatim, so anything added here must have a real handler.
export const KEYBOARD_SHORTCUTS = [
  { key: 'Ctrl+K / ⌘K', description: 'Focus universal search', category: 'Search' },
  { key: '↑ / ↓', description: 'Move through results', category: 'Search' },
  { key: 'Enter', description: 'Open the selected result', category: 'Search' },
  { key: 'Esc', description: 'Clear the search box', category: 'Search' },
]
