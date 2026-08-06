import { NextRequest, NextResponse } from 'next/server'
import { listRows, updateRow } from '@/lib/sheets-client'
import { sendCustomerNotification } from '@/lib/notifications'
import { cronLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * POST /api/cron/amc
 * Daily cron — checks AMC contracts expiring in 30 days, sends WhatsApp alert.
 * Also marks expired contracts as 'expired'.
 *
 * On Vercel: declared in vercel.json (auto-injects VERCEL_CRON_SECRET header).
 * On Render: use external cron (cron-job.org) with Authorization: Bearer CRON_SECRET.
 *
 * SECURITY: Either CRON_SECRET or VERCEL_CRON_SECRET must match.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const check = cronLimiter(ip)
  if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const secrets = [process.env.CRON_SECRET, process.env.VERCEL_CRON_SECRET].filter(Boolean) as string[]
  if (secrets.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'No CRON_SECRET or VERCEL_CRON_SECRET configured — cron disabled' },
        { status: 503 }
      )
    }
    console.warn('[cron/amc] No cron secret set (dev mode) — allowing request')
  } else {
    const authHeader = req.headers.get('authorization') || ''
    const ok = secrets.some((s) => authHeader === `Bearer ${s}`)
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const contracts = await listRows<any>('AMCContracts')
    const shops = await listRows<any>('Shop')
    const shop = shops[0] || {}
    const shopName = String(shop.name || 'Smart Computers')

    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    let alertsSent = 0
    let expiredMarked = 0

    for (const c of contracts) {
      if (String(c.status) !== 'active') continue
      const endDate = c.endDate ? new Date(c.endDate) : null
      if (!endDate) continue

      // Mark expired
      if (endDate < now) {
        await updateRow('AMCContracts', String(c.id), { status: 'expired' }).catch(() => {})
        expiredMarked++
        continue
      }

      // Expiring in 30 days — send alert
      if (endDate < in30Days && c.customerPhone) {
        const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        const message = `*${shopName}*\n\nDear ${c.customerName},\n\nYour AMC contract (${c.contractNumber}) is expiring in ${daysLeft} days.\n\nRenew now to continue uninterrupted service coverage.\n\nContact us to renew. Thank you!`

        const result = await sendCustomerNotification(String(c.customerPhone), message)
        if (result.success) alertsSent++
      }
    }

    return NextResponse.json({
      success: true,
      message: `AMC cron complete: ${alertsSent} alerts sent, ${expiredMarked} contracts marked expired`,
      alertsSent,
      expiredMarked,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

// GET is intentionally rejected — cron endpoints must be POST to avoid CSRF.
// (An attacker can craft a <img src="..."> or link the admin might click;
//  they cannot craft a cross-origin POST without CORS pre-flight.)
export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — use POST with Authorization: Bearer <CRON_SECRET>' },
    { status: 405, headers: { Allow: 'POST' } }
  )
}
