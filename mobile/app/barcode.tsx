/**
 * Barcode scanner screen — opens the camera + recognises EAN-13,
 * EAN-8, UPC-A, Code-128, QR. On a successful scan, looks up the
 * item via /api/items?search=<barcode> and navigates to the invoice
 * create screen with the item pre-selected (or shows a "not found"
 * alert so the user can add a new item).
 *
 * Permission: CAMERA — requested via expo-barcode-scanner on mount.
 */

import { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { BarCodeScanner } from 'expo-barcode-scanner'
import { ScreenHeader } from '@/components/ScreenHeader'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Button } from '@/components/Button'
import { colors, fontSizes, fontWeights, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'
import { apiGet } from '@/lib/api'
import { hapticSuccess } from '@/lib/haptics'
import type { Item } from '@/types'

export default function BarcodeScreen() {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [scanned, setScanned] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { status } = await BarCodeScanner.requestPermissionsAsync()
        if (!cancelled) setHasPermission(status === 'granted')
      } catch (e) {
        if (!cancelled) setHasPermission(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      setScanned(true)
      hapticSuccess()
      try {
        const items = await apiGet<Item[]>('/api/items', { search: data })
        if (items && items.length > 0) {
          Alert.alert(
            'Item found',
            `${items[0]!.name} — ${items[0]!.sellingPrice}`,
            [
              { text: 'Add to invoice', onPress: () => router.replace({ pathname: '/invoice/new', params: { itemId: items[0]!.id } } as any) },
              { text: 'Scan again', onPress: () => setScanned(false) },
            ]
          )
        } else {
          Alert.alert(
            'No match',
            `No item with barcode "${data}". Open the web app to add it to inventory.`,
            [
              { text: 'Scan again', onPress: () => setScanned(false) },
              { text: 'Close', onPress: () => router.back() },
            ]
          )
        }
      } catch (e: any) {
        Alert.alert('Lookup failed', e?.message || 'Network error', [
          { text: 'Scan again', onPress: () => setScanned(false) },
          { text: 'Close', onPress: () => router.back() },
        ])
      }
    },
    [router]
  )

  if (hasPermission === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.backgroundDark }}>
        <LoadingSpinner label="Requesting camera permission…" full />
      </View>
    )
  }
  if (hasPermission === false) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.backgroundDark, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl }}>
        <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
        <Text style={[styles.title, { color: colors.textInverted }]}>Camera access denied</Text>
        <Text style={styles.message}>
          SmartComp needs camera access to scan barcodes. Open your device Settings → SmartComp → enable Camera, then re-open this screen.
        </Text>
        <Button label="Go back" onPress={() => router.back()} variant="outline" size="lg" style={{ marginTop: spacing.lg }} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundDark }}>
      <BarCodeScanner
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.overlay, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textInverted} />
          </TouchableOpacity>
          <Text style={styles.title}>Scan barcode</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.targetFrame}>
          <View style={styles.cornerTL} />
          <View style={styles.cornerTR} />
          <View style={styles.cornerBL} />
          <View style={styles.cornerBR} />
        </View>
        <Text style={styles.hint}>
          {scanned ? 'Looking up item…' : 'Aim the camera at a barcode'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textInverted,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  targetFrame: {
    width: 260,
    height: 160,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 32,
    height: 32,
    borderTopColor: colors.brand,
    borderTopWidth: 3,
    borderLeftColor: colors.brand,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 32,
    height: 32,
    borderTopColor: colors.brand,
    borderTopWidth: 3,
    borderRightColor: colors.brand,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 32,
    height: 32,
    borderBottomColor: colors.brand,
    borderBottomWidth: 3,
    borderLeftColor: colors.brand,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderBottomColor: colors.brand,
    borderBottomWidth: 3,
    borderRightColor: colors.brand,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  hint: {
    color: colors.textInverted,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
  },
  message: {
    color: colors.textMuted,
    fontSize: fontSizes.md,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 22,
  },
})
