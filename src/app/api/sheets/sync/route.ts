import { NextRequest, NextResponse } from 'next/server'
import { isConfigured, testConnection, listRows, getAllDataQuantum } from '@/lib/sheets-client'

// Quantum Sync Endpoint — Firebase Firestore only (v11.5).
//
// The cache + 5s quantum mem cache in sheets-client already keep reads
// fresh. This endpoint returns the same response shape as v10 so the PWA
// / Settings panel doesn't break, but it no longer falls back to Apps
// Script (that path has been removed entirely).

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    const enabled = isConfigured()

    if (!enabled) {
      return NextResponse.json({
        enabled: false,
        lastSync: null,
        lastSyncStatus: null,
        lastSyncMessage: 'Firebase not configured',
      })
    }

    // Quantum: getAllData single call
    if (action === 'getAllData') {
      try {
        const data = await getAllDataQuantum()
        if (data) {
          return NextResponse.json(
            {
              success: true,
              status: 'success',
              data,
              quantum: true,
              cached: false,
              timestamp: new Date().toISOString(),
            },
            {
              headers: {
                'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
                'X-Quantum': 'getAllData',
                'X-Backend': 'firestore',
              },
            }
          )
        }
        // Fallback to manual batch if quantum fails
        const [jobs, items, payments, customers, shopRows] = await Promise.all([
          listRows<any>('Jobs').catch(() => []),
          listRows<any>('Items').catch(() => []),
          listRows<any>('ServicePayments').catch(() => []),
          listRows<any>('Customers').catch(() => []),
          listRows<any>('Shop').catch(() => []),
        ])
        return NextResponse.json({
          success: true,
          status: 'success',
          data: {
            jobs,
            spareParts: items,
            items,
            payments,
            servicePayments: payments,
            customers,
            shop: shopRows[0] || null,
            timestamp: new Date().toISOString(),
          },
          quantum: true,
          fallback: true,
        })
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message, quantum: true }, { status: 500 })
      }
    }

    // Default status check (no heavy reads)
    return NextResponse.json({
      enabled,
      backend: 'firestore',
      lastSync: enabled ? new Date().toISOString() : null,
      lastSyncStatus: enabled ? 'success' : null,
      lastSyncMessage: enabled
        ? 'Firebase mode — Firestore is the source of truth. Cache + 5s quantum mem cache keep reads fresh.'
        : null,
      quantum: true,
      version: '11.5',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const actionParam = url.searchParams.get('action')

    let body: any = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const action = body.action || actionParam

    // liveSync — in Firebase mode this is a no-op ack. Firestore is the
    // source of truth; the cache invalidation logic in sheets-client.ts
    // already handles cross-device consistency via the 60s TTL + debounced
    // background reconcile.
    if (action === 'liveSync') {
      if (!isConfigured()) {
        return NextResponse.json({ success: false, error: 'Firebase not configured' }, { status: 400 })
      }
      return NextResponse.json({
        success: true,
        status: 'success',
        data: { timestamp: new Date().toISOString(), merged: 0, conflicts: 0 },
        quantum: true,
        backend: 'firestore',
        message: 'liveSync is a no-op in Firebase mode. Use ?action=getAllData to refresh.',
      })
    }

    // Default: test connection
    const result = await testConnection()
    return NextResponse.json({ ...result, quantum: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message, quantum: true }, { status: 500 })
  }
}
