/**
 * Pure PDF presentation constants — template palettes and ad-banner variants.
 *
 * These live in their own module (separate from ./pdf) because a CLIENT
 * component needs them: src/components/panels/Settings.tsx.
 * ./pdf imports jspdf +
 * jspdf-autotable + qrcode at module scope, and jspdf-autotable patches the
 * jsPDF prototype on import — a side effect webpack cannot tree-shake. So
 * importing these two arrays from ./pdf dragged all three libraries into the
 * browser bundle for nothing.
 *
 * Keep this file dependency-free. ./pdf re-exports everything here, so
 * server-side callers can keep importing from @/lib/pdf.
 */

export interface PdfTemplate {
  id: string
  name: string
  description: string
  badge: string
  headerBg: [number, number, number]
  headerText: [number, number, number]
  accent: [number, number, number]
  tableHead: [number, number, number]
  lightBg: [number, number, number]
  style: string
  premium: boolean
}

export const PDF_TEMPLATES: PdfTemplate[] = [
  {
    id: 'tally-classic',
    name: 'Tally Prime Premium',
    description: 'Most Professional GST - White + Royal Blue - A4 Perfect',
    badge: 'BEST SELLER',
    headerBg: [255, 255, 255],
    headerText: [30, 58, 138],
    accent: [30, 58, 138],
    tableHead: [30, 58, 138],
    lightBg: [239, 246, 255],
    style: 'tally-classic',
    premium: true,
  },
  {
    id: 'tally-modern',
    name: 'Modern Minimal GST',
    description: 'Clean White Space - Emerald Accent - Minimal Ink',
    badge: 'MINIMAL',
    headerBg: [248, 250, 252],
    headerText: [15, 23, 42],
    accent: [16, 185, 129],
    tableHead: [15, 23, 42],
    lightBg: [236, 253, 245],
    style: 'tally-modern',
    premium: true,
  },
  {
    id: 'tally-corporate',
    name: 'Corporate Elite Pro',
    description: 'Navy + Gold - Formal Business - Premium',
    badge: 'CORPORATE',
    headerBg: [15, 23, 42],
    headerText: [255, 255, 255],
    accent: [202, 138, 4],
    tableHead: [15, 23, 42],
    lightBg: [254, 243, 199],
    style: 'tally-corporate',
    premium: true,
  },
  {
    id: 'tally-elegant',
    name: 'Royal Executive Gold',
    description: 'Maroon + Gold - Royal Look - High Value',
    badge: 'ROYAL',
    headerBg: [127, 29, 29],
    headerText: [255, 255, 255],
    accent: [251, 191, 36],
    tableHead: [127, 29, 29],
    lightBg: [254, 249, 195],
    style: 'tally-elegant',
    premium: true,
  },
  {
    id: 'tally-bold',
    name: 'Tech Store Pro',
    description: 'Teal + Orange - Computer Shop Special',
    badge: 'TECH SPECIAL',
    headerBg: [19, 78, 74],
    headerText: [255, 255, 255],
    accent: [249, 115, 22],
    tableHead: [19, 78, 74],
    lightBg: [255, 237, 213],
    style: 'tally-bold',
    premium: true,
  },
  {
    id: 'gst-premium-dark',
    name: 'Premium Dark Elite',
    description: 'Black + Gold - Luxury - High Ticket',
    badge: 'LUXURY',
    headerBg: [0, 0, 0],
    headerText: [255, 215, 0],
    accent: [255, 215, 0],
    tableHead: [0, 0, 0],
    lightBg: [254, 252, 232],
    style: 'premium-dark',
    premium: true,
  },
  {
    id: 'gst-classic-plus',
    name: 'GST Classic Plus',
    description: 'Enhanced Tally - HSN Summary - Bank + QR',
    badge: 'GST PLUS',
    headerBg: [255, 255, 255],
    headerText: [17, 24, 39],
    accent: [59, 130, 246],
    tableHead: [37, 99, 235],
    lightBg: [239, 246, 255],
    style: 'classic-plus',
    premium: true,
  },
  {
    id: 'gst-executive-formal',
    name: 'Executive Formal',
    description: 'Light Gray + Slate - Formal - LUT',
    badge: 'FORMAL',
    headerBg: [241, 245, 249],
    headerText: [30, 41, 59],
    accent: [51, 65, 85],
    tableHead: [51, 65, 85],
    lightBg: [248, 250, 252],
    style: 'executive-formal',
    premium: true,
  },
  {
    id: 'gst-vibrant-bold',
    name: 'Vibrant Bold Offer',
    description: 'Vibrant - Big Grand Total - UPI QR Big',
    badge: 'VIBRANT',
    headerBg: [124, 45, 18],
    headerText: [255, 255, 255],
    accent: [251, 146, 60],
    tableHead: [124, 45, 18],
    lightBg: [255, 237, 213],
    style: 'vibrant-bold',
    premium: true,
  },
  {
    id: 'gst-minimal-white',
    name: 'Minimal White Pro',
    description: 'Pure White - Thin Lines - Low Ink',
    badge: 'ECO PRINT',
    headerBg: [255, 255, 255],
    headerText: [15, 23, 42],
    accent: [14, 165, 233],
    tableHead: [255, 255, 255],
    lightBg: [240, 249, 255],
    style: 'minimal-white',
    premium: true,
  },
]

export const AD_BANNER_VARIANTS = [
  { id: 'flyer', name: 'Premium Flyer', description: '1000x285 px Ultra-Premium Horizontal Flyer' },
  { id: 'grid', name: 'Product Grid', description: '1000x285 px 4x4 Product Grid Poster Banner' },
  { id: 'featured', name: 'Featured Mix', description: 'Headline panel + product showcase' },
  { id: 'strip', name: 'Compact Strip', description: 'Minimal image pills + Call/Visit CTA' },
] as const
