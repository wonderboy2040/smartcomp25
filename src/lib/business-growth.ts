/**
 * Business Marketing & Growth Configuration
 * -------------------------------------------
 * Centralised settings that power the "Business Viral Engine":
 *   - Google Review link (boosts local SEO + social proof)
 *   - Social media links
 *   - Referral offer text
 *   - WhatsApp campaign templates
 *
 * The Google Review short link below is the shop owner's review URL.
 * It is shown:
 *   - On every PDF invoice footer ("Review us on Google →")
 *   - In WhatsApp invoice share messages
 *   - On the customer-facing track page
 *   - In the Superintelligence growth panel
 *
 * Replace SOCIAL_LINKS with real handles when the shop sets them up.
 */

export const BUSINESS_GROWTH = {
  /** Google Review short link — boosts local SEO and social proof. */
  googleReviewUrl: 'https://share.google/ZUvRUX4eYuUHJdaA4',

  /** Default Google review request message (used in WhatsApp after delivery). */
  googleReviewMessage:
    '⭐ We would love your feedback!\n\nIf you are happy with our service, please take 30 seconds to leave us a Google review — it helps us grow and serve you better.\n\n👉 Review us here: https://share.google/ZUvRUX4eYuUHJdaA4\n\nThank you so much! 🙏',

  /** Referral offer text — incentivises existing customers to bring new ones. */
  referralOffer:
    '🎁 REFER & EARN!\n\nGet Rs.100 OFF on your next service for every friend you refer who completes a repair.\n\nYour friend also gets Rs.50 OFF their first service!',

  /** Social media handles (empty string = not yet set up). */
  social: {
    instagram: '',
    facebook: '',
    youtube: '',
    whatsappChannel: '',
  },

  /** Default campaign templates for the Superintelligence growth engine. */
  campaigns: {
    newCustomer:
      '🎉 WELCOME TO SMART COMPUTERS!\n\nFirst-time customer? Get Rs.200 OFF on your first service or 5% OFF on laptops/accessories.\n\nShow this message to claim.\nOffer valid for 7 days.',
    repeat:
      '🙏 WELCOME BACK!\n\nAs a valued returning customer, enjoy priority service + free cleaning with any repair this month.\n\nBook now: ',
    winback:
      '👋 WE MISS YOU!\n\nIt has been a while since your last visit. Come back this week and get 15% OFF on any service + free diagnostic.\n\nShow this message to claim.',
    festival:
      '🎊 FESTIVE OFFER!\n\nCelebrate with Smart Computers — up to 20% OFF on laptops, accessories, and service this festive season.\n\nLimited time only!',
  },
} as const

/**
 * Build a Google review request WhatsApp link for a specific customer.
 * Uses the customer's name to personalise the message.
 */
export function buildReviewRequestLink(customerName?: string, customerPhone?: string): string {
  const name = customerName ? customerName.trim() : 'there'
  const msg = `Dear ${name},\n\n${BUSINESS_GROWTH.googleReviewMessage}`
  const cleanPhone = String(customerPhone || '').replace(/[^\d]/g, '')
  const target = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone.length > 10 ? cleanPhone : ''
  return target
    ? `https://wa.me/${target}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`
}
