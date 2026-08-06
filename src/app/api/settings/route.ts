import { NextResponse } from 'next/server'
import { testConnection, getConfiguredUrlPreview } from '@/lib/sheets-client'
import { getAppPin, isFirebaseMode } from '@/lib/runtime-config'

// GET - backend status (Firebase preferred, Apps Script legacy)
export async function GET() {
  const urlInfo = getConfiguredUrlPreview()
  const firebaseMode = isFirebaseMode()
  return NextResponse.json({
    message: firebaseMode
      ? 'Backend: Firebase Firestore (in-process SDK, ultra fast). Configured via FIREBASE_* env vars.'
      : 'Backend: Google Sheets sync via APPS_SCRIPT_URL env var (legacy mode). Migrate to Firebase for ~50x faster reads.',
    backend: firebaseMode ? 'firestore' : 'apps-script',
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
