import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow, updateRow } from '@/lib/sheets-client'

import { sendCustomerNotification } from '@/lib/notifications'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/campaigns — list all campaigns
 */
export async function GET() {
  try {
    let campaigns = await listRows<any>('Campaigns')
    campaigns.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    return NextResponse.json(campaigns.map((c) => ({
      ...c,
      name: String(c?.name || ''),
      segment: String(c?.segment || ''),
      message: String(c?.message || ''),
      status: String(c?.status || 'draft'),
      totalRecipients: Number(c?.totalRecipients) || 0,
      sentCount: Number(c?.sentCount) || 0,
      deliveredCount: Number(c?.deliveredCount) || 0,
      readCount: Number(c?.readCount) || 0,
    })))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

/**
 * POST /api/campaigns — create + send campaign
 * Body: { name, segment, message, action: 'create' | 'send' }
 *
 * Segments:
 *   - all: all customers with phone
 *   - recent: customers with invoice in last 3 months
 *   - inactive: customers with no invoice in 6+ months
 *   - outstanding: customers with creditBalance > 0
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited — too many writes, wait a moment' }, { status: 429 })

    const body = await req.json()
    const action = body.action || 'create'

    if (action === 'create') {
      const campaign = await createRow('Campaigns', {
        name: String(body.name || ''),
        segment: String(body.segment || 'all'),
        segmentDataJson: '[]',
        message: String(body.message || ''),
        status: 'draft',
        totalRecipients: 0,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        scheduledAt: body.scheduledAt || '',
        sentAt: '',
      })
      return NextResponse.json(campaign)
    }

    if (action === 'send') {
      const campaignId = String(body.campaignId || '')
      const campaigns = await listRows<any>('Campaigns')
      const campaign = campaigns.find((c) => String(c.id) === campaignId)
      if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

      // Build recipient list based on segment
      const customers = await listRows<any>('Customers')
      const invoices = await listRows<any>('Invoices')
      const now = Date.now()
      const threeMonthsAgo = now - 90 * 24 * 60 * 60 * 1000
      const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000

      let recipients: any[] = []
      const segment = String(campaign.segment || 'all')

      if (segment === 'all') {
        recipients = customers.filter((c) => c.phone)
      } else if (segment === 'recent') {
        const recentCustomerIds = new Set(
          invoices
            .filter((inv) => inv.date && new Date(inv.date).getTime() > threeMonthsAgo)
            .map((inv) => String(inv.customerId))
            .filter(Boolean)
        )
        recipients = customers.filter((c) => c.phone && recentCustomerIds.has(String(c.id)))
      } else if (segment === 'inactive') {
        const recentCustomerIds = new Set(
          invoices
            .filter((inv) => inv.date && new Date(inv.date).getTime() > sixMonthsAgo)
            .map((inv) => String(inv.customerId))
            .filter(Boolean)
        )
        recipients = customers.filter((c) => c.phone && !recentCustomerIds.has(String(c.id)))
      } else if (segment === 'outstanding') {
        recipients = customers.filter((c) => c.phone && Number(c.creditBalance) > 0)
      } else if (segment === 'custom') {
        // body.recipientIds = array of customer IDs
        const ids = new Set((body.recipientIds || []).map(String))
        recipients = customers.filter((c) => c.phone && ids.has(String(c.id)))
      }

      const message = String(campaign.message || '')
      const shop = (await listRows<any>('Shop'))[0] || {}
      const shopName = String(shop.name || 'Smart Computers')

      // Personalize message: replace {name} with customer name
      let sentCount = 0
      let sentViaCloud = 0
      let sentViaWaMe = 0
      const links: string[] = []

      for (const c of recipients) {
        const personalized = message
          .replace(/\{name\}/gi, String(c.name || 'Customer'))
          .replace(/\{shop\}/gi, shopName)

        const result = await sendCustomerNotification(String(c.phone), personalized)
        if (result.success) {
          sentCount++
          if (result.method === 'cloud-api') sentViaCloud++
          else if (result.method === 'wa.me-link') {
            sentViaWaMe++
            if (links.length < 20) links.push(result.link || '') // keep first 20 links
          }
        }
        // Rate limit: 1 message per 3 seconds (avoid WhatsApp ban)
        await new Promise((r) => setTimeout(r, 3000))
      }

      // Update campaign
      await updateRow('Campaigns', campaignId, {
        status: sentViaWaMe > 0 && sentViaCloud === 0 ? 'sent-manual' : 'sent',
        totalRecipients: recipients.length,
        sentCount,
        sentAt: new Date().toISOString(),
      })

      return NextResponse.json({
        success: true,
        totalRecipients: recipients.length,
        sentCount,
        sentViaCloud,
        sentViaWaMe,
        links: sentViaWaMe > 0 ? links : undefined,
        message: sentViaWaMe > 0
          ? `${sentCount} messages generated. Open each link to send manually.`
          : `${sentCount} messages sent automatically.`,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
