import { NextResponse } from 'next/server'
import { getCloudApiConfig } from '@/lib/whatsapp-cloud'

/**
 * Returns the current WhatsApp Cloud API configuration status.
 * Used by the Settings panel to show whether Cloud API is configured.
 */
export async function GET() {
  return NextResponse.json(getCloudApiConfig())
}
