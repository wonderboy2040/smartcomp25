/**
 * Share Token Utility — Customer Self-Service Portal
 * 
 * Generates cryptographic share tokens for invoices, quotations, and jobs
 * so customers can access their documents via public links without PIN.
 * 
 * Token format: 12-char random hex (48 bits of entropy — sufficient for
 * non-sensitive read-only access with rate limiting on the endpoint).
 */

export function generateShareToken(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(6) // 6 bytes = 12 hex chars
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // Fallback for environments without crypto
  return Array.from({ length: 12 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
}

/**
 * Constant-time string comparison to prevent timing attacks on token validation.
 */
export function safeTokenCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
