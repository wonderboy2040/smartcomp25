/**
 * ScreenHeader — sticky header for non-tab screens.
 * Left: back button. Center: title. Right: optional action.
 */

import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontSizes, fontWeights, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface ScreenHeaderProps {
  title: string
  onBack?: () => void
  right?: React.ReactNode
  subtitle?: string
}

export function ScreenHeader({ title, onBack, right, subtitle }: ScreenHeaderProps) {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: isDark ? colors.surfaceDark : colors.surface,
          paddingTop: Platform.OS === 'ios' ? insets.top + 6 : 8,
          borderBottomColor: isDark ? colors.borderDark : colors.border,
        },
      ]}
    >
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={isDark ? colors.textInverted : colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.titleWrap}>
          <Text style={[styles.title, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  back: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  right: {
    minWidth: 32,
    alignItems: 'flex-end',
  },
})
