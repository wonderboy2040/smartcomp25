import { NextResponse } from 'next/server'

/**
 * GET /api/poster/debug
 *
 * Diagnostic endpoint that tests whether the Render server can reach the
 * ZAI image generation API at all. Returns the full HTTP response details
 * so we can see EXACTLY what's failing — DNS resolution, TCP connect,
 * TLS handshake, HTTP status, response body, etc.
 *
 * This endpoint is intentionally PUBLIC (no PIN) so it can be hit from a
 * browser for quick debugging.
 */

export async function GET() {
  const baseUrl = process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1'
  const apiKey = process.env.ZAI_API_KEY
  const token = process.env.ZAI_TOKEN
  const userId = process.env.ZAI_USER_ID
  const chatId = process.env.ZAI_CHAT_ID

  const envStatus = {
    ZAI_BASE_URL_set: !!baseUrl,
    ZAI_API_KEY_set: !!apiKey,
    ZAI_TOKEN_set: !!token,
    ZAI_USER_ID_set: !!userId,
    ZAI_CHAT_ID_set: !!chatId,
    ZAI_BASE_URL_value: baseUrl,
  }

  // Test 1: DNS resolution + TCP connect to the host
  let dnsTest: any = { step: 'DNS + TCP connect', target: baseUrl }
  const urlObj = new URL(baseUrl)
  const host = urlObj.hostname
  try {
    const dns = await import('dns').then((m) => m.promises)
    const addresses = await dns.resolve4(host)
    dnsTest.success = true
    dnsTest.addresses = addresses
  } catch (e: any) {
    dnsTest.success = false
    dnsTest.error = e?.message
    dnsTest.code = e?.code
  }

  // Test 2: Simple HEAD/GET request to the host root (no auth, just connectivity)
  let connectivityTest: any = { step: 'Bare fetch to baseUrl', target: baseUrl }
  try {
    const startMs = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort('timeout'), 15000)
    const res = await fetch(baseUrl, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    connectivityTest.success = true
    connectivityTest.status = res.status
    connectivityTest.statusText = res.statusText
    connectivityTest.elapsedMs = Date.now() - startMs
    connectivityTest.contentType = res.headers.get('content-type')
    // Read first 500 chars of body
    const text = await res.text().catch(() => '<no body>')
    connectivityTest.bodyPreview = text.slice(0, 300)
  } catch (e: any) {
    connectivityTest.success = false
    connectivityTest.errorName = e?.name
    connectivityTest.errorMessage = e?.message
    connectivityTest.errorCause = e?.cause?.message || e?.cause?.code
  }

  // Test 3: If env vars are set, attempt the actual /images/generations endpoint
  // with a tiny prompt. This is the real test — does the API accept our auth?
  let apiTest: any = { step: 'POST /images/generations (minimal test)', skipped: true }
  if (apiKey && token) {
    apiTest = { step: 'POST /images/generations (minimal test)', target: `${baseUrl}/images/generations` }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Z-AI-From': 'Z',
    }
    if (chatId) headers['X-Chat-Id'] = chatId
    if (userId) headers['X-User-Id'] = userId
    if (token) headers['X-Token'] = token

    try {
      const startMs = Date.now()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort('timeout'), 60000)
      const res = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: 'a solid blue square',
          size: '1024x1024',
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      apiTest.success = res.ok
      apiTest.status = res.status
      apiTest.statusText = res.statusText
      apiTest.elapsedMs = Date.now() - startMs
      apiTest.contentType = res.headers.get('content-type')
      const text = await res.text().catch(() => '<no body>')
      apiTest.bodyPreview = text.slice(0, 500)
      apiTest.bodyLength = text.length
    } catch (e: any) {
      apiTest.success = false
      apiTest.errorName = e?.name
      apiTest.errorMessage = e?.message
      apiTest.errorCause = e?.cause?.message || e?.cause?.code
    }
  }

  // Final diagnosis
  let diagnosis = 'Unknown — review the test results above.'
  if (!envStatus.ZAI_API_KEY_set) {
    diagnosis = '❌ ZAI_API_KEY env var is NOT set on Render. Set the 5 ZAI_* env vars (see .z-ai-config.example).'
  } else if (!dnsTest.success) {
    diagnosis = `❌ DNS resolution failed for ${host}: ${dnsTest.error}. Render cannot resolve the ZAI API hostname — this is a Render networking issue, not a code issue.`
  } else if (!connectivityTest.success) {
    diagnosis = `❌ Cannot reach ${baseUrl}: ${connectivityTest.errorMessage}. Render's network cannot connect to ZAI's servers.`
  } else if (apiTest.skipped) {
    diagnosis = '⚠️ Env vars partially set — ZAI_API_KEY or ZAI_TOKEN missing. Cannot test the API call.'
  } else if (!apiTest.success && apiTest.status) {
    diagnosis = `❌ ZAI API rejected the request with HTTP ${apiTest.status}. Auth or request body issue. Body: ${apiTest.bodyPreview}`
  } else if (!apiTest.success) {
    diagnosis = `❌ Fetch to /images/generations failed: ${apiTest.errorMessage}. The DNS works (test 1) and the host root is reachable (test 2), but the actual API endpoint fails — this is the real "fetch failed" cause.`
  } else if (apiTest.success) {
    diagnosis = `✅ All tests passed! ZAI API is reachable and accepting requests. HTTP ${apiTest.status} in ${apiTest.elapsedMs}ms.`
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: envStatus,
    tests: { dns: dnsTest, connectivity: connectivityTest, api: apiTest },
    diagnosis,
  })
}
