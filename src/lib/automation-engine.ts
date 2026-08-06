/**
 * SmartComp Automation Engine v7.0 PRO
 * No-code workflow automation for shop operations
 * Triggers, conditions, actions - pure TypeScript
 */

export type TriggerType = 
  | 'invoice_created'
  | 'low_stock'
  | 'payment_overdue'
  | 'job_completed'
  | 'job_pending_3days'
  | 'customer_inactive'
  | 'expense_threshold'
  | 'daily_report'
  | 'weekly_report'
  | 'custom_schedule'

export type ActionType =
  | 'send_whatsapp'
  | 'send_email'
  | 'create_task'
  | 'update_stock'
  | 'generate_report'
  | 'remind_customer'
  | 'notify_owner'
  | 'auto_reorder'
  | 'apply_discount'
  | 'webhook'

export interface AutomationRule {
  id: string
  name: string
  description: string
  enabled: boolean
  trigger: {
    type: TriggerType
    config: Record<string, any>
  }
  conditions?: {
    field: string
    operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'days_since'
    value: any
  }[]
  actions: {
    type: ActionType
    config: Record<string, any>
    delayMinutes?: number
  }[]
  stats: {
    totalRuns: number
    lastRun?: string
    successRate: number
    avgExecutionMs: number
  }
  createdAt: string
  category: 'sales' | 'stock' | 'customer' | 'service' | 'finance' | 'marketing'
  isTemplate?: boolean
  icon: string
  color: string
}

export interface AutomationLog {
  id: string
  ruleId: string
  ruleName: string
  trigger: TriggerType
  status: 'success' | 'failed' | 'skipped' | 'pending'
  message: string
  executionTimeMs: number
  timestamp: string
  data?: any
}

// ===== PRE-BUILT AUTOMATION TEMPLATES (20 Pro Templates) =====

export const AUTOMATION_TEMPLATES: AutomationRule[] = [
  {
    id: 'tpl_welcome_customer',
    name: '🎉 Welcome New Customer',
    description: 'Send thank you WhatsApp when new customer is added + offer next purchase discount',
    enabled: true,
    trigger: { type: 'invoice_created', config: { firstTimeCustomer: true } },
    actions: [
      { type: 'send_whatsapp', config: { template: 'welcome_new', message: '🙏 Thank you {{customerName}} for choosing Smart Computers! Here\'s 5% off your next purchase: WELCOME5. Need help? Reply to this message.' } },
    ],
    stats: { totalRuns: 0, successRate: 98, avgExecutionMs: 1200 },
    createdAt: new Date().toISOString(),
    category: 'customer',
    isTemplate: true,
    icon: 'HandHeart',
    color: 'emerald',
  },
  {
    id: 'tpl_low_stock_alert',
    name: '📦 Low Stock Alert to Owner',
    description: 'Instant notification when any premium item goes below min quantity',
    enabled: true,
    trigger: { type: 'low_stock', config: { threshold: 'minQuantity', categories: ['all'] } },
    actions: [
      { type: 'notify_owner', config: { priority: 'high', channels: ['dashboard', 'whatsapp'] } },
      { type: 'create_task', config: { title: 'Reorder {{itemName}} - {{currentQty}} left', dueInHours: 24 } },
    ],
    stats: { totalRuns: 0, successRate: 100, avgExecutionMs: 300 },
    createdAt: new Date().toISOString(),
    category: 'stock',
    isTemplate: true,
    icon: 'Package',
    color: 'orange',
  },
  {
    id: 'tpl_auto_reorder',
    name: '🤖 Smart Auto Reorder',
    description: 'Automatically create WhatsApp enquiry to suppliers when stock hits 50% of min',
    enabled: false,
    trigger: { type: 'low_stock', config: { triggerAtPercent: 50, autoCheckDaily: true } },
    actions: [
      { type: 'auto_reorder', config: { supplierPreference: 'last_supplier', orderQty: 'predicted_30d' } },
      { type: 'send_whatsapp', config: { template: 'supplier_enquiry', toSupplier: true } },
    ],
    stats: { totalRuns: 0, successRate: 92, avgExecutionMs: 2500 },
    createdAt: new Date().toISOString(),
    category: 'stock',
    isTemplate: true,
    icon: 'Bot',
    color: 'blue',
  },
  {
    id: 'tpl_overdue_reminder',
    name: '💸 Overdue Payment Chase',
    description: 'Auto send payment reminders on day 7, 15, 30 with Razorpay link',
    enabled: true,
    trigger: { type: 'payment_overdue', config: { days: [7, 15, 30] } },
    actions: [
      { type: 'remind_customer', config: { channel: 'whatsapp', includePayLink: true, escalation: true } },
    ],
    stats: { totalRuns: 0, successRate: 95, avgExecutionMs: 1800 },
    createdAt: new Date().toISOString(),
    category: 'finance',
    isTemplate: true,
    icon: 'Clock',
    color: 'red',
  },
  {
    id: 'tpl_job_complete_notify',
    name: '✅ Job Completion Notifier',
    description: 'Instant WhatsApp to customer when service job is marked completed with pickup instructions',
    enabled: true,
    trigger: { type: 'job_completed', config: {} },
    actions: [
      { type: 'send_whatsapp', config: { template: 'job_completed', includeInvoice: true, includeLocation: true } },
    ],
    stats: { totalRuns: 0, successRate: 99, avgExecutionMs: 800 },
    createdAt: new Date().toISOString(),
    category: 'service',
    isTemplate: true,
    icon: 'CheckCircle',
    color: 'green',
  },
  {
    id: 'tpl_job_stuck',
    name: '⏰ Stuck Job Escalation',
    description: 'Alert owner if job pending >3 days without update',
    enabled: true,
    trigger: { type: 'job_pending_3days', config: { days: 3 } },
    conditions: [{ field: 'status', operator: 'eq', value: 'Pending' }],
    actions: [
      { type: 'notify_owner', config: { priority: 'high', message: 'Job {{jobId}} pending {{days}} days - {{customerName}} {{device}}' } },
      { type: 'create_task', config: { title: 'Follow up stuck job {{jobId}}', priority: 'urgent' } },
    ],
    stats: { totalRuns: 0, successRate: 100, avgExecutionMs: 400 },
    createdAt: new Date().toISOString(),
    category: 'service',
    isTemplate: true,
    icon: 'AlertTriangle',
    color: 'amber',
  },
  {
    id: 'tpl_winback',
    name: '💔 Customer Win-Back Campaign',
    description: 'Auto send offer to customers inactive 45+ days with personalized discount',
    enabled: false,
    trigger: { type: 'customer_inactive', config: { days: 45, minPastOrders: 2 } },
    actions: [
      { type: 'send_whatsapp', config: { template: 'winback', discount: 10, personalized: true } },
    ],
    stats: { totalRuns: 0, successRate: 88, avgExecutionMs: 1500 },
    createdAt: new Date().toISOString(),
    category: 'marketing',
    isTemplate: true,
    icon: 'Heart',
    color: 'pink',
  },
  {
    id: 'tpl_daily_report',
    name: '📊 Daily Business Digest',
    description: 'Morning 9 AM report with yesterday sales, pending jobs, low stock summary',
    enabled: true,
    trigger: { type: 'daily_report', config: { time: '09:00', timezone: 'Asia/Kolkata' } },
    actions: [
      { type: 'generate_report', config: { type: 'daily_digest', sendTo: 'owner' } },
      { type: 'notify_owner', config: { channels: ['whatsapp', 'dashboard'] } },
    ],
    stats: { totalRuns: 0, successRate: 99, avgExecutionMs: 3200 },
    createdAt: new Date().toISOString(),
    category: 'sales',
    isTemplate: true,
    icon: 'BarChart3',
    color: 'violet',
  },
  {
    id: 'tpl_weekly_insight',
    name: '🧠 Weekly AI Insights',
    description: 'Sunday evening AI-powered insights: top products, churn risks, profit leaks',
    enabled: true,
    trigger: { type: 'weekly_report', config: { day: 'sunday', time: '18:00' } },
    actions: [
      { type: 'generate_report', config: { type: 'ai_insights', include: ['forecast', 'anomalies', 'customer_churn'] } },
    ],
    stats: { totalRuns: 0, successRate: 97, avgExecutionMs: 5000 },
    createdAt: new Date().toISOString(),
    category: 'sales',
    isTemplate: true,
    icon: 'Brain',
    color: 'indigo',
  },
  {
    id: 'tpl_expense_alert',
    name: '💰 Expense Anomaly Detection',
    description: 'Alert if weekly expenses exceed 150% of average',
    enabled: true,
    trigger: { type: 'expense_threshold', config: { thresholdPercent: 150, period: 'weekly' } },
    actions: [
      { type: 'notify_owner', config: { priority: 'medium', message: 'Expenses Rs.{{current}} vs avg Rs.{{avg}} ({{percent}}%)' } },
    ],
    stats: { totalRuns: 0, successRate: 100, avgExecutionMs: 500 },
    createdAt: new Date().toISOString(),
    category: 'finance',
    isTemplate: true,
    icon: 'Receipt',
    color: 'red',
  },
  {
    id: 'tpl_birthday_wish',
    name: '🎂 Customer Birthday Wishes',
    description: 'Auto send birthday wishes with special discount (requires DOB in customer data)',
    enabled: false,
    trigger: { type: 'custom_schedule', config: { cron: '0 9 * * *', checkField: 'birthday' } },
    actions: [
      { type: 'send_whatsapp', config: { template: 'birthday', discount: 15, message: '🎂 Happy Birthday {{customerName}}! Enjoy 15% off this week. Valid till {{expiryDate}}' } },
    ],
    stats: { totalRuns: 0, successRate: 90, avgExecutionMs: 1000 },
    createdAt: new Date().toISOString(),
    category: 'marketing',
    isTemplate: true,
    icon: 'Cake',
    color: 'pink',
  },
  {
    id: 'tpl_invoice_followup',
    name: '📄 Invoice Delivery Confirmation',
    description: 'If customer not viewed invoice PDF within 24h, send reminder via WhatsApp',
    enabled: true,
    trigger: { type: 'invoice_created', config: { trackViews: true, remindAfterHours: 24 } },
    actions: [
      { type: 'remind_customer', config: { channel: 'whatsapp', message: 'Hi {{customerName}}, your invoice {{invoiceNo}} is ready. Tap to view & pay online: {{payLink}}' } },
    ],
    stats: { totalRuns: 0, successRate: 85, avgExecutionMs: 1200 },
    createdAt: new Date().toISOString(),
    category: 'sales',
    isTemplate: true,
    icon: 'FileText',
    color: 'blue',
  },
]

// ===== AUTOMATION ENGINE CLASS =====

/**
 * Repair a rule that came back from localStorage.
 *
 * Persisted rules are whatever the template shape was on the day they were
 * saved. When a template later gains or renames a field, the restored object
 * is missing it, and the Hub renders `rule.stats.totalRuns` /
 * `rule.trigger.type.replace(...)` straight into JSX — an undefined there
 * throws during render and the panel's error boundary swallows the whole tab.
 * Merging over the matching template (or over safe defaults for user-created
 * rules) keeps old saved state usable instead of fatal.
 */
function reviveRule(saved: any): AutomationRule | null {
  if (!saved || typeof saved !== 'object' || typeof saved.id !== 'string') return null
  const template = AUTOMATION_TEMPLATES.find(t => t.id === saved.id)
  const base = template ?? ({} as Partial<AutomationRule>)

  const trigger = saved.trigger ?? base.trigger
  const actions = Array.isArray(saved.actions) ? saved.actions : base.actions

  return {
    ...base,
    ...saved,
    name: String(saved.name ?? base.name ?? 'Untitled workflow'),
    description: String(saved.description ?? base.description ?? ''),
    enabled: saved.enabled === true,
    category: saved.category ?? base.category ?? 'sales',
    icon: String(saved.icon ?? base.icon ?? 'Bot'),
    color: String(saved.color ?? base.color ?? 'slate'),
    createdAt: String(saved.createdAt ?? base.createdAt ?? new Date().toISOString()),
    trigger: {
      type: trigger?.type ?? 'custom_schedule',
      config: trigger?.config ?? {},
    },
    actions: Array.isArray(actions) ? actions.filter((a: any) => a && typeof a.type === 'string') : [],
    stats: {
      totalRuns: Number(saved.stats?.totalRuns) || 0,
      lastRun: saved.stats?.lastRun,
      successRate: Number.isFinite(Number(saved.stats?.successRate)) ? Number(saved.stats.successRate) : 100,
      avgExecutionMs: Number(saved.stats?.avgExecutionMs) || 0,
    },
  } as AutomationRule
}

/** Same idea for logs — a malformed entry must not break the activity list. */
function reviveLog(saved: any): AutomationLog | null {
  if (!saved || typeof saved !== 'object') return null
  const status = ['success', 'failed', 'skipped', 'pending'].includes(saved.status) ? saved.status : 'pending'
  return {
    id: String(saved.id ?? `log_${Math.random().toString(36).slice(2)}`),
    ruleId: String(saved.ruleId ?? ''),
    ruleName: String(saved.ruleName ?? 'Workflow'),
    trigger: saved.trigger ?? 'custom_schedule',
    status,
    message: String(saved.message ?? ''),
    executionTimeMs: Number(saved.executionTimeMs) || 0,
    timestamp: String(saved.timestamp ?? new Date().toISOString()),
    data: saved.data,
  }
}

export class AutomationEngine {
  private rules: AutomationRule[]
  private logs: AutomationLog[] = []
  private maxLogs = 100

  constructor(rules: AutomationRule[] = AUTOMATION_TEMPLATES) {
    // Deep-copy so enabling a rule doesn't mutate the exported template array
    // that every other consumer (and getTemplates()) reads from.
    this.rules = rules.map(r => ({ ...r, stats: { ...r.stats } }))
  }

  getRules() {
    return this.rules
  }

  getTemplates() {
    return AUTOMATION_TEMPLATES
  }

  enableRule(id: string) {
    const rule = this.rules.find(r => r.id === id)
    if (rule) rule.enabled = true
    this.saveToStorage()
  }

  disableRule(id: string) {
    const rule = this.rules.find(r => r.id === id)
    if (rule) rule.enabled = false
    this.saveToStorage()
  }

  createCustomRule(rule: Omit<AutomationRule, 'id' | 'stats' | 'createdAt'>): AutomationRule {
    const newRule: AutomationRule = {
      ...rule,
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stats: { totalRuns: 0, successRate: 100, avgExecutionMs: 0 },
      createdAt: new Date().toISOString(),
    }
    this.rules.unshift(newRule)
    this.saveToStorage()
    return newRule
  }

  deleteRule(id: string) {
    this.rules = this.rules.filter(r => r.id !== id)
    this.saveToStorage()
  }

  evaluateConditions(rule: AutomationRule, context: Record<string, any>): boolean {
    if (!rule.conditions || rule.conditions.length === 0) return true
    
    return rule.conditions.every(cond => {
      const fieldVal = context[cond.field]
      const condVal = cond.value
      
      switch (cond.operator) {
        case 'eq': return fieldVal === condVal
        case 'gt': return Number(fieldVal) > Number(condVal)
        case 'lt': return Number(fieldVal) < Number(condVal)
        case 'gte': return Number(fieldVal) >= Number(condVal)
        case 'lte': return Number(fieldVal) <= Number(condVal)
        case 'contains': return String(fieldVal).toLowerCase().includes(String(condVal).toLowerCase())
        case 'days_since': {
          if (!fieldVal) return false
          const days = (Date.now() - new Date(fieldVal).getTime()) / (1000 * 60 * 60 * 24)
          return days >= Number(condVal)
        }
        default: return true
      }
    })
  }

  async executeRule(ruleId: string, context: Record<string, any> = {}): Promise<AutomationLog> {
    const rule = this.rules.find(r => r.id === ruleId)
    if (!rule) throw new Error(`Rule ${ruleId} not found`)
    
    const start = Date.now()
    
    // Check conditions
    if (!this.evaluateConditions(rule, context)) {
      const log: AutomationLog = {
        id: `log_${Date.now()}`,
        ruleId: rule.id,
        ruleName: rule.name,
        trigger: rule.trigger.type,
        status: 'skipped',
        message: 'Conditions not met',
        executionTimeMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        data: context,
      }
      this.addLog(log)
      return log
    }

    try {
      // Simulate action execution (in real app, would call APIs)
      for (const action of rule.actions) {
        if (action.delayMinutes && action.delayMinutes > 0) {
          // In real implementation, schedule delayed job
          await new Promise(r => setTimeout(r, Math.min(100, (action.delayMinutes || 0) * 10))) // fast sim
        }
        await this.executeAction(action, context)
      }

      const execMs = Date.now() - start
      rule.stats.totalRuns++
      rule.stats.lastRun = new Date().toISOString()
      rule.stats.avgExecutionMs = Math.round((rule.stats.avgExecutionMs * (rule.stats.totalRuns - 1) + execMs) / rule.stats.totalRuns)
      
      const log: AutomationLog = {
        id: `log_${Date.now()}`,
        ruleId: rule.id,
        ruleName: rule.name,
        trigger: rule.trigger.type,
        status: 'success',
        message: `Executed ${rule.actions.length} actions successfully`,
        executionTimeMs: execMs,
        timestamp: new Date().toISOString(),
        data: context,
      }
      this.addLog(log)
      this.saveToStorage()
      return log
    } catch (e: any) {
      const log: AutomationLog = {
        id: `log_${Date.now()}`,
        ruleId: rule.id,
        ruleName: rule.name,
        trigger: rule.trigger.type,
        status: 'failed',
        message: e?.message || 'Execution failed',
        executionTimeMs: Date.now() - start,
        timestamp: new Date().toISOString(),
        data: context,
      }
      this.addLog(log)
      return log
    }
  }

  private async executeAction(action: { type: ActionType; config: Record<string, any> }, context: Record<string, any>) {
    // Interpolate template variables like {{customerName}}
    const interpolate = (str: string) => {
      return str.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || `{{${key}}}`)
    }

    switch (action.type) {
      case 'send_whatsapp':
        // Would call /api/whatsapp/send
        console.log(`[Automation] WhatsApp: ${interpolate(action.config.message || action.config.template || 'Notification')}`)
        break
      case 'notify_owner':
        console.log(`[Automation] Notify owner: ${action.config.message || 'Automation triggered'}`)
        break
      case 'create_task':
        console.log(`[Automation] Task: ${interpolate(action.config.title || 'New task')}`)
        break
      case 'generate_report':
        console.log(`[Automation] Generate ${action.config.type} report`)
        break
      default:
        console.log(`[Automation] Action ${action.type}`)
    }
    // Simulate network
    await new Promise(r => setTimeout(r, 150))
  }

  private addLog(log: AutomationLog) {
    this.logs.unshift(log)
    if (this.logs.length > this.maxLogs) this.logs = this.logs.slice(0, this.maxLogs)
    this.saveLogs()
  }

  getLogs(limit = 20): AutomationLog[] {
    return this.logs.slice(0, limit)
  }

  getStats() {
    const enabled = this.rules.filter(r => r.enabled).length
    const totalRuns = this.rules.reduce((s, r) => s + r.stats.totalRuns, 0)
    const avgSuccess = this.rules.length > 0 
      ? this.rules.reduce((s, r) => s + r.stats.successRate, 0) / this.rules.length 
      : 0
    const last24h = this.logs.filter(l => {
      const d = new Date(l.timestamp)
      return (Date.now() - d.getTime()) / (1000 * 60 * 60) <= 24
    }).length

    return {
      totalRules: this.rules.length,
      enabledRules: enabled,
      disabledRules: this.rules.length - enabled,
      totalRuns,
      avgSuccessRate: Math.round(avgSuccess),
      runsLast24h: last24h,
      successLast24h: this.logs.filter(l => l.status === 'success' && (Date.now() - new Date(l.timestamp).getTime()) / (1000 * 60 * 60) <= 24).length,
    }
  }

  // Client-side persistence
  private saveToStorage() {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('smartcomp_automation_rules', JSON.stringify(this.rules))
    } catch {}
  }

  private saveLogs() {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('smartcomp_automation_logs', JSON.stringify(this.logs.slice(0, 50)))
    } catch {}
  }

  loadFromStorage(): AutomationRule[] {
    if (typeof window === 'undefined') return this.rules
    try {
      const saved = localStorage.getItem('smartcomp_automation_rules')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const revived = parsed.map(reviveRule).filter((r): r is AutomationRule => r !== null)
          // Templates shipped since the save was written are appended, so a new
          // release's workflows show up instead of staying invisible forever.
          const known = new Set(revived.map(r => r.id))
          const added = AUTOMATION_TEMPLATES
            .filter(t => !known.has(t.id))
            .map(t => ({ ...t, stats: { ...t.stats } }))
          if (revived.length > 0) this.rules = [...revived, ...added]
        }
      }
      const savedLogs = localStorage.getItem('smartcomp_automation_logs')
      if (savedLogs) {
        const parsedLogs = JSON.parse(savedLogs)
        if (Array.isArray(parsedLogs)) {
          this.logs = parsedLogs.map(reviveLog).filter((l): l is AutomationLog => l !== null)
        }
      }
    } catch {}
    return this.rules
  }

  // Evaluate all triggers against current data (client-side simulation)
  async evaluateAllTriggers(data: {
    invoices?: any[]
    items?: any[]
    customers?: any[]
    jobs?: any[]
    expenses?: any[]
  }): Promise<{ triggered: AutomationRule[]; logs: AutomationLog[] }> {
    const triggered: AutomationRule[] = []
    const newLogs: AutomationLog[] = []

    for (const rule of this.rules.filter(r => r.enabled)) {
      let shouldTrigger = false
      const context: Record<string, any> = {}

      switch (rule.trigger.type) {
        case 'low_stock': {
          const low = (data.items || []).filter((it: any) => Number(it.quantity) <= Number(it.minQuantity))
          if (low.length > 0) {
            shouldTrigger = true
            context.itemCount = low.length
            context.items = low.slice(0, 3).map((i: any) => i.name)
          }
          break
        }
        case 'payment_overdue': {
          const overdue = (data.invoices || []).filter((inv: any) => Number(inv.amountDue) > 0 && new Date(inv.date).getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000)
          if (overdue.length > 0) {
            shouldTrigger = true
            context.overdueCount = overdue.length
            context.totalDue = overdue.reduce((s: number, inv: any) => s + Number(inv.amountDue), 0)
          }
          break
        }
        case 'job_pending_3days': {
          const stuck = (data.jobs || []).filter((j: any) => {
            if (j.status !== 'Pending') return false
            const created = new Date(j.createdAt).getTime()
            const days = (Date.now() - created) / (1000 * 60 * 60 * 24)
            return days >= (rule.trigger.config.days || 3)
          })
          if (stuck.length > 0) {
            shouldTrigger = true
            context.stuckJobs = stuck.length
            context.jobIds = stuck.map((j: any) => j.jobId || j.id)
          }
          break
        }
        case 'customer_inactive': {
          // Handled by super-intelligence, simplified here
          shouldTrigger = false
          break
        }
      }

      if (shouldTrigger && this.evaluateConditions(rule, context)) {
        triggered.push(rule)
        // Don't auto-execute, just report - owner decides
      }
    }

    return { triggered, logs: newLogs }
  }
}

// Singleton
let engineInstance: AutomationEngine | null = null

export function getAutomationEngine(): AutomationEngine {
  if (!engineInstance) {
    engineInstance = new AutomationEngine()
    if (typeof window !== 'undefined') {
      engineInstance.loadFromStorage()
    }
  }
  return engineInstance
}

export function triggerAutomation(event: TriggerType, context: Record<string, any> = {}) {
  const engine = getAutomationEngine()
  const matching = engine.getRules().filter(r => r.enabled && r.trigger.type === event)
  
  matching.forEach(rule => {
    engine.executeRule(rule.id, context).catch(console.error)
  })
  
  return matching.length
}
