/**
 * Badge — colored pill for status indicators.
 */

import { View, Text, StyleSheet } from 'react-native'
import { colors, fontSizes, fontWeights, radii, spacing } from '@/lib/theme'

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface BadgeProps {
  label: string
  tone?: Tone
  size?: 'sm' | 'md'
}

const toneColors: Record<Tone, { bg: string; fg: string }> = {
  brand: { bg: `${colors.brand}22`, fg: colors.brand },
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: colors.warning },
  danger: { bg: colors.dangerLight, fg: colors.danger },
  info: { bg: colors.infoLight, fg: colors.info },
  neutral: { bg: `${colors.textMuted}22`, fg: colors.textSecondary },
}

export function Badge({ label, tone = 'neutral', size = 'sm' }: BadgeProps) {
  const t = toneColors[tone]
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, sizeStyles[size]]}>
      <Text style={[styles.label, { color: t.fg }, sizeStyles[size].label]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: fontWeights.semibold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
})

const sizeStyles = {
  sm: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    label: { fontSize: fontSizes.xs },
  },
  md: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    label: { fontSize: fontSizes.sm },
  },
} as const

export function toneForStatus(status: string): Tone {
  const s = String(status || '').toLowerCase()
  if (['paid', 'delivered', 'completed', 'ready', 'active'].includes(s)) return 'success'
  if (['pending', 'in progress', 'awaiting parts'].includes(s)) return 'warning'
  if (['cancelled', 'failed', 'unpaid', 'overdue'].includes(s)) return 'danger'
  if (['partial'].includes(s)) return 'info'
  return 'neutral'
}
