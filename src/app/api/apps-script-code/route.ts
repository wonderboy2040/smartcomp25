import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/apps-script-code
 *
 * DEPRECATED in v10.0.1 — the app now uses Firebase Firestore by default.
 *
 * This endpoint previously returned the contents of apps-script/code.gs so
 * users could redeploy the Apps Script backend. With Firebase mode, no Apps
 * Script is needed at all — Firestore is called directly from the Next.js
 * server via the firebase-admin SDK.
 *
 * Behavior:
 *   - If the app is in Firebase mode: returns a friendly deprecation notice
 *     explaining that no Apps Script code is needed.
 *   - If the app is in legacy Apps Script mode (FIREBASE_* not set,
 *     APPS_SCRIPT_URL set): returns the code.gs content as before, so users
 *     who haven't migrated yet can still grab the latest code.
 */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get('format') || 'text'

  // Detect mode without importing the lib (keeps this route lightweight).
  const firebaseMode =
    !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
    (!!process.env.FIREBASE_PROJECT_ID && !!process.env.FIREBASE_CLIENT_EMAIL && !!process.env.FIREBASE_PRIVATE_KEY)

  if (firebaseMode) {
    const message = `/**
 * SmartComp v10.0.1 — Firebase mode active.
 *
 * No Apps Script code is needed. This app talks to Firebase Firestore
 * directly via the firebase-admin SDK (in-process, no HTTP round-trips).
 *
 * What to do with the old apps-script/code.gs:
 *   1. Keep it as a backup (do NOT delete the Apps Script project yet).
 *   2. (Optional) Run scripts/migrate-sheets-to-firestore.js once to copy
 *      your existing Google Sheets data into Firestore.
 *   3. Once you've verified everything works on Render, you can delete the
 *      Apps Script project from script.google.com — it's no longer used.
 *
 * Why Firebase is faster:
 *   - Apps Script cold start: 6-8s per request
 *   - Firebase Firestore: <100ms typical read, <200ms typical write
 *   - Free tier: 50K reads/day, 20K writes/day, 20K deletes/day, 1 GiB storage
 */
`
    if (format === 'json') {
      return NextResponse.json({
        success: true,
        version: '10.0.1',
        mode: 'firebase',
        deprecated: true,
        size: message.length,
        content: message,
      })
    }
    return new NextResponse(message, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Mode': 'firebase',
      },
    })
  }

  // Legacy mode: still serve code.gs so users who haven't migrated yet
  // can copy the latest Apps Script code.
  try {
    const { readFile } = await import('fs/promises')
    const path = await import('path')
    const filePath = path.join(process.cwd(), 'apps-script', 'code.gs')
    const content = await readFile(filePath, 'utf8')

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        version: '5.0',
        mode: 'apps-script',
        filename: 'code.gs',
        size: content.length,
        content,
        deprecationHint: 'Consider migrating to Firebase. See README → Firebase Setup.',
      })
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Mode': 'apps-script',
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'Could not read apps-script/code.gs from disk: ' + (e?.message || 'unknown error'),
      },
      { status: 500 }
    )
  }
}
