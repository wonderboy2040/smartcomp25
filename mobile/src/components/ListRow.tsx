/**
 * ListRow — reusable row used by customer / invoice / job lists.
 * Avatar + title + subtitle + right-side meta + chevron.
 */

import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Avatar } from './Avatar'
import { Badge, type Tone } from './Badge'
import { colors, fontSizes, fontWeights, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'

interface ListRowProps {
  title: string
  subtitle?: string
  meta?: string
  metaTone?: Tone
  badge?: string
  badgeTone?: Tone
  avatarName?: string
  onPress?: () => void
  rightIcon?: keyof typeof Ionicons.glyphMap
  style?: ViewStyle
}

export function ListRow({
  title,
  subtitle,
  meta,
  metaTone,
  badge,
  badgeTone,
  avatarName,
  onPress,
  rightIcon = 'chevron-forward',
  style,
}: ListRowProps) {
  const isDark = useColorScheme() === 'dark'
  const Wrap = onPress ? TouchableOpacity : View

  return (
    <Wrap
      {...(onPress ? { onPress, activeOpacity: 0.7 } : {})}
      style={[
        styles.row,
        { backgroundColor: isDark ? colors.surfaceDark : colors.surface },
        style,
      ]}
    >
      {avatarName !== undefined ? <Avatar name={avatarName} size={40} /> : null}
      <View style={styles.body}>
        <Text
          style={[styles.title, { color: isDark ? colors.textInverted : colors.textPrimary }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
        {badge ? <Badge label={badge} tone={badgeTone} /> : null}
      </View>
      <View style={styles.right}>
        {meta ? (
          <Text
            style={[
              styles.meta,
              { color: metaTone ? toneToColor(metaTone) : colors.textSecondary },
            ]}
            numberOfLines={1}
          >
            {meta}
          </Text>
        ) : null}
        {onPress ? (
          <Ionicons name={rightIcon} size={18} color={colors.textMuted} />
        ) : null}
      </View>
    </Wrap>
  )
}

function toneToColor(tone: Tone): string {
  switch (tone) {
    case 'success':
      return colors.success
    case 'warning':
      return colors.warning
    case 'danger':
      return colors.danger
    case 'info':
      return colors.info
    case 'brand':
      return colors.brand
    default:
      return colors.textSecondary
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
  },
  right: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  meta: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
})
