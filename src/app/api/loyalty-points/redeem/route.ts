import { NextRequest, NextResponse } from 'next/server'
import { writeLimiter, getClientIp } from '@/lib/rate-limit'
import { redeemPoints, POINT_VALUE } from '@/lib/loyalty-points'

/**
 * POST /api/loyalty-points/redeem
 *
 * v13 NEW: Redeem loyalty points for a discount on an invoice.
 *
 * Body: { customerId, pointsToRedeem, invoiceId?, invoiceNumber? }
 *
 * Returns: { success, redeemedPoints, discountAmount, newBalance }
 *
 * The shop owner applies the discount manually in DocForm (since invoice
 * creation happens elsewhere). This endpoint just deducts points from the
 * wallet and logs the redemption.
 *
 * Point value: 1 point = Rs. 1 (configurable in the future).
 *
 * v13.1 FIX: Now uses an atomic Firestore transaction (see redeemPoints in
 * @/lib/loyalty-points) — previously the read-modify-write was racy and
 * two concurrent redeems could double-spend the wallet.
 */

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = writeLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const body = await req.json()
    const { customerId, pointsToRedeem, invoiceId, invoiceNumber } = body

    if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

    const result = await redeemPoints(
      String(customerId),
      Number(pointsToRedeem) || 0,
      String(invoiceId || ''),
      String(invoiceNumber || ''),
    ).catch((e: any) => {
      // Specific business-logic error (e.g. insufficient balance) → 400
      if (e?.message?.includes('Insufficient')) {
        return { __error: e.message, status: 400 }
      }
      // Unexpected error → 500
      return { __error: e?.message || 'Redeem failed', status: 500 }
    })

    if (result && typeof result === 'object' && '__error' in result) {
      return NextResponse.json({ error: result.__error }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      redeemedPoints: (result as any).redeemed,
      discountAmount: (result as any).discountAmount,
      newBalance: (result as any).newBalance,
      pointValue: POINT_VALUE,
      message: `Redeemed ${(result as any).redeemed} points for Rs. ${(result as any).discountAmount} discount`,
    }, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
