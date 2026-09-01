/**
 * LoadingSpinner — centered ActivityIndicator with optional label.
 */

import { View, ActivityIndicator, Text, StyleSheet } from 'react-native'
import { colors, fontSizes, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'

interface LoadingSpinnerProps {
  label?: string
  size?: 'small' | 'large'
  full?: boolean
}

export function LoadingSpinner({ label, size = 'large', full = false }: LoadingSpinnerProps) {
  const isDark = useColorScheme() === 'dark'
  return (
    <View style={[styles.wrap, full && styles.full]}>
      <ActivityIndicator size={size} color={colors.brand} />
      {label ? (
        <Text style={[styles.label, { color: isDark ? colors.textInverted : colors.textSecondary }]}>
          {label}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  full: {
    flex: 1,
  },
  label: {
    fontSize: fontSizes.sm,
  },
})
