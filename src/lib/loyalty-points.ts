/**
 * v13 NEW: Loyalty Points helpers.
 *
 * Moved out of /api/loyalty-points/balance/route.ts because Next.js route
 * files can ONLY export HTTP verbs (GET/POST/etc) — any other export
 * breaks the build.
 *
 * 1 point per Rs. 100 spent, 1 point = Re. 1.
 *
 * v13.1 FIX: All balance mutations now run inside Firestore transactions
 * to prevent read-modify-write races. Previously, two concurrent
 * award/redeem calls for the same customer would both read the same
 * balance, both write back, and the second write would silently lose the
 * first's points (or worse: double-spend on a redeem). Transactions
 * guarantee atomicity even under concurrent requests.
 */

import { getRow, createRow, updateRow } from '@/lib/sheets-client'
import { getDb } from '@/lib/firebase'

export const POINTS_PER_RUPEE = 1 / 100 // 1 point per Rs. 100
export const POINT_VALUE = 1 // 1 point = Rs. 1

export function roundPoints(n: number): number {
  return Math.floor(n) // never round up
}

export async function getOrCreateWallet(customerId: string) {
  const existing = await getRow<any>('LoyaltyPoints', customerId).catch(() => null)
  if (existing) return existing
  return await createRow('LoyaltyPoints', {
    id: customerId,
    customerId,
    balance: 0,
    totalEarned: 0,
    totalRedeemed: 0,
    historyJson: '[]',
    createdAt: new Date().toISOString(),
  })
}

/**
 * Award points for a purchase. Atomic via Firestore transaction.
 *
 * Returns the updated wallet, or null if no points were awarded.
 */
export async function awardPoints(
  customerId: string,
  amount: number,
  invoiceId: string,
  invoiceNumber: string,
): Promise<any | null> {
  if (!customerId || amount <= 0) return null
  // Ensure wallet exists first (createRow is idempotent if a doc with this id
  // already exists — Firestore will reject the second create, but our caller
  // path uses getRow first which handles this).
  await getOrCreateWallet(customerId)

  const earned = roundPoints(amount * POINTS_PER_RUPEE)
  if (earned <= 0) return await getRow<any>('LoyaltyPoints', customerId)

  const db = await getDb()
  if (!db) throw new Error('Firebase not initialized')

  // v13.1: transaction prevents the read-modify-write race.
  const ref = db.collection('LoyaltyPoints').doc(customerId)
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.data() || {}
    const balance = Number(data.balance) || 0
    const totalEarned = Number(data.totalEarned) || 0
    let history: any[] = []
    try { history = JSON.parse(data.historyJson || '[]') } catch {}
    history.push({
      date: new Date().toISOString(),
      type: 'earn',
      points: earned,
      reason: `Purchase ${invoiceNumber}`,
      reference: invoiceId,
    })
    tx.update(ref, {
      balance: balance + earned,
      totalEarned: totalEarned + earned,
      historyJson: JSON.stringify(history.slice(-100)),
      updatedAt: new Date().toISOString(),
    })
    return {
      ...data,
      balance: balance + earned,
      totalEarned: totalEarned + earned,
      historyJson: JSON.stringify(history.slice(-100)),
    }
  })
  return result
}

/**
 * Redeem points atomically. Returns the new balance, or throws if insufficient.
 *
 * Transaction guarantees that a concurrent redeem cannot double-spend:
 * both transactions read the same balance, the first writes a lower
 * balance, the second's snapshot is now stale so Firestore auto-retries
 * with the fresh value — and on retry the balance check fails correctly.
 */
export async function redeemPoints(
  customerId: string,
  pointsToRedeem: number,
  invoiceId: string,
  invoiceNumber: string,
): Promise<{ redeemed: number; discountAmount: number; newBalance: number }> {
  const points = Math.floor(Number(pointsToRedeem) || 0)
  if (points <= 0) throw new Error('pointsToRedeem must be > 0')

  // Ensure wallet exists (do this outside the transaction — createRow is
  // idempotent-ish and we don't want a long-running transaction for the
  // initial creation).
  await getOrCreateWallet(customerId)

  const db = await getDb()
  if (!db) throw new Error('Firebase not initialized')

  const ref = db.collection('LoyaltyPoints').doc(customerId)
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.data() || {}
    const balance = Number(data.balance) || 0
    const totalRedeemed = Number(data.totalRedeemed) || 0

    if (points > balance) {
      throw new Error(`Insufficient balance — have ${balance} points, need ${points}`)
    }

    let history: any[] = []
    try { history = JSON.parse(data.historyJson || '[]') } catch {}
    history.push({
      date: new Date().toISOString(),
      type: 'redeem',
      points: -points,
      reason: `Redeemed for ${invoiceNumber ? 'invoice ' + invoiceNumber : 'discount'}`,
      reference: invoiceId || '',
      discountAmount: points * POINT_VALUE,
    })

    tx.update(ref, {
      balance: balance - points,
      totalRedeemed: totalRedeemed + points,
      historyJson: JSON.stringify(history.slice(-100)),
      updatedAt: new Date().toISOString(),
    })

    return {
      redeemed: points,
      discountAmount: points * POINT_VALUE,
      newBalance: balance - points,
    }
  })
  return result
}
