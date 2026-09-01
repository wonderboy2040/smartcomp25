/**
 * Invoice detail screen — full invoice view with items table,
 * totals breakdown, payment status, and print/WhatsApp share buttons.
 *
 * Data: GET /api/invoices/:id
 */

import { ScrollView, View, Text, StyleSheet, Linking, Alert, Share } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useInvoice } from '@/hooks/useApi'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Card } from '@/components/Card'
import { Badge, toneForStatus } from '@/components/Badge'
import { Button } from '@/components/Button'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ErrorView } from '@/components/ErrorView'
import { colors, fontSizes, fontWeights, radii, spacing } from '@/lib/theme'
import { formatINR, formatDate, maskPhone } from '@/lib/format'
import { useColorScheme } from 'react-native'
import { useState, useCallback } from 'react'

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const { data, isLoading, isError, error, refetch } = useInvoice(id)

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
        <LoadingSpinner label="Loading invoice…" full />
      </View>
    )
  }
  if (isError && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
        <ErrorView title="Invoice not found" message={(error as any)?.message || 'Network error'} onRetry={() => void refetch()} />
      </View>
    )
  }
  if (!data) return null

  const onShare = useCallback(async () => {
    const text = `Invoice ${data.invoiceNumber} for ${data.customerName} — Total ${formatINR(data.grandTotal)} (${data.paymentStatus}).`
    try {
      await Share.share({ message: text })
    } catch {
      Alert.alert('Share failed')
    }
  }, [data])

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
      <ScreenHeader
        title={data.invoiceNumber}
        subtitle={formatDate(data.date)}
        onBack={() => router.back()}
        right={
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <IconBtn icon="share-outline" onPress={onShare} />
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      >
        <Card padding="lg">
          <View style={styles.rowBetween}>
            <View>
              <Text style={[styles.label, { color: colors.textMuted }]}>Customer</Text>
              <Text style={[styles.value, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
                {data.customerName || 'Walk-in customer'}
              </Text>
              {data.customerPhone ? <Text style={[styles.sub, { color: colors.textMuted }]}>{maskPhone(data.customerPhone)}</Text> : null}
            </View>
            <Badge label={data.paymentStatus} tone={toneForStatus(data.paymentStatus)} />
          </View>
        </Card>

        <Card padding="lg" style={{ marginTop: spacing.md }}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Items ({data.items?.length ?? 0})</Text>
          <View style={{ marginTop: spacing.sm }}>
            {data.items?.map((item, i) => (
              <View key={i} style={[styles.itemRow, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.itemName, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.description ? <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text> : null}
                  <Text style={styles.itemQty}>Qty {item.qty} × {formatINR(item.rate, true)}</Text>
                </View>
                <Text style={[styles.itemTotal, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
                  {formatINR(item.total)}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card padding="lg" style={{ marginTop: spacing.md }}>
          <Row label="Subtotal" value={formatINR(data.subtotal)} isDark={isDark} />
          {data.totalDiscount > 0 ? <Row label="Discount" value={`- ${formatINR(data.totalDiscount)}`} isDark={isDark} /> : null}
          <Row label="Tax" value={formatINR(data.totalTax)} isDark={isDark} />
          <View style={styles.divider} />
          <Row label="Grand Total" value={formatINR(data.grandTotal)} bold isDark={isDark} />
          <View style={styles.divider} />
          <Row label="Paid" value={formatINR(data.paidAmount)} tone="success" isDark={isDark} />
          <Row label="Balance Due" value={formatINR(data.balanceDue)} tone={data.balanceDue > 0 ? 'danger' : 'success'} isDark={isDark} />
        </Card>

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
          <Button label="WhatsApp" variant="outline" full onPress={onShare} />
          <Button label="Print" variant="primary" full onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`Invoice ${data.invoiceNumber} ${formatINR(data.grandTotal)}`)}`)} />
        </View>
      </ScrollView>
    </View>
  )
}

function IconBtn({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const isDark = useColorScheme() === 'dark'
  return (
    <View
      style={[iconStyles.wrap, { backgroundColor: isDark ? colors.surfaceMutedDark : colors.surfaceMuted }]}
      onTouchEnd={onPress}
    >
      <Ionicons name={icon} size={18} color={isDark ? colors.textInverted : colors.textPrimary} />
    </View>
  )
}

function Row({ label, value, bold, tone, isDark }: { label: string; value: string; bold?: boolean; tone?: 'success' | 'danger'; isDark: boolean }) {
  const color = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : (bold ? (isDark ? colors.textInverted : colors.textPrimary) : colors.textSecondary)
  return (
    <View style={rowStyles.wrap}>
      <Text style={[rowStyles.label, bold && { fontWeight: fontWeights.semibold, fontSize: fontSizes.md }, { color: bold ? (isDark ? colors.textInverted : colors.textPrimary) : colors.textSecondary }]}>{label}</Text>
      <Text style={[rowStyles.value, bold && { fontSize: fontSizes.lg, fontWeight: fontWeights.bold }, { color }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  label: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  sub: {
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  itemDesc: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  itemQty: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: 4,
  },
  itemTotal: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
})

const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: fontSizes.sm,
  },
  value: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
})

const iconStyles = StyleSheet.create({
  wrap: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
