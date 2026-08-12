import { NextResponse } from 'next/server'
import { testConnection, getConfiguredUrlPreview } from '@/lib/sheets-client'
import { getAppPin, isFirebaseMode } from '@/lib/runtime-config'

// GET - backend status (Firebase)
export async function GET() {
  const urlInfo = getConfiguredUrlPreview()
  const firebaseMode = isFirebaseMode()
  return NextResponse.json({
    message: firebaseMode
      ? 'Backend: Firebase Firestore (in-process SDK, ultra fast). Configured via FIREBASE_* env vars.'
      : 'Backend: Firebase Firestore. Not configured yet — set FIREBASE_* env vars.',
    backend: 'firestore',
    urlPreview: urlInfo.urlPreview,
    urlConfigured: urlInfo.configured,
    urlEndsWithExec: urlInfo.endsWithExec,
    runtimeConfigActive: !!process.env.SMARTCOMP_CONFIG_PATH,
    pinRequired: !!getAppPin(),
  })
}

// POST - test connection
export async function POST() {
  const result = await testConnection()
  return NextResponse.json(result)
}