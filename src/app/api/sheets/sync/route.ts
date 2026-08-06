import { NextRequest, NextResponse } from 'next/server'
import { isConfigured, testConnection, listRows, getAllDataQuantum } from '@/lib/sheets-client'
import { isFirebaseMode } from '@/lib/runtime-config'

// Quantum Sync Endpoint - supports getAllData single-call (like index.html PWA)
// and liveSync with hash, plus legacy status check.
//
// In Firebase mode, "liveSync" is a no-op (the cache + 5s quantum mem cache
// already keep reads fresh). The endpoint still returns the same shape so
// the PWA / Settings panel doesn't break.

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
        lastSyncMessage: 'Not configured',
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
                'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
                'X-Quantum': 'getAllData',
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
      backend: isFirebaseMode() ? 'firestore' : 'apps-script',
      lastSync: enabled ? new Date().toISOString() : null,
      lastSyncStatus: enabled ? 'success' : null,
      lastSyncMessage: enabled
        ? isFirebaseMode()
          ? 'Firebase mode — Firestore is the source of truth. Cache + 5s quantum mem cache keep reads fresh.'
          : 'Quantum Sync Ready - getAllData + liveSync enabled (legacy Apps Script mode)'
        : null,
      quantum: true,
      version: '6.0',
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

    // Quantum liveSync handling — in Firebase mode this is a no-op ack.
    // (Firestore is the source of truth; the cache invalidation logic in
    // sheets-client.ts already handles cross-device consistency via the
    // 60s TTL + debounced background reconcile.)
    if (action === 'liveSync') {
      if (!isConfigured()) {
        return NextResponse.json({ success: false, error: 'Not configured' }, { status: 400 })
      }

      // In Firebase mode, return a no-op success so the PWA's liveSync loop
      // doesn't break. The PWA can still call getAllData to refresh its view.
      if (isFirebaseMode()) {
        return NextResponse.json({
          success: true,
          status: 'success',
          data: { timestamp: new Date().toISOString(), merged: 0, conflicts: 0 },
          quantum: true,
          backend: 'firestore',
          message: 'liveSync is a no-op in Firebase mode. Use ?action=getAllData to refresh.',
        })
      }

      // Legacy mode: forward to Apps Script
      try {
        const { getAppsScriptUrl, getAppPin } = await import('@/lib/runtime-config')
        const appsUrl = getAppsScriptUrl()
        if (!appsUrl) throw new Error('Not configured')
        const pin = getAppPin()
        const payload: any = { ...body }
        if (pin) payload.pin = pin

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 4000)

        const res = await fetch(appsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        const text = await res.text()
        try {
          const parsed = JSON.parse(text)
          return NextResponse.json(parsed, { headers: { 'X-Quantum': 'liveSync' } })
        } catch {
          return NextResponse.json({
            success: true,
            status: 'success',
            data: { timestamp: new Date().toISOString() },
            quantum: true,
          })
        }
      } catch (e: any) {
        return NextResponse.json(
          { success: false, error: e?.message, quantum: true, offline: true },
          { status: 200 }
        )
      }
    }

    // Default: test connection
    const result = await testConnection()
    return NextResponse.json({ ...result, quantum: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message, quantum: true }, { status: 500 })
  }
}
