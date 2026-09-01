/**
 * 404 screen — shown when the user navigates to an unknown route.
 */

import { View, Text, StyleSheet } from 'react-native'
import { Link } from 'expo-router'
import { Button } from '@/components/Button'
import { colors, fontSizes, fontWeights, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export default function NotFoundScreen() {
  const isDark = useColorScheme() === 'dark'
  return (
    <View style={[styles.wrap, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
      <Ionicons name="warning-outline" size={64} color={colors.warning} />
      <Text style={[styles.title, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
        Page not found
      </Text>
      <Text style={styles.message}>
        We couldn't find what you were looking for.
      </Text>
      <Link href="/(tabs)" asChild>
        <Button label="Go to Dashboard" full size="lg" style={{ marginTop: spacing.lg }} />
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    marginTop: spacing.lg,
  },
  message: {
    fontSize: fontSizes.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
})
