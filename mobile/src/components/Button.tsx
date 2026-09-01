/**
 * Button — primary / secondary / danger / ghost / outline variants.
 */

import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, type ViewStyle, type TextStyle } from 'react-native'
import { colors, fontSizes, fontWeights, radii, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'
import { hapticLight } from '@/lib/haptics'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'

interface ButtonProps {
  label: string
  onPress?: () => void
  variant?: Variant
  loading?: boolean
  disabled?: boolean
  icon?: string
  full?: boolean
  size?: 'sm' | 'md' | 'lg'
  style?: ViewStyle
  textStyle?: TextStyle
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  full = false,
  size = 'md',
  style,
  textStyle,
}: ButtonProps) {
  const isDark = useColorScheme() === 'dark'

  const handlePress = () => {
    if (disabled || loading) return
    hapticLight()
    onPress?.()
  }

  const isPrimary = variant === 'primary'
  const isDanger = variant === 'danger'
  const isOutline = variant === 'outline'
  const isSecondary = variant === 'secondary'
  const isGhost = variant === 'ghost'

  const height = size === 'sm' ? 36 : size === 'lg' ? 52 : 44
  const fontSize = size === 'sm' ? fontSizes.sm : size === 'lg' ? fontSizes.lg : fontSizes.md

  const bg = isPrimary
    ? colors.brand
    : isDanger
    ? colors.danger
    : isSecondary
    ? isDark ? colors.surfaceMutedDark : colors.surfaceMuted
    : 'transparent'

  const fg = isPrimary || isDanger
    ? colors.textInverted
    : isGhost
    ? colors.brand
    : isDark ? colors.textInverted : colors.textPrimary

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.base,
        { height, backgroundColor: bg, borderColor: isOutline ? (isDark ? colors.borderDark : colors.border) : 'transparent' },
        isOutline && { borderWidth: 1 },
        full && { alignSelf: 'stretch' },
        (disabled || loading) && { opacity: 0.6 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <Text
          style={[
            styles.label,
            { color: fg, fontSize, fontWeight: fontWeights.semibold },
            textStyle,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  label: {
    letterSpacing: 0.2,
  textAlign: 'center',
  },
})
