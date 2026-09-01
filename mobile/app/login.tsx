/**
 * Login screen — PIN entry.
 *
 * Mirrors the web app's PIN auth: POST /api/auth/login { pin }
 * → backend sets HttpOnly smartcomp_auth cookie (30-day) →
 * mobile captures the cookie via api.ts interceptor + persists it
 * in SecureStore.
 *
 * UX:
 *   - 4-8 digit PIN entered via a numeric keyboard
 *   - "Show PIN" toggle for visibility
 *   - Shake + red border on wrong PIN
 *   - Rate-limit hint (5 attempts / minute) — surfaced when backend
 *     returns 429
 */

import { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/Button'
import { colors, fontSizes, fontWeights, radii, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'
import { hapticError } from '@/lib/haptics'
import { getServerUrl, setServerUrl } from '@/lib/config'

export default function LoginScreen() {
  const { login } = useAuth()
  const isDark = useColorScheme() === 'dark'
  const params = useLocalSearchParams<{ next?: string }>()

  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverUrl, setServerUrlState] = useState<string>('')
  const [showServerConfig, setShowServerConfig] = useState(false)
  const shakeAnim = useRef(new Animated.Value(0)).current

  // If the backend has no APP_PIN set, there is no auth required —
  // skip login automatically. The auth gate in _layout.tsx handles
  // the actual redirect, so we don't need to do anything here.

  useEffect(() => {
    void getServerUrl().then(setServerUrlState)
  }, [])

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start()
  }

  const handleSubmit = async () => {
    setError(null)
    if (pin.length < 4 || pin.length > 8) {
      setError('PIN must be 4-8 digits')
      hapticError()
      triggerShake()
      return
    }
    setSubmitting(true)
    const res = await login(pin)
    setSubmitting(false)
    if (!res.success) {
      setError(res.error || 'Login failed')
      hapticError()
      triggerShake()
      return
    }
    // On success, redirect back to the (tabs) layout — or wherever
    // the user was originally trying to go.
    const next = params.next as string | undefined
    if (next) {
      try {
        router.replace(next as any)
      } catch {
        router.replace('/(tabs)')
      }
    } else {
      router.replace('/(tabs)')
    }
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.container}>
          <View style={styles.hero}>
            <View style={styles.logo}>
              <Ionicons name="cube-sharp" size={40} color={colors.textInverted} />
            </View>
            <Text style={[styles.title, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
              SmartComp
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Sales &amp; Service Panel
            </Text>
          </View>

          <Animated.View style={{ transform: [{ translateX: shakeAnim }], width: '100%' }}>
            <Text
              style={[styles.label, { color: isDark ? colors.textInverted : colors.textSecondary }]}
            >
              Enter your PIN
            </Text>
            <View
              style={[
                styles.inputWrap,
                {
                  backgroundColor: isDark ? colors.surfaceDark : colors.surface,
                  borderColor: error ? colors.danger : isDark ? colors.borderDark : colors.border,
                },
              ]}
            >
              <Ionicons
                name="keypad-outline"
                size={18}
                color={colors.textMuted}
                style={{ marginRight: spacing.sm }}
              />
              <TextInput
                value={pin}
                onChangeText={(t) => {
                  setPin(t.replace(/[^0-9]/g, '').slice(0, 8))
                  setError(null)
                }}
                placeholder="••••"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                secureTextEntry={!showPin}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                style={[styles.input, { color: isDark ? colors.textInverted : colors.textPrimary }]}
                autoFocus
              />
              <TouchableOpacity
                onPress={() => setShowPin((v) => !v)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showPin ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Animated.View>

          <Button
            label="Unlock"
            onPress={handleSubmit}
            loading={submitting}
            full
            size="lg"
            style={{ marginTop: spacing.lg }}
          />

          <TouchableOpacity
            onPress={() => setShowServerConfig((v) => !v)}
            style={styles.serverToggle}
          >
            <Ionicons
              name="server-outline"
              size={14}
              color={colors.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.serverToggleText}>
              {showServerConfig ? 'Hide' : 'Configure'} server
            </Text>
          </TouchableOpacity>
          {showServerConfig ? (
            <ServerConfigField initialUrl={serverUrl} onSaved={setServerUrlState} />
          ) : null}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Connected to{' '}
              <Text style={styles.footerUrl} numberOfLines={1}>
                {serverUrl || '(default)'}
              </Text>
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function ServerConfigField({
  initialUrl,
  onSaved,
}: {
  initialUrl: string
  onSaved: (url: string) => void
}) {
  const [url, setUrl] = useState(initialUrl)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true)
    await setServerUrl(url)
    setSaving(false)
    setSaved(true)
    onSaved(url)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <View
      style={[
        styles.inputWrap,
        { backgroundColor: colors.surfaceMuted, borderColor: colors.border, marginTop: spacing.sm },
      ]}
    >
      <Ionicons name="globe-outline" size={18} color={colors.textMuted} style={{ marginRight: spacing.sm }} />
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="https://smartcomp.shop"
        placeholderTextColor={colors.textMuted}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: colors.textPrimary, flex: 1 }]}
      />
      <TouchableOpacity onPress={save} disabled={saving} style={styles.saveBtn}>
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : saved ? 'Saved' : 'Save'}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: 60,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    fontSize: fontSizes.md,
    marginTop: 4,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    marginBottom: spacing.xs,
    marginLeft: 4,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 56,
  },
  input: {
    flex: 1,
    fontSize: fontSizes.lg,
    padding: 0,
    height: 56,
    letterSpacing: 4,
  },
  eyeIcon: {
    paddingHorizontal: spacing.xs,
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
    marginLeft: 4,
  },
  serverToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    alignSelf: 'center',
  },
  serverToggleText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  saveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.brand,
    borderRadius: radii.sm,
  },
  saveBtnText: {
    color: colors.textInverted,
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes.sm,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  footerUrl: {
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
})
