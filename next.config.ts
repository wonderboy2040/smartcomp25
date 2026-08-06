import type { NextConfig } from "next";

/**
 * Smart Computers Panel v3.0 - Optimized Next.js Config
 *
 * Upgrades in v3.0:
 * - Removed framer-motion from optimizePackageImports (dep removed)
 * - Added zod to optimizePackageImports
 * - Stricter security headers + CSP
 * - Better caching strategy
 * - Bundle analyzer friendly
 * - Improved image optimization
 */

const nextConfig: NextConfig = {
  // Standalone output so Electron can ship the server bundle without node_modules
  output: 'standalone',
  // Type-check on build — was previously ignored, which let real type errors
  // ship to production silently. If type errors block a deploy, fix them
  // rather than disabling this flag again.
  typescript: {
    ignoreBuildErrors: false,
  },
  // ESLint on build — keep build validation active. Same rationale as above.
  eslint: {
    ignoreDuringBuilds: false,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  cleanDistDir: true,

  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24,
    remotePatterns: [],
    dangerouslyAllowSVG: true,
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'zod',
      // Radix packages still in use after the v11.4 cleanup. Each one is a
      // barrel export, so without this every panel that imports one pulls the
      // whole package into its chunk.
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-label',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-tooltip',
    ],
  },

  outputFileTracingIncludes: {
    '/api/apps-script-code': ['./apps-script/code.gs'],
  },

  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      // Content-Security-Policy: restricts what origins can serve scripts,
      // styles, images, etc. for this app. Allows self + inline (Next needs
      // inline for hydration scripts) + Google Scripts (legacy Apps Script
      // backend, kept for backward compat) + Firestore (server-side only, but
      // listed for completeness if any client lib ever talks to it) + Meta
      // Graph API (WhatsApp Cloud) + Razorpay (payment gateway).
      //
      // NOTE: Firebase calls happen server-side via firebase-admin — the
      // browser never connects to firestore.googleapis.com directly. We list
      // it in connect-src anyway so the optional client-side Firebase JS SDK
      // would work if added later.
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data:",
          "connect-src 'self' https://script.google.com https://*.googleusercontent.com https://firestore.googleapis.com https://*.firebaseio.com https://graph.facebook.com https://api.razorpay.com https://*.razorpay.com",
          "frame-ancestors 'self'",
          "form-action 'self' https://api.razorpay.com",
          "base-uri 'self'",
          "object-src 'none'",
        ].join('; '),
      },
    ]

    return [
      {
        source: '/((?!_next/static|_next/image|favicon.ico|icon-|apple-|sw.js|sw-register.js|manifest.json|offline.html|logo.svg|robots.txt).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
          ...securityHeaders,
        ],
      },
      {
        // Build assets carry a content hash in their filename, so they can be
        // cached forever. Without this they inherited no Cache-Control at all
        // and the browser re-validated every chunk on each repeat visit.
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          ...securityHeaders,
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          ...securityHeaders,
        ],
      },
      {
        source: '/sw-register.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          ...securityHeaders,
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
          ...securityHeaders,
        ],
      },
      {
        source: '/clear-cache.html',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          ...securityHeaders,
        ],
      },
      {
        source: '/:path*(logo|icon|apple-touch-icon|favicon).svg',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, immutable' },
          ...securityHeaders,
        ],
      },
      {
        // Public tracking pages - cache 5 min for performance
        source: '/track/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=600' },
          ...securityHeaders,
        ],
      },
    ]
  },

  async redirects() {
    return [
      {
        source: '/admin',
        destination: '/',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
