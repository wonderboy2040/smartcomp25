/**
 * Root layout — auth gate + global providers.
 *
 * Order of providers:
 *   1. SafeAreaProvider  (from react-native-safe-area-context)
 *   2. QueryClientProvider (React Query)
 *   3. AuthProvider (PIN-based auth)
 *
 * Then we route based on `status.authenticated`:
 *   - loading       → Splash
 *   - not authed    → /login
 *   - authed        → /(tabs)/...
 */

import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { Stack, Redirect } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useEffect, useState } from 'react'
import { colors } from '@/lib/theme'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { initAuthCookie } from '@/lib/api'

// Single shared QueryClient — keeps the cache alive across screen mounts.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function AuthGate() {
  const { status, loading } = useAuth()

  // Wait for the auth bootstrap to finish before deciding where to route.
  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    )
  }

  // If the backend has a PIN set AND we're not authenticated, force
  // the login screen.
  if (status.pinRequired && !status.authenticated) {
    return <Redirect href="/login" />
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ gestureEnabled: false }} />
      <Stack.Screen name="invoice/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="invoice/new" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="customer/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="job/new" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="barcode" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="+not-found" options={{ headerShown: false }} />
    </Stack>
  )
}

export default function RootLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await initAuthCookie()
      } catch {
        // ignore — SecureStore may be unavailable on web preview
      }
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="auto" />
            <AuthGate />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
})
