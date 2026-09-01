/**
 * Card — surface container with optional elevation, used everywhere.
 */

import { View, StyleSheet, type ViewStyle } from 'react-native'
import { colors, radii, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'

interface CardProps {
  children: React.ReactNode
  style?: ViewStyle
  padding?: keyof typeof spacing
  elevated?: boolean
  outline?: boolean
}

export function Card({ children, style, padding = 'lg', elevated = false, outline = false }: CardProps) {
  const isDark = useColorScheme() === 'dark'
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: isDark ? colors.surfaceDark : colors.surface },
        outline && { borderWidth: 1, borderColor: isDark ? colors.borderDark : colors.border },
        elevated && styles.elevated,
        { padding: spacing[padding] },
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  elevated: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
})
