import { NextRequest, NextResponse } from 'next/server'
import { AUTOMATION_TEMPLATES } from '@/lib/automation-engine'
import { listRows, isConfigured } from '@/lib/sheets-client'
import { sendCustomerNotification } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const type = url.searchParams.get('type') || 'templates'

  if (type === 'templates') {
    return NextResponse.json({
      templates: AUTOMATION_TEMPLATES,
      total: AUTOMATION_TEMPLATES.length,
      categories: [...new Set(AUTOMATION_TEMPLATES.map(t => t.category))],
      meta: {
        version: '7.0 PRO Automation Hub',
        engine: 'No-code workflow • 12 templates • Zero API cost',
      }
    })
  }

  if (type === 'stats') {
    const stats = {
      totalTemplates: AUTOMATION_TEMPLATES.length,
      byCategory: AUTOMATION_TEMPLATES.reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      enabledByDefault: AUTOMATION_TEMPLATES.filter(t => t.enabled).length,
      estimatedTimeSavedPerWeek: '10+ hours',
      features: [
        'Welcome new customer',
        'Low stock alerts',
        'Auto reorder',
        'Overdue payment chase',
        'Job completion notifier',
        'Stuck job escalation',
        'Win-back campaign',
        'Daily business digest',
        'Weekly AI insights',
        'Expense anomaly',
        'Birthday wishes',
        'Invoice follow-up',
      ]
    }
    return NextResponse.json(stats)
  }

  return NextResponse.json({ error: 'Invalid type, use ?type=templates or ?type=stats' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, ruleId, context } = body

    // ===== REAL ACTION EXECUTION =====
    // The client-side engine (src/lib/automation-engine.ts) calls these to do
    // actual work. WhatsApp sending and outbound webhooks run server-side so
    // credentials stay off the client and webhooks are not blocked by CORS.

    if (action === 'notify' || action === 'notifyOwner') {
      if (!isConfigured()) {
        return NextResponse.json({ error: 'Firebase not configured' }, { status: 503 })
      }
      const message = String(body.message || '').trim()
      if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

      let phone = String(body.phone || '').trim()
      if (action === 'notifyOwner') {
        const shopRows = await listRows<any>('Shop', { useCache: true })
        const shop = shopRows[0] || {}
        phone = String(shop.whatsappNumber || shop.phone || '').trim()
        if (!phone) {
          return NextResponse.json(
            { error: 'Owner phone not set — add a phone / WhatsApp number in Settings → Shop' },
            { status: 400 }
          )
        }
      }
      if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

      const result = await sendCustomerNotification(phone, message)
      return NextResponse.json({
        success: result.success,
        method: result.method,
        link: result.link,
        error: result.error,
      })
    }

    if (action === 'webhook') {
      const url = String(body.url || '').trim()
      if (!/^https:\/\//i.test(url)) {
        return NextResponse.json({ error: 'webhook url must be https' }, { status: 400 })
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body.payload ?? {}),
          signal: controller.signal,
        })
        return NextResponse.json({ success: res.ok, status: res.status })
      } catch (e: any) {
        return NextResponse.json(
          { success: false, error: e?.name === 'AbortError' ? 'Webhook timed out' : e?.message },
          { status: 502 }
        )
      } finally {
        clearTimeout(timer)
      }
    }

    if (action === 'execute') {
      if (!ruleId) return NextResponse.json({ error: 'ruleId required' }, { status: 400 })

      const template = AUTOMATION_TEMPLATES.find(t => t.id === ruleId)
      if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

      // Simulate execution
      return NextResponse.json({
        success: true,
        ruleId,
        ruleName: template.name,
        message: `Executed ${template.actions.length} actions for ${template.trigger.type}`,
        executionTimeMs: Math.floor(Math.random() * 1000) + 300,
        timestamp: new Date().toISOString(),
        actions: template.actions,
        context: context || {},
        simulated: true,
        note: 'Dry run only — validates the rule shape. Real execution happens via the client engine, which calls action=notify / notifyOwner / webhook on this route.',
      })
    }

    if (action === 'validate') {
      // Validate custom rule
      const { trigger, conditions, actions } = body
      if (!trigger || !actions) {
        return NextResponse.json({ valid: false, error: 'trigger and actions required' }, { status: 400 })
      }
      return NextResponse.json({
        valid: true,
        message: 'Rule valid',
        trigger,
        conditions: conditions || [],
        actions,
      })
    }

    return NextResponse.json(
      { error: 'Invalid action — use notify, notifyOwner, webhook, execute or validate' },
      { status: 400 }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
