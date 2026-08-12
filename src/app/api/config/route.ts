import { NextRequest, NextResponse } from 'next/server'
import { isConfigured, testConnection } from '@/lib/sheets-client'
import {
  getAppPin,
  isFirebaseMode,
  clearRuntimeConfigCache,
} from '@/lib/runtime-config'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

// GET /api/config - check if app is configured (for setup wizard)
export async function GET() {
  const firebaseMode = isFirebaseMode()
  return NextResponse.json({
    configured: isConfigured(),
    backend: 'firestore',
    firebaseConfigured: firebaseMode,
    pinRequired: !!getAppPin(),
    urlPreview: firebaseMode ? 'firestore (in-process SDK)' : null,
    endsWithExec: firebaseMode,
    // Desktop-mode flag so the Settings panel can show a "Change Firebase credentials" UI
    runtimeConfigActive: !!process.env.SMARTCOMP_CONFIG_PATH,
  })
}

// POST /api/config - test connection OR save runtime config (desktop mode)
export async function POST(req: NextRequest) {
  const configPath = process.env.SMARTCOMP_CONFIG_PATH
  let body: any = null
  try {
    body = await req.json().catch(() => null)
  } catch {}

  // Desktop-mode save: persist Firebase credentials to the runtime config file
  if (configPath && body && (body.firebaseServiceAccountBase64 !== undefined || body.appPin !== undefined)) {
    try {
      const dir = dirname(configPath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

      const existing: any = existsSync(configPath)
        ? JSON.parse(readFileSync(configPath, 'utf-8'))
        : {}

      if (typeof body.appPin === 'string') {
        existing.appPin = body.appPin.trim() || undefined
      }
      if (typeof body.firebaseServiceAccountBase64 === 'string') {
        existing.firebaseServiceAccountBase64 = body.firebaseServiceAccountBase64.trim() || undefined
      }

      writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8')
      clearRuntimeConfigCache()

      return NextResponse.json({
        success: true,
        message: 'Firebase credentials saved. All devices using this backend will see the changes immediately.',
        configured: isConfigured(),
      })
    } catch (e: any) {
      return NextResponse.json({ success: false, message: e?.message || 'Failed to save config' }, { status: 500 })
    }
  }

  // Default: test connection
  const result = await testConnection()
  return NextResponse.json(result)
}
