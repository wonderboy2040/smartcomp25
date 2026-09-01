/**
 * SmartComp Mobile — central theme tokens.
 * Mirrors the web app's slate + indigo palette so the mobile app feels
 * like a sibling, not a stranger.
 */

export const colors = {
  // Brand
  brand: '#4f46e5',
  brandDark: '#4338ca',
  brandLight: '#818cf8',

  // Surface (light)
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  border: '#e2e8f0',

  // Surface (dark)
  backgroundDark: '#0f172a',
  surfaceDark: '#1e293b',
  surfaceMutedDark: '#334155',
  borderDark: '#475569',

  // Text
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  textInverted: '#f8fafc',

  // Status
  success: '#16a34a',
  successLight: '#dcfce7',
  warning: '#d97706',
  warningLight: '#fef3c7',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  info: '#0284c7',
  infoLight: '#e0f2fe',

  // Misc
  shadow: 'rgba(15, 23, 42, 0.08)',
  overlay: 'rgba(15, 23, 42, 0.5)',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 9999,
} as const

export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const

export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
}

export const getTheme = (isDark: boolean) => ({
  background: isDark ? colors.backgroundDark : colors.background,
  surface: isDark ? colors.surfaceDark : colors.surface,
  surfaceMuted: isDark ? colors.surfaceMutedDark : colors.surfaceMuted,
  border: isDark ? colors.borderDark : colors.border,
  textPrimary: isDark ? colors.textInverted : colors.textPrimary,
  textSecondary: isDark ? '#cbd5e1' : colors.textSecondary,
  textMuted: colors.textMuted,
  brand: colors.brand,
  brandLight: colors.brandLight,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  info: colors.info,
})

export type Theme = ReturnType<typeof getTheme>
