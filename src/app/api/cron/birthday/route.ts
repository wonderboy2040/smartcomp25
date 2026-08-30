import { NextRequest, NextResponse } from 'next/server'
import { listRows, createRow } from '@/lib/sheets-client'
import { sendCustomerNotification } from '@/lib/notifications'
import { cronLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * /api/cron/birthday  (GET and POST)
 *
 * v13 NEW FEATURE: Birthday & Service Anniversary Reminders.
 *
 * Runs daily at 9 AM (suggested). Scans all customers whose `birthday` field
 * matches today's month+day. Sends an auto-greeting via WhatsApp Cloud API
 * (with wa.me fallback if Cloud API unconfigured) that includes a 10% off
 * discount coupon valid for 7 days.
 *
 * v13.1 FIX:
 *  - Timezone: previously used server local time (UTC on Vercel) to
 *    compute today's month+day → greetings fired on the wrong date when
 *    the cron ran near midnight UTC. Now explicitly uses IST (Asia/Kolkata).
 *  - Coupon persistence: previously the coupon was generated and sent but
 *    never stored, so it could never be validated at redemption. Now each
 *    coupon is persisted to the `Coupons` collection with validity window,
 *    making it usable at the point of sale.
 *
 * SECURITY: Same CRON_SECRET / VERCEL_CRON_SECRET scheme.
 */

function verifyCron(req: NextRequest, allowDevBypass: boolean): NextResponse | null {
  const ip = getClientIp(req)
  const check = cronLimiter(ip)
  if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const secrets = [process.env.CRON_SECRET, process.env.VERCEL_CRON_SECRET].filter(Boolean) as string[]
  if (secrets.length === 0) {
    if (process.env.NODE_ENV === 'production' || !allowDevBypass) {
      return NextResponse.json(
        { error: 'No CRON_SECRET or VERCEL_CRON_SECRET configured — cron disabled' },
        { status: 503 },
      )
    }
    console.warn('[cron/birthday] No cron secret set (dev mode) — allowing request')
    return null
  }
  const authHeader = req.headers.get('authorization') || ''
  const ok = secrets.some((s) => authHeader === `Bearer ${s}`)
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}

function generateCouponCode(name: string): string {
  const prefix = String(name || 'BD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'BDAY'
  const random = Math.floor(100 + Math.random() * 900)
  return `${prefix}${random}`
}

// Compute today's date in IST (Asia/Kolkata) regardless of server timezone.
// Vercel runs on UTC, so without this, the cron would fire greetings on the
// wrong date when run near midnight UTC.
function getIstToday(): { month: number; date: number; year: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(new Date())
  const y = Number(parts.find((p) => p.type === 'year')?.value || 0)
  const m = Number(parts.find((p) => p.type === 'month')?.value || 0)
  const d = Number(parts.find((p) => p.type === 'day')?.value || 0)
  return { year: y, month: m, date: d }
}

async function runBirthdayCron() {
  try {
    const [customers, shops] = await Promise.all([
      listRows<any>('Customers').catch(() => []),
      listRows<any>('Shop').catch(() => []),
    ])
    const shop = shops[0] || {}
    const shopName = String(shop.name || 'Smart Computers')
    const shopPhone = String(shop.phone || '')

    const { month: todayMonth, date: todayDate, year: todayYear } = getIstToday()

    let greetingsSent = 0
    let couponsCreated = 0
    let skipped = 0

    for (const c of customers) {
      const bday = String(c.birthday || c.dob || '').trim()
      if (!bday) {
        skipped++
        continue
      }
      // Parse date — accept YYYY-MM-DD or DD/MM or DD-MM
      let bdayMonth = 0
      let bdayDate = 0
      const partsSlash = bday.split('/')
      const partsDash = bday.split('-')
      const parts = partsSlash.length >= 2 ? partsSlash : partsDash
      if (parts.length >= 3) {
        // YYYY-MM-DD
        bdayMonth = parseInt(parts[1])
        bdayDate = parseInt(parts[2])
      } else if (parts.length === 2) {
        // DD/MM or MM-DD
        bdayMonth = parseInt(parts[0])
        bdayDate = parseInt(parts[1])
        // If first part > 12, it's DD/MM
        if (bdayMonth > 12) {
          bdayMonth = parseInt(parts[1])
          bdayDate = parseInt(parts[0])
        }
      }

      if (bdayMonth !== todayMonth || bdayDate !== todayDate) {
        skipped++
        continue
      }

      const phone = String(c.phone || c.whatsapp || '').replace(/\D/g, '')
      if (!phone) {
        skipped++
        continue
      }

      const coupon = generateCouponCode(String(c.name || ''))
      // v13.1: persist the coupon to the `Coupons` collection so the
      // point-of-sale can validate it at redemption. Without this, the
      // generated coupon in the WhatsApp message was unverifiable and the
      // shop had no way to enforce the 10%-off / 7-day validity claim.
      const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      try {
        await createRow('Coupons', {
          id: `bday_${todayYear}_${c.id || phone}`,
          code: coupon,
          customerId: String(c.id || ''),
          customerName: String(c.name || ''),
          customerPhone: phone,
          discountType: 'percent',
          discountValue: 10,
          validFrom: new Date().toISOString(),
          validUntil,
          usedAt: '',
          usedOnInvoiceId: '',
          source: 'birthday-cron',
          createdAt: new Date().toISOString(),
        })
        couponsCreated++
      } catch (e: any) {
        // Coupon persistence is best-effort — don't block the greeting.
        console.warn(`[cron/birthday] Failed to persist coupon ${coupon}:`, e?.message)
      }

      const message = `*${shopName}* 🎂\n\nDear ${c.name || 'Customer'},\n\nWishing you a very Happy Birthday! 🎉🎈\n\nAs a birthday gift, enjoy *10% OFF* on any service or product valid for the next 7 days.\n\n*Coupon Code: ${coupon}*\n\nVisit us or WhatsApp to redeem.\n\nWarm regards,\n${shopName}${shopPhone ? `\n📞 ${shopPhone}` : ''}`

      const result = await sendCustomerNotification(phone, message).catch(() => ({ success: false }))
      if (result?.success) greetingsSent++
    }

    return NextResponse.json({
      success: true,
      message: `Birthday cron complete: ${greetingsSent} greetings sent, ${couponsCreated} coupons created, ${skipped} customers skipped`,
      greetingsSent,
      couponsCreated,
      skipped,
      processedCustomers: customers.length,
      istToday: `${todayYear}-${String(todayMonth).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = verifyCron(req, true)
  if (denied) return denied
  return runBirthdayCron()
}

export async function GET(req: NextRequest) {
  const denied = verifyCron(req, false)
  if (denied) return denied
  return runBirthdayCron()
}
