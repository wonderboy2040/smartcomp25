import { NextRequest, NextResponse } from 'next/server'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'
import { getOrCreateWallet, POINT_VALUE } from '@/lib/loyalty-points'

/**
 * GET /api/loyalty-points/balance?customerId=xxx
 * Returns the customer's loyalty wallet.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const customerId = url.searchParams.get('customerId')
    if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

    const wallet = await getOrCreateWallet(customerId)
    let history: any[] = []
    try { history = JSON.parse(wallet?.historyJson || '[]') } catch {}

    return NextResponse.json({
      customerId,
      balance: Number(wallet.balance) || 0,
      totalEarned: Number(wallet.totalEarned) || 0,
      totalRedeemed: Number(wallet.totalRedeemed) || 0,
      pointValue: POINT_VALUE,
      history: history.slice(-20).reverse(),
    }, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
