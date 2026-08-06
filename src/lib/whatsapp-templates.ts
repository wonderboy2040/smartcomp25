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

export type WhatsAppTemplateType = 'received' | 'progress' | 'completed' | 'payment' | 'delivered'

export const WHATSAPP_TEMPLATES: Array<{ type: WhatsAppTemplateType; title: string; desc: string; icon: string; color: string }> = [
  { type: 'received',  title: 'Device Received',    desc: 'Confirm with cost estimate', icon: 'fa-inbox',                color: 'blue'   },
  { type: 'progress',  title: 'In Progress',         desc: 'Repair ongoing update',     icon: 'fa-wrench',               color: 'amber'  },
  { type: 'completed', title: 'Completed',           desc: 'Ready for pickup with bill',icon: 'fa-check',                color: 'green'  },
  { type: 'payment',   title: 'Payment Reminder',    desc: 'Balance with UPI details',  icon: 'fa-indian-rupee-sign',    color: 'purple' },
  { type: 'delivered', title: 'Delivered',           desc: 'Thank you note & review',   icon: 'fa-handshake',            color: 'gray'   },
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

    case 'payment':
      return `*${bn}*\n\n💳 *PAYMENT REMINDER*\n\nDear *${job.customerName}*,\n\nThis is a quick reminder regarding your service bill.\n\n📋 *Job No:* ${job.id}\n📱 *Device:* ${job.deviceType}${job.brandModel ? ' (' + job.brandModel + ')' : ''}\n\n💰 *Payment Summary:*\n• Total Bill: ₹${tot}\n• Amount Paid: ₹${paid}\n━━━━━━\n*Remaining Balance: ₹${bal}*${shop.upiId ? `\n\n📲 *UPI ID for instant payment:* ${shop.upiId}` : ''}\n\n📞 *Contact Us:* ${shop.businessMobile || ''}\nThank you! 🙏`

    case 'delivered':
      return `*${bn}*\n\n🤝 *THANK YOU FOR YOUR BUSINESS!*\n\nDear *${job.customerName}*,\n\nYour ${job.deviceType}${job.brandModel ? ' (' + job.brandModel + ')' : ''} has been delivered successfully.\n\n📋 *Job No:* ${job.id}\n📅 *Delivered On:* ${jobDate}\n\n⭐ We hope you are satisfied with our service! If you have 1 minute, please share your valuable feedback.\n\n📞 *Help & Support:* ${shop.businessMobile || ''}\n📍 ${shop.businessAddress || ''}\n\nThank you for choosing ${bn}! 🙏`
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
