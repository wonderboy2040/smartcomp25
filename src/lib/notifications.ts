/**
 * Customer Notifications Library
 *
 * Sends WhatsApp messages to customers on:
 *   - Job status changes (Pending → In Progress → Completed → Delivered)
 *   - Payment reminders (overdue invoices)
 *   - Birthday greetings
 *
 * Uses WhatsApp Cloud API if configured (WA_TOKEN set), otherwise generates
 * wa.me links that the user can open manually.
 *
 * All functions are fire-and-forget — they never throw or block the caller.
 */

import { sendTextMessage, isCloudApiConfigured, normalizePhone } from './whatsapp-cloud'
import { generateWhatsAppLink } from './whatsapp'

export interface NotificationResult {
  success: boolean
  method: 'cloud-api' | 'wa.me-link' | 'skipped'
  link?: string
  error?: string
}

/**
 * Send a WhatsApp message to a customer. If Cloud API is configured, sends
 * automatically. Otherwise returns a wa.me link that the caller can show to
 * the user (e.g., in a toast) to open manually.
 */
export async function sendCustomerNotification(
  phone: string,
  message: string
): Promise<NotificationResult> {
  const cleanPhone = normalizePhone(phone)
  if (!cleanPhone) {
    return { success: false, method: 'skipped', error: 'Invalid phone' }
  }

  if (isCloudApiConfigured()) {
    const result = await sendTextMessage(phone, message)
    if (result.success) {
      return { success: true, method: 'cloud-api' }
    }
    // Fall back to wa.me link if Cloud API fails (e.g., outside 24h window)
    return {
      success: false,
      method: 'wa.me-link',
      link: generateWhatsAppLink(phone, message),
      error: result.error,
    }
  }

  // No Cloud API — return wa.me link for manual send
  return {
    success: true,
    method: 'wa.me-link',
    link: generateWhatsAppLink(phone, message),
  }
}

/**
 * Job status change notification.
 * Called when a job's status changes.
 */
export async function sendJobStatusNotification(
  job: any,
  newStatus: string,
  shopName: string,
  trackUrl?: string
): Promise<NotificationResult> {
  if (!job?.customerMobile) {
    return { success: false, method: 'skipped', error: 'No customer phone' }
  }

  const sn = shopName || 'Smart Computers'
  const customerName = String(job?.customerName || 'Customer')
  const jobId = String(job?.jobId || '')
  const device = String(job?.deviceType || 'device')
  const brand = String(job?.brandModel || '')
  const finalAmount = Number(job?.finalAmount) || 0

  let message = ''

  switch (newStatus) {
    case 'In Progress':
      message = `*${sn}*\n\nHello ${customerName},\n\nYour ${device}${brand ? ` (${brand})` : ''} is now under repair. Job ID: ${jobId}.\n\nWe'll notify you when it's ready. Thank you!`
      break

    case 'Completed':
      message = `*${sn}*\n\nGood news ${customerName}!\n\nYour ${device}${brand ? ` (${brand})` : ''} repair is complete and ready for pickup.\nJob ID: ${jobId}\n${finalAmount > 0 ? `Amount: Rs.${finalAmount}` : ''}\n\nPlease collect at your convenience. Thank you!`
      break

    case 'Delivered':
      message = `*${sn}*\n\nThank you ${customerName}!\n\nYour ${device} has been delivered. Job ID: ${jobId}.\n${finalAmount > 0 ? `Total: Rs.${finalAmount}` : ''}\n\nWe appreciate your business. For any issues, please contact us.`
      break

    default:
      message = `*${sn}*\n\nHello ${customerName},\n\nYour job status updated: ${newStatus}.\nJob ID: ${jobId}${trackUrl ? `\n\nTrack online: ${trackUrl}` : ''}`
  }

  if (trackUrl && newStatus !== 'Delivered') {
    message += `\n\nTrack your repair: ${trackUrl}`
  }

  return sendCustomerNotification(job.customerMobile, message)
}

/**
 * Payment reminder for overdue invoices.
 */
export async function sendPaymentReminder(
  customerName: string,
  customerPhone: string,
  invoiceNumber: string,
  amountDue: number,
  daysOverdue: number,
  shopName: string
): Promise<NotificationResult> {
  if (!customerPhone) {
    return { success: false, method: 'skipped', error: 'No customer phone' }
  }

  const sn = shopName || 'Smart Computers'
  const message = `*${sn}*\n\nDear ${customerName},\n\nThis is a friendly reminder for your pending payment:\n\nInvoice: ${invoiceNumber}\nAmount Due: Rs.${amountDue}\nOverdue by: ${daysOverdue} days\n\nKindly arrange the payment at your earliest convenience. Thank you!`

  return sendCustomerNotification(customerPhone, message)
}

/**
 * Birthday greeting.
 */
export async function sendBirthdayGreeting(
  customerName: string,
  customerPhone: string,
  shopName: string
): Promise<NotificationResult> {
  if (!customerPhone) {
    return { success: false, method: 'skipped', error: 'No customer phone' }
  }

  const sn = shopName || 'Smart Computers'
  const message = `*${sn}*\n\nHappy Birthday ${customerName}! 🎉\n\nWishing you a wonderful year ahead! As a birthday gift, enjoy 10% off on any service this week.\n\nShow this message to claim your discount. Thank you for being a valued customer!`

  return sendCustomerNotification(customerPhone, message)
}

/**
 * Generate an unguessable tracking token for a job.
 * Format: 8 random alphanumeric characters.
 */
export function generateTrackToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

/**
 * Build the public tracking URL for a job.
 */
export function buildTrackUrl(jobId: string, trackToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
  if (baseUrl) {
    return `${baseUrl}/track/${jobId}-${trackToken}`
  }
  // Fallback: use the request origin (works on client side)
  return `/track/${jobId}-${trackToken}`
}
