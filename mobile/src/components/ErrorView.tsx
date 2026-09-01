/**
 * ErrorView — error state with a retry button.
 */

import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Button } from './Button'
import { colors, fontSizes, fontWeights, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'

interface ErrorViewProps {
  title?: string
  message?: string
  onRetry?: () => void
  icon?: keyof typeof Ionicons.glyphMap
}

export function ErrorView({
  title = 'Something went wrong',
  message = 'Please try again',
  onRetry,
  icon = 'alert-circle-outline',
}: ErrorViewProps) {
  const isDark = useColorScheme() === 'dark'
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={48} color={colors.danger} />
      </View>
      <Text style={[styles.title, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
        {title}
      </Text>
      <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
      {onRetry ? (
        <View style={styles.action}>
          <Button label="Retry" onPress={onRetry} variant="outline" size="md" />
        </View>
      ) : null}
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
    backgroundColor: `${colors.danger}11`,
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
