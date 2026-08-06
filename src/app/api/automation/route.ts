import { NextRequest, NextResponse } from 'next/server'
import { AUTOMATION_TEMPLATES } from '@/lib/automation-engine'

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
        note: 'Client-side engine handles real execution. This API is for logging / validation.',
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

    return NextResponse.json({ error: 'Invalid action, use execute or validate' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
