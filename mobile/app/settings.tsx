/**
 * Settings screen — server URL, theme mode, push notifications,
 * offline queue management, version info.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  Switch,
  Share,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { colors, fontSizes, fontWeights, radii, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'
import { useAuth } from '@/hooks/useAuth'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { pingBackend } from '@/lib/auth'
import { getServerUrl, setServerUrl, getCompileTimeServerUrl } from '@/lib/config'
import { clearAll as clearCache } from '@/lib/storage'

export default function SettingsScreen() {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { logout } = useAuth()
  const { size, entries, flush, clear } = useOfflineSync()
  const push = usePushNotifications()
  const [serverUrl, setServerUrlState] = useState<string>('')
  const [editingUrl, setEditingUrl] = useState(false)
  const [draftUrl, setDraftUrl] = useState('')
  const [pinging, setPinging] = useState(false)
  const [darkMode, setDarkMode] = useState<'system' | 'light' | 'dark'>('system')

  useEffect(() => {
    void loadUrl()
  }, [])

  const loadUrl = useCallback(async () => {
    const u = await getServerUrl()
    setServerUrlState(u)
    setDraftUrl(u)
  }, [])

  const saveUrl = useCallback(async () => {
    await setServerUrl(draftUrl)
    setServerUrlState(draftUrl)
    setEditingUrl(false)
    Alert.alert('Server URL updated', 'The app will use this URL for all API calls.')
  }, [draftUrl])

  const resetUrl = useCallback(async () => {
    await setServerUrl('')
    const fallback = getCompileTimeServerUrl()
    setServerUrlState(fallback)
    setDraftUrl(fallback)
    setEditingUrl(false)
    Alert.alert('Reset to default', `Server URL reset to ${fallback}`)
  }, [])

  const handlePing = useCallback(async () => {
    setPinging(true)
    const res = await pingBackend()
    setPinging(false)
    Alert.alert(res.ok ? '✓ Server reachable' : '✗ Server unreachable', res.ok ? res.message || 'OK' : res.message || 'Failed', [{ text: 'OK' }])
  }, [])

  const handleFlush = useCallback(async () => {
    const res = await flush()
    Alert.alert('Offline queue flushed', `${res.flushed} synced, ${res.failed} dropped after retries`)
  }, [flush])

  const handleClearQueue = useCallback(() => {
    Alert.alert('Clear offline queue?', `${size} pending writes will be discarded.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void clear() },
    ])
  }, [size, clear])

  const handleClearCache = useCallback(() => {
    Alert.alert('Clear cache?', 'All cached API responses will be removed. You will need to re-fetch data on next open.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        await clearCache()
        Alert.alert('Cache cleared')
      } },
    ])
  }, [])

  const handleSharePushToken = useCallback(async () => {
    if (!push.token) {
      Alert.alert('No push token', 'Push notifications not registered. Try restarting the app on a physical device.')
      return
    }
    try {
      await Share.share({ message: push.token })
    } catch {
      Alert.alert('Share failed')
    }
  }, [push])

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
      <ScreenHeader title="Settings" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: insets.bottom + 100 }}>
        {/* Backend */}
        <Card padding="lg">
          <SectionTitle>Backend Connection</SectionTitle>
          <Text style={styles.hint}>SmartComp mobile talks to your deployed web backend. Change this URL to point at a different deployment (production, staging, or LAN dev server).</Text>
          {editingUrl ? (
            <View style={[styles.urlInput, { borderColor: isDark ? colors.borderDark : colors.border, backgroundColor: isDark ? colors.surfaceMutedDark : colors.surfaceMuted }]}>
              <TextInput
                value={draftUrl}
                onChangeText={setDraftUrl}
                placeholder="https://smartcomp.shop"
                placeholderTextColor={colors.textMuted}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.urlField, { color: isDark ? colors.textInverted : colors.textPrimary }]}
              />
            </View>
          ) : (
            <Text style={[styles.serverUrl, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
              {serverUrl || '(default)'}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            {editingUrl ? (
              <>
                <Button label="Save" onPress={saveUrl} full size="sm" />
                <Button label="Reset" onPress={resetUrl} variant="outline" size="sm" />
                <Button label="Cancel" onPress={() => { setEditingUrl(false); setDraftUrl(serverUrl) }} variant="ghost" size="sm" />
              </>
            ) : (
              <>
                <Button label="Edit" onPress={() => setEditingUrl(true)} variant="outline" size="sm" />
                <Button label={pinging ? 'Pinging…' : 'Test connection'} onPress={handlePing} size="sm" />
              </>
            )}
          </View>
        </Card>

        {/* Push notifications */}
        <Card padding="lg" style={{ marginTop: spacing.md }}>
          <SectionTitle>Push Notifications</SectionTitle>
          <Row label="Status" value={push.registered ? 'Registered' : push.error || 'Pending'} tone={push.registered ? 'success' : push.error ? 'danger' : 'warning'} />
          <Row label="Permission" value={push.permissionStatus} tone={push.permissionStatus === 'granted' ? 'success' : 'danger'} />
          <Row label="Token" value={push.token ? `${push.token.slice(0, 18)}…` : '—'} />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <Button label="Copy token" onPress={handleSharePushToken} variant="outline" size="sm" disabled={!push.token} />
          </View>
        </Card>

        {/* Appearance */}
        <Card padding="lg" style={{ marginTop: spacing.md }}>
          <SectionTitle>Appearance</SectionTitle>
          <View style={styles.appearanceRow}>
            <View>
              <Text style={[styles.rowLabel, { color: isDark ? colors.textInverted : colors.textPrimary }]}>Dark mode</Text>
              <Text style={styles.rowSub}>Follow system, always light, or always dark</Text>
            </View>
            <Switch
              value={darkMode === 'dark'}
              onValueChange={(v) => setDarkMode(v ? 'dark' : 'system')}
              trackColor={{ false: colors.border, true: colors.brand }}
            />
          </View>
        </Card>

        {/* Offline queue */}
        <Card padding="lg" style={{ marginTop: spacing.md }}>
          <SectionTitle>Offline Queue {size > 0 ? <Text style={{ color: colors.warning, fontWeight: fontWeights.bold }}>· {size}</Text> : null}</SectionTitle>
          <Text style={styles.hint}>
            {size === 0
              ? 'No pending writes. New writes will be queued automatically when offline.'
              : `${size} writes are pending. They will be replayed on next foreground.`}
          </Text>
          {size > 0 && entries.slice(0, 3).map((e) => (
            <View key={e.id} style={styles.queueRow}>
              <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
              <Text style={[styles.queuePath, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
                {e.method} {e.path}
              </Text>
              <Text style={styles.queueRetry}>×{e.retryCount}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <Button label="Flush now" onPress={handleFlush} full size="sm" disabled={size === 0} />
            <Button label="Clear queue" onPress={handleClearQueue} variant="ghost" size="sm" disabled={size === 0} />
          </View>
        </Card>

        {/* Cache */}
        <Card padding="lg" style={{ marginTop: spacing.md }}>
          <SectionTitle>Cache</SectionTitle>
          <Text style={styles.hint}>Cached API responses are stored locally so the app works offline. Clearing forces re-fetch on next open.</Text>
          <Button label="Clear cache" onPress={handleClearCache} variant="outline" size="sm" />
        </Card>

        {/* About */}
        <Card padding="lg" style={{ marginTop: spacing.md }}>
          <SectionTitle>About</SectionTitle>
          <Row label="App version" value="1.0.0" />
          <Row label="Expo SDK" value="52" />
          <Row label="Backend" value={serverUrl} />
          <Row label="Platform" value={Platform.OS || 'Unknown'} />
        </Card>

        {/* Sign out */}
        <View style={{ marginTop: spacing.lg }}>
          <Button label="Sign out" onPress={logout} variant="danger" full size="lg" />
        </View>
      </ScrollView>
    </View>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text style={sectionStyles.title}>
      {children}
    </Text>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' | 'warning' }) {
  const isDark = useColorScheme() === 'dark'
  const color = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : (isDark ? colors.textInverted : colors.textPrimary)
  return (
    <View style={rowStyles.wrap}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, { color }]} numberOfLines={2}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  serverUrl: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    fontFamily: 'Courier',
    marginBottom: spacing.sm,
  },
  urlInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    marginBottom: spacing.sm,
  },
  urlField: {
    flex: 1,
    fontSize: fontSizes.md,
    padding: 0,
  },
  appearanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLabel: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  rowSub: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  queuePath: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    minWidth: 0,
  },
  queueRetry: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
  },
})

const sectionStyles = StyleSheet.create({
  title: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
})

const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: 6,
  },
  label: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  value: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    flex: 1,
    textAlign: 'right',
  },
})
