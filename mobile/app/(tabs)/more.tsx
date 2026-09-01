/**
 * More tab — catch-all menu for secondary screens + offline queue + about.
 *
 * Sections:
 *   - Customers (link to a customer search screen — uses /api/customers)
 *   - Reports (read-only summary of the web app's most common report links)
 *   - Settings (server URL, PIN change, theme, push notifications, offline queue)
 *   - About (version, backend health)
 */

import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Card } from '@/components/Card'
import { colors, fontSizes, fontWeights, radii, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'
import { useAuth } from '@/hooks/useAuth'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { useState, useCallback } from 'react'
import { pingBackend } from '@/lib/auth'
import { getServerUrl } from '@/lib/config'

export default function MoreScreen() {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { logout } = useAuth()
  const { size: offlineSize, entries, flush, clear, isFlushing } = useOfflineSync()
  const [serverUrl, setServerUrl] = useState<string>('')
  const [pinging, setPinging] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadServerUrl = useCallback(async () => {
    setServerUrl(await getServerUrl())
  }, [])

  const handlePing = useCallback(async () => {
    setPinging(true)
    const res = await pingBackend()
    setPinging(false)
    Alert.alert(res.ok ? '✓ Server reachable' : '✗ Server unreachable', res.ok ? res.message || 'OK' : res.message || 'Failed', [{ text: 'OK' }])
  }, [])

  const handleFlush = useCallback(async () => {
    const res = await flush()
    Alert.alert(
      'Offline queue flushed',
      `${res.flushed} synced, ${res.failed} dropped after retries`,
      [{ text: 'OK' }]
    )
  }, [flush])

  const handleClear = useCallback(() => {
    Alert.alert(
      'Clear offline queue?',
      `${offlineSize} pending writes will be discarded.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => void clear() },
      ]
    )
  }, [offlineSize, clear])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadServerUrl()
    setRefreshing(false)
  }, [loadServerUrl])

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
    >
      <Text style={[styles.title, { color: isDark ? colors.textInverted : colors.textPrimary }]}>More</Text>
      <Text style={styles.subtitle}>Customers · Reports · Settings · About</Text>

      <Card padding="md" style={{ marginTop: spacing.lg }}>
        <SectionTitle>Quick links</SectionTitle>
        <MenuItem icon="people-outline" label="Customers" subtitle="Browse and search customers" onPress={() => router.push('/customer/list' as any)} />
        <MenuItem icon="document-text-outline" label="Customer Statements" subtitle="Merged sales + service ledger" onPress={() => router.push('/customer/list' as any)} />
        <MenuItem icon="bar-chart-outline" label="Reports" subtitle="Open the full web app" onPress={() => { /* TODO: open external URL */ }} />
        <MenuItem icon="grid-outline" label="Full Web Panel" subtitle="Open in browser" onPress={() => { /* TODO: Linking.openURL(serverUrl) */ }} />
      </Card>

      <Card padding="md" style={{ marginTop: spacing.lg }}>
        <SectionTitle>Offline queue {offlineSize > 0 ? <Text style={{ color: colors.warning, fontWeight: fontWeights.bold }}>· {offlineSize}</Text> : null}</SectionTitle>
        {offlineSize === 0 ? (
          <Text style={styles.hint}>No pending writes. New writes will be queued automatically when offline.</Text>
        ) : (
          <>
            <Text style={styles.hint}>
              {offlineSize} writes are pending. They will be replayed automatically when the app next comes online.
            </Text>
            {entries.slice(0, 3).map((e) => (
              <View key={e.id} style={styles.queueRow}>
                <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.queuePath, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
                    {e.method} {e.path}
                  </Text>
                  {e.lastError ? (
                    <Text style={styles.queueErr} numberOfLines={1}>{e.lastError}</Text>
                  ) : null}
                </View>
                <Text style={styles.queueRetry}>×{e.retryCount}</Text>
              </View>
            ))}
            {entries.length > 3 ? <Text style={styles.queueMore}>+{entries.length - 3} more…</Text> : null}
          </>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <FlushBtn label={isFlushing ? 'Flushing…' : 'Flush now'} onPress={handleFlush} disabled={offlineSize === 0 || isFlushing} />
          <ClearBtn label="Clear queue" onPress={handleClear} disabled={offlineSize === 0} />
        </View>
      </Card>

      <Card padding="md" style={{ marginTop: spacing.lg }}>
        <SectionTitle>Backend connection</SectionTitle>
        <Text style={styles.hint}>Currently targeting:</Text>
        <Text style={[styles.serverUrl, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
          {serverUrl || '(loading…)'}
        </Text>
        <FlushBtn label={pinging ? 'Pinging…' : 'Test connection'} onPress={handlePing} />
      </Card>

      <Card padding="md" style={{ marginTop: spacing.lg }}>
        <SectionTitle>App settings</SectionTitle>
        <MenuItem icon="settings-outline" label="Settings" subtitle="Change server URL, theme, push" onPress={() => router.push('/settings')} />
        <MenuItem icon="information-circle-outline" label="About" subtitle="v1.0.0 · Expo 52" />
        <MenuItem icon="log-out-outline" label="Sign out" subtitle="Clear session and PIN cookie" onPress={logout} />
      </Card>
    </ScrollView>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text style={sectionStyles.title}>
      {children}
    </Text>
  )
}

function MenuItem({ icon, label, subtitle, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; subtitle?: string; onPress?: () => void }) {
  const isDark = useColorScheme() === 'dark'
  const Wrap = onPress ? TouchableOpacity : View
  return (
    <Wrap {...(onPress ? { onPress, activeOpacity: 0.7 } : {})} style={menuStyles.row}>
      <View style={[menuStyles.iconWrap, { backgroundColor: `${colors.brand}22` }]}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[menuStyles.label, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? <Text style={menuStyles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Wrap>
  )
}

function FlushBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
      style={[flushBtnStyles.wrap, disabled && { opacity: 0.5 }]}
    >
      <Text style={flushBtnStyles.label}>{label}</Text>
    </TouchableOpacity>
  )
}

function ClearBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
      style={[clearBtnStyles.wrap, disabled && { opacity: 0.5 }]}
    >
      <Text style={clearBtnStyles.label}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  title: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  serverUrl: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.md,
    fontFamily: 'Courier',
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  queuePath: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  queueErr: {
    fontSize: fontSizes.xs,
    color: colors.danger,
    marginTop: 2,
  },
  queueRetry: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
  },
  queueMore: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
})

const sectionStyles = StyleSheet.create({
  title: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
})

const menuStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
})

const flushBtnStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.textInverted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
})

const clearBtnStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.danger,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
})
