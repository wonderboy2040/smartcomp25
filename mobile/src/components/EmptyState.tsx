/**
 * EmptyState — friendly "no data" view.
 */

import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontSizes, fontWeights, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'

interface EmptyStateProps {
  title: string
  message?: string
  icon?: keyof typeof Ionicons.glyphMap
  action?: React.ReactNode
}

export function EmptyState({ title, message, icon = 'folder-open-outline', action }: EmptyStateProps) {
  const isDark = useColorScheme() === 'dark'
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={48} color={colors.textMuted} />
      </View>
      <Text style={[styles.title, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
        {title}
      </Text>
      {message ? (
        <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    minHeight: 240,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.textMuted}11`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSizes.md,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  action: {
    marginTop: spacing.lg,
  },
})
