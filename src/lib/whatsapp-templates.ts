/**
 * WhatsApp message templates for service job updates - QUANTUM ULTRA UPGRADED v5.0
 * 
 * Safe date parsing (no 'Invalid Date' bugs) & accurate multi-status templates.
 */

export interface WhatsAppJobData {
  id: string
  customerName: string
  customerMobile: string
  deviceType: string
  brandModel?: string
  problemDesc: string
  accessories?: string
  date?: string
  createdAt?: string
  estimatedAmount: number
  advanceAmount: number
  paidAmount: number
  finalAmount: number
  serviceCharge: number
  spareParts?: Array<{ name: string; qty: number; total: number; sellPrice?: number; price?: number }>
}

export interface WhatsAppShopInfo {
  businessName: string
  businessMobile: string
  businessAddress?: string
  whatsappNumber?: string
  upiId?: string
}

export type WhatsAppTemplateType = 'received' | 'progress' | 'completed' | 'payment' | 'delivered' | 'invoice' | 'not-repaired'

export const WHATSAPP_TEMPLATES: Array<{ type: WhatsAppTemplateType; title: string; desc: string; icon: string; color: string }> = [
  { type: 'received',  title: 'Device Received',    desc: 'Confirm with cost estimate', icon: 'fa-inbox',                color: 'blue'   },
  { type: 'progress',  title: 'In Progress',         desc: 'Repair ongoing update',     icon: 'fa-wrench',               color: 'amber'  },
  { type: 'completed', title: 'Completed',           desc: 'Ready for pickup with bill',icon: 'fa-check',                color: 'green'  },
  { type: 'invoice',   title: 'Share Invoice',       desc: 'Full bill with item details',icon: 'fa-file-invoice',         color: 'purple' },
  { type: 'payment',   title: 'Payment Reminder',    desc: 'Balance with UPI details',  icon: 'fa-indian-rupee-sign',    color: 'purple' },
  { type: 'delivered', title: 'Delivered',           desc: 'Thank you note & review',   icon: 'fa-handshake',            color: 'gray'   },
  { type: 'not-repaired', title: 'Not Repaired - Returned', desc: 'Device returned without repair', icon: 'fa-box', color: 'red' },
]

function formatSafeDate(rawDate?: string): string {
  if (!rawDate) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const d = new Date(rawDate)
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function buildWhatsAppMessage(
  type: WhatsAppTemplateType,
  job: WhatsAppJobData,
  shop: WhatsAppShopInfo,
): string {
  const bn = shop.businessName || 'Smart Computers'
  const tot = job.finalAmount || job.estimatedAmount || 0
  const paid = (job.paidAmount || 0) + (job.advanceAmount || 0)
  const bal = Math.max(0, tot - paid)
  const svc = job.serviceCharge || 0
  const pt = (job.spareParts || []).reduce((s, p) => s + (p.total || 0), 0)
  const jobDate = formatSafeDate(job.date || job.createdAt)

  switch (type) {
    case 'received':
      return `*${bn}*\n\n✅ *DEVICE RECEIVED*\n\nDear *${job.customerName}*,\n\nYour device has been received at our service center.\n\n📋 *Job No:* ${job.id}\n📅 *Date:* ${jobDate}\n📱 *Device:* ${job.deviceType}${job.brandModel ? ' - ' + job.brandModel : ''}\n🔍 *Issue:* ${job.problemDesc}\n📦 *Accessories:* ${job.accessories || 'None'}\n\n💰 *ESTIMATED COST*\n🔩 Parts: ₹${pt || 'TBD'}\n🔧 Service: ₹${svc || 'TBD'}\n━━━━━━\n📊 *Estimate: ₹${tot > 0 ? tot : 'Will confirm after diagnosis'}*\n${job.advanceAmount > 0 ? `✅ Advance Paid: ₹${job.advanceAmount}\n` : ''}\n⏳ *PLEASE CONFIRM TO PROCEED*\nReply:\n✅ *YES* - Proceed with repair\n❌ *NO* - Hold / Cancel\n\n📞 ${shop.businessMobile || ''}\n📍 ${shop.businessAddress || ''}\n\nThank you for choosing ${bn}! 🙏`

    case 'progress':
      return `*${bn}*\n\n🔧 *WORK IN PROGRESS*\n\nDear *${job.customerName}*,\n\nYour device repair is currently in progress.\n\n📋 *Job No:* ${job.id}\n📱 *Device:* ${job.deviceType}${job.brandModel ? ' - ' + job.brandModel : ''}\n🔍 *Issue:* ${job.problemDesc}\n\n📊 *Status Progress:*\n✅ Received\n✅ Diagnosis Completed\n🔄 *Repair In Progress*\n⏳ Final Quality Testing\n⏳ Ready for Pickup\n\n💰 *ESTIMATE STATUS*\n🔩 Parts Total: ₹${pt || 0}\n🔧 Service Charge: ₹${svc || 0}\n━━━━━━\n📊 *Total Estimate: ₹${tot}*\n${job.advanceAmount > 0 ? `✅ Advance Paid: ₹${job.advanceAmount}\n💵 Balance Due: ₹${Math.max(0, tot - job.advanceAmount)}\n` : ''}\n⏰ Estimated Completion: 24-48 hours\n\n📞 ${shop.businessMobile || ''}\nThank you for your patience! 🙏`

    case 'completed':
      return `*${bn}*\n\n🎉 *REPAIR COMPLETED & READY FOR PICKUP!*\n\nDear *${job.customerName}*,\n\nGreat news! Your ${job.deviceType}${job.brandModel ? ' (' + job.brandModel + ')' : ''} repair is complete and thoroughly tested.\n\n📋 *Job No:* ${job.id}\n📅 *Date:* ${jobDate}\n\n🧾 *BILL BREAKDOWN:*\n${(job.spareParts || []).length > 0 ? (job.spareParts || []).map((p) => `• ${p.name} (x${p.qty}) = ₹${p.total}`).join('\n') + '\n' : ''}🔧 Service Charge: ₹${svc}\n━━━━━━\n*Grand Total: ₹${tot}*\n${paid > 0 ? `Paid So Far: -₹${paid}\n` : ''}*Balance Due: ${bal > 0 ? '₹' + bal : 'PAID IN FULL ✅'}*${shop.upiId && bal > 0 ? `\n\n📲 *Pay via UPI:* ${shop.upiId}` : ''}\n\n📍 *Pickup Address:* ${shop.businessAddress || 'Shop Counter'}\n📞 *Contact:* ${shop.businessMobile || ''}\n🕐 *Hours:* Mon-Sat (10 AM - 8 PM)\n\nThank you! We look forward to serving you! 🙏`

    case 'invoice':
      return `*${bn}*\n\n📄 *SERVICE INVOICE*\n\nDear *${job.customerName}*,\n\n📋 *Job Details:*\n• Job No: ${job.id}\n• Date: ${jobDate}\n• Device: ${job.deviceType}${job.brandModel ? ' - ' + job.brandModel : ''}\n• Problem: ${job.problemDesc}\n${job.accessories ? `• Accessories: ${job.accessories}\n` : ''}\n🧾 *INVOICE BREAKDOWN:*\n${(job.spareParts || []).length > 0 ? '\n*Parts Used:*\n' + (job.spareParts || []).map((p, i) => `${i + 1}. ${p.name}\n   Qty: ${p.qty} × ₹${(Number(p.sellPrice) || Number(p.price) || 0)} = ₹${p.total}`).join('\n') + '\n' : ''}${svc > 0 ? `\n*Service & Repair Charge:*\n₹${svc}\n` : ''}\n━━━━━━━━━━━━━━\n💰 *PAYMENT SUMMARY:*\n• Sub Total: ₹${tot}\n• Grand Total: ₹${tot}\n${paid > 0 ? `• Paid Amount: -₹${paid}\n` : ''}• *Balance Due: ${bal > 0 ? '₹' + bal : '₹0 (PAID) ✅'}*\n${shop.upiId && bal > 0 ? `\n📲 *Pay Online:*\nUPI ID: ${shop.upiId}\n` : ''}\n📞 *Contact:* ${shop.businessMobile || ''}\n📍 ${shop.businessAddress || ''}\n\nThank you for your business! 🙏`

    case 'payment':
      return `*${bn}*\n\n💳 *PAYMENT REMINDER*\n\nDear *${job.customerName}*,\n\nThis is a quick reminder regarding your service bill.\n\n📋 *Job No:* ${job.id}\n📱 *Device:* ${job.deviceType}${job.brandModel ? ' (' + job.brandModel + ')' : ''}\n\n💰 *Payment Summary:*\n• Total Bill: ₹${tot}\n• Amount Paid: ₹${paid}\n━━━━━━\n*Remaining Balance: ₹${bal}*${shop.upiId ? `\n\n📲 *UPI ID for instant payment:* ${shop.upiId}` : ''}\n\n📞 *Contact Us:* ${shop.businessMobile || ''}\nThank you! 🙏`

    case 'delivered':
      return `*${bn}*\n\n🤝 *THANK YOU FOR YOUR BUSINESS!*\n\nDear *${job.customerName}*,\n\nYour ${job.deviceType}${job.brandModel ? ' (' + job.brandModel + ')' : ''} has been delivered successfully.\n\n📋 *Job No:* ${job.id}\n📅 *Delivered On:* ${jobDate}\n\n⭐ We hope you are satisfied with our service! If you have 1 minute, please share your valuable feedback.\n\n📞 *Help & Support:* ${shop.businessMobile || ''}\n📍 ${shop.businessAddress || ''}\n\nThank you for choosing ${bn}! 🙏`

    case 'not-repaired':
      return `*${bn}*\n\n📦 *DEVICE RETURNED - SERVICE NOT DONE*\n\nDear *${job.customerName}*,\n\nAs per your request, your device is being returned without repair.\n\n📋 *Job No:* ${job.id}\n📅 *Date:* ${jobDate}\n📱 *Device:* ${job.deviceType}${job.brandModel ? ' - ' + job.brandModel : ''}\n🔍 *Reported Issue:* ${job.problemDesc}\n${job.accessories ? `📦 *Accessories Returned:* ${job.accessories}\n` : ''}\n💰 *CHARGES:*\n${svc > 0 ? `🔧 Diagnosis/Inspection Fee: ₹${svc}\n` : '• No charges applied ✅\n'}${job.advanceAmount > 0 ? `💵 Advance Received: ₹${job.advanceAmount}\n${svc > 0 && job.advanceAmount >= svc ? '✅ Adjusted against inspection fee\n' : svc > 0 ? `💵 Balance Due: ₹${Math.max(0, svc - job.advanceAmount)}\n` : '💵 Refund Due: ₹' + job.advanceAmount + '\n'}` : ''}\n⚠️ *Please collect your device at your earliest convenience.*\n\n📞 *Contact:* ${shop.businessMobile || ''}\n📍 ${shop.businessAddress || ''}\n\nWe are always happy to help in the future. Thank you! 🙏`
  }
}

/**
 * Generate a wa.me link that opens WhatsApp with a prefilled message.
 * Accepts 10-digit Indian mobile (auto-prefix 91) or full international number.
 */
export function buildWhatsAppLink(mobile: string, message: string): string {
  const digits = String(mobile || '').replace(/\D/g, '')
  const phone = digits.length === 10 ? '91' + digits : digits
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}
