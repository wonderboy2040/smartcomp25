/**
 * StatCard — KPI tile for the dashboard.
 *
 * Compact: icon + label + value. Tap to navigate to the related list
 * screen (passed via `onPress`).
 */

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Card } from './Card'
import { colors, fontSizes, fontWeights, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'

interface StatCardProps {
  label: string
  value: string
  icon: keyof typeof Ionicons.glyphMap
  color?: keyof typeof colorPalette
  onPress?: () => void
  subtitle?: string
}

const colorPalette = {
  brand: colors.brand,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  info: colors.info,
}

export function StatCard({ label, value, icon, color = 'brand', onPress, subtitle }: StatCardProps) {
  const isDark = useColorScheme() === 'dark'
  const accent = colorPalette[color]

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
      style={styles.touch}
    >
      <Card padding="lg" style={{ alignItems: 'flex-start' }}>
        <View style={[styles.iconWrap, { backgroundColor: `${accent}22` }]}>
          <Ionicons name={icon} size={20} color={accent} />
        </View>
        <Text
          style={[styles.value, { color: isDark ? colors.textInverted : colors.textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        <Text style={[styles.label, { color: colors.textMuted }]} numberOfLines={2}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: accent }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </Card>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  touch: {
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    marginBottom: 2,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    lineHeight: 18,
  },
  subtitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})
