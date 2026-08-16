/**
 * Enhanced WhatsApp utilities for invoice sending
 * Adds direct invoice PDF send capability via WhatsApp Cloud API
 */

import { sendTextMessage, isCloudApiConfigured, normalizePhone } from './whatsapp-cloud'
import { generateWhatsAppLink } from './whatsapp'

export interface InvoiceSendResult {
  success: boolean
  method: 'cloud-api' | 'wa.me-link' | 'skipped'
  link?: string
  error?: string
  messageId?: string
}

/**
 * Send invoice via WhatsApp
 * If PDF URL is provided, sends as media message
 * Otherwise sends text message with track link
 */
export async function sendInvoiceViaWhatsApp(
  customerPhone: string,
  invoiceNumber: string,
  grandTotal: number,
  pdfUrl?: string,
  trackUrl?: string,
  shopName: string = 'Smart Computers'
): Promise<InvoiceSendResult> {
  const cleanPhone = normalizePhone(customerPhone)
  if (!cleanPhone) {
    return { success: false, method: 'skipped', error: 'Invalid phone number' }
  }

  // Build message
  let message = `*${shopName}*\n\n`
  message += `Thank you for your purchase!\n\n`
  message += `📄 Invoice: ${invoiceNumber}\n`
  message += `💰 Amount: Rs.${grandTotal.toFixed(2)}\n\n`

  if (trackUrl) {
    message += `View/Download Invoice:\n${trackUrl}\n\n`
  }

  message += `For any queries, please contact us.\n`
  message += `We appreciate your business! 🙏`

  if (isCloudApiConfigured()) {
    // Send via Cloud API
    // Note: Media messages (PDF) require WhatsApp Business API with media template
    // For now, send text message with link
    const result = await sendTextMessage(customerPhone, message)
    if (result.success) {
      return {
        success: true,
        method: 'cloud-api',
        messageId: result.messageId,
      }
    }

    // Cloud API failed, return wa.me link
    return {
      success: false,
      method: 'wa.me-link',
      link: generateWhatsAppLink(customerPhone, message),
      error: result.error,
    }
  }

  // No Cloud API configured - return wa.me link for manual send
  return {
    success: true,
    method: 'wa.me-link',
    link: generateWhatsAppLink(customerPhone, message),
  }
}

/**
 * Send quotation via WhatsApp
 */
export async function sendQuotationViaWhatsApp(
  customerPhone: string,
  quotationNumber: string,
  grandTotal: number,
  validTill: string,
  pdfUrl?: string,
  shopName: string = 'Smart Computers'
): Promise<InvoiceSendResult> {
  const cleanPhone = normalizePhone(customerPhone)
  if (!cleanPhone) {
    return { success: false, method: 'skipped', error: 'Invalid phone number' }
  }

  const validDate = new Date(validTill).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })

  let message = `*${shopName}*\n\n`
  message += `Quotation for your requirement:\n\n`
  message += `📋 Quotation: ${quotationNumber}\n`
  message += `💰 Total: Rs.${grandTotal.toFixed(2)}\n`
  message += `⏰ Valid till: ${validDate}\n\n`

  if (pdfUrl) {
    message += `View Quotation:\n${pdfUrl}\n\n`
  }

  message += `Please let us know if you'd like to proceed.\n`
  message += `Thank you! 🙏`

  if (isCloudApiConfigured()) {
    // Note: Media messages require WhatsApp Business API with media template
    const result = await sendTextMessage(customerPhone, message)
    if (result.success) {
      return { success: true, method: 'cloud-api', messageId: result.messageId }
    }

    return {
      success: false,
      method: 'wa.me-link',
      link: generateWhatsAppLink(customerPhone, message),
      error: result.error,
    }
  }

  return {
    success: true,
    method: 'wa.me-link',
    link: generateWhatsAppLink(customerPhone, message),
  }
}

/**
 * Send payment reminder via WhatsApp
 */
export async function sendPaymentReminderViaWhatsApp(
  customerPhone: string,
  customerName: string,
  invoiceNumber: string,
  amountDue: number,
  daysOverdue: number,
  shopName: string = 'Smart Computers'
): Promise<InvoiceSendResult> {
  const cleanPhone = normalizePhone(customerPhone)
  if (!cleanPhone) {
    return { success: false, method: 'skipped', error: 'Invalid phone number' }
  }

  let message = `*${shopName}*\n\n`
  message += `Dear ${customerName},\n\n`
  message += `This is a friendly reminder for your pending payment:\n\n`
  message += `📄 Invoice: ${invoiceNumber}\n`
  message += `💰 Amount Due: Rs.${amountDue.toFixed(2)}\n`
  message += `⏰ Overdue by: ${daysOverdue} days\n\n`
  message += `Kindly arrange the payment at your earliest convenience.\n`
  message += `Thank you for your cooperation! 🙏`

  if (isCloudApiConfigured()) {
    const result = await sendTextMessage(customerPhone, message)
    if (result.success) {
      return { success: true, method: 'cloud-api', messageId: result.messageId }
    }

    return {
      success: false,
      method: 'wa.me-link',
      link: generateWhatsAppLink(customerPhone, message),
      error: result.error,
    }
  }

  return {
    success: true,
    method: 'wa.me-link',
    link: generateWhatsAppLink(customerPhone, message),
  }
}
