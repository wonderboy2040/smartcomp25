/**
 * Customer detail screen — basic info + merged statement.
 *
 * Data:
 *   - GET /api/customers/:id
 *   - GET /api/customer-statements?customerId=:id (merged ledger)
 *
 * The merged statement tab pulls invoices + service jobs + payments
 * into a single running-balance table — same as the web app's
 * CustomerStatements panel.
 */

import { ScrollView, View, Text, StyleSheet, Linking, RefreshControl, TouchableOpacity } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useCustomer, useCustomerStatement } from '@/hooks/useApi'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Card } from '@/components/Card'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ErrorView } from '@/components/ErrorView'
import { EmptyState } from '@/components/EmptyState'
import { Avatar } from '@/components/Avatar'
import { colors, fontSizes, fontWeights, spacing } from '@/lib/theme'
import { formatINR, formatDate, maskPhone } from '@/lib/format'
import { useColorScheme } from 'react-native'
import { useState, useCallback } from 'react'
import type { CustomerStatementRow } from '@/types'

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const customerQ = useCustomer(id)
  const statementQ = useCustomerStatement(id)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([customerQ.refetch(), statementQ.refetch()])
    setRefreshing(false)
  }, [customerQ, statementQ])

  if (customerQ.isLoading && !customerQ.data) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
        <LoadingSpinner label="Loading customer…" full />
      </View>
    )
  }
  if (customerQ.isError && !customerQ.data) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
        <ErrorView title="Customer not found" message={(customerQ.error as any)?.message || 'Network error'} onRetry={() => void customerQ.refetch()} />
      </View>
    )
  }

  const c = customerQ.data
  const stmt = statementQ.data

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
      <ScreenHeader title={c?.name || 'Customer'} onBack={() => router.back()} subtitle={maskPhone(c?.phone)} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Header card */}
        <Card padding="lg">
          <View style={styles.headerRow}>
            <Avatar name={c?.name} size={56} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.custName, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
                {c?.name || 'Unknown'}
              </Text>
              <Text style={[styles.custPhone, { color: colors.textMuted }]}>{maskPhone(c?.phone)}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <ActionBtn icon="call-outline" onPress={() => Linking.openURL(`tel:${c?.phone}`)} />
              <ActionBtn icon="logo-whatsapp" onPress={() => Linking.openURL(`https://wa.me/91${(c?.phone || '').replace(/\D/g, '').slice(-10)}`)} />
            </View>
          </View>
          {(c?.address || c?.email || c?.gstin) ? (
            <View style={styles.meta}>
              {c.address ? <Text style={styles.metaText}>📍 {c.address}</Text> : null}
              {c.email ? <Text style={styles.metaText}>✉ {c.email}</Text> : null}
              {c.gstin ? <Text style={styles.metaText}>GSTIN: {c.gstin}</Text> : null}
            </View>
          ) : null}
          <View style={styles.balanceRow}>
            <BalanceCard label="Credit Balance" value={formatINR(c?.creditBalance)} tone={Number(c?.creditBalance) > 0 ? 'warning' : 'success'} />
            <BalanceCard label="Credit Limit" value={formatINR(c?.creditLimit)} tone="info" />
            <BalanceCard label="Invoices" value={String(c?._count?.invoices ?? 0)} tone="brand" />
          </View>
        </Card>

        {/* Statement */}
        <Card padding="md" style={{ marginTop: spacing.md }}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
              Customer Statement
            </Text>
            <Text style={styles.sectionSub}>Merged ledger · {stmt?.rows?.length ?? 0} entries</Text>
          </View>

          {statementQ.isLoading && !stmt ? (
            <LoadingSpinner label="Loading statement…" />
          ) : statementQ.isError && !stmt ? (
            <ErrorView message="Could not load statement" onRetry={() => void statementQ.refetch()} />
          ) : !stmt || stmt.rows.length === 0 ? (
            <EmptyState title="No entries" message="This customer has no invoices, payments, or service jobs" icon="document-text-outline" />
          ) : (
            <>
              <View style={styles.summaryRow}>
                <SummaryCell label="Opening" value={formatINR(stmt.openingBalance)} />
                <SummaryCell label="Debit (+)" value={formatINR(stmt.totalDebit)} tone="danger" />
                <SummaryCell label="Credit (−)" value={formatINR(stmt.totalCredit)} tone="success" />
                <SummaryCell label="Closing" value={formatINR(stmt.closingBalance)} bold tone={Number(stmt.closingBalance) > 0 ? 'warning' : 'success'} />
              </View>
              <View style={styles.ledgerHeader}>
                <Text style={styles.ledgerCol1}>Date</Text>
                <Text style={styles.ledgerCol2}>Description</Text>
                <Text style={[styles.ledgerCol3, { color: colors.danger }]}>Debit</Text>
                <Text style={[styles.ledgerCol4, { color: colors.success }]}>Credit</Text>
              </View>
              {stmt.rows.map((row, i) => (
                <LedgerRow key={i} row={row} />
              ))}
            </>
          )}
        </Card>
      </ScrollView>
    </View>
  )
}

function ActionBtn({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const isDark = useColorScheme() === 'dark'
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[actionStyles.wrap, { backgroundColor: isDark ? colors.surfaceMutedDark : colors.surfaceMuted }]}
    >
      <Ionicons name={icon} size={18} color={isDark ? colors.textInverted : colors.textPrimary} />
    </TouchableOpacity>
  )
}

function BalanceCard({ label, value, tone }: { label: string; value: string; tone: 'success' | 'warning' | 'info' | 'brand' }) {
  const toneColor = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'info' ? colors.info : colors.brand
  return (
    <View style={balanceStyles.wrap}>
      <Text style={[balanceStyles.value, { color: toneColor }]}>{value}</Text>
      <Text style={balanceStyles.label}>{label}</Text>
    </View>
  )
}

function SummaryCell({ label, value, tone, bold }: { label: string; value: string; tone?: 'success' | 'danger' | 'warning'; bold?: boolean }) {
  const color = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.textPrimary
  return (
    <View style={summaryStyles.cell}>
      <Text style={[summaryStyles.value, { color, fontWeight: bold ? fontWeights.bold : fontWeights.semibold }]}>{value}</Text>
      <Text style={summaryStyles.label}>{label}</Text>
    </View>
  )
}

function LedgerRow({ row }: { row: CustomerStatementRow }) {
  const isDark = useColorScheme() === 'dark'
  return (
    <View style={[ledgerStyles.row, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
      <Text style={ledgerStyles.col1}>{formatDate(row.date, 'short').split(' ').slice(0, 2).join(' ')}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[ledgerStyles.desc, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
          {row.description}
        </Text>
        <Text style={ledgerStyles.ref} numberOfLines={1}>{row.reference}</Text>
      </View>
      <Text style={[ledgerStyles.col3, { color: colors.danger }]}>{row.debit > 0 ? formatINR(row.debit) : '—'}</Text>
      <Text style={[ledgerStyles.col4, { color: colors.success }]}>{row.credit > 0 ? formatINR(row.credit) : '—'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  custName: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  custPhone: {
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  meta: {
    gap: 4,
    marginBottom: spacing.md,
  },
  metaText: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  balanceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sectionHeader: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  sectionSub: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  ledgerHeader: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 4,
  },
  ledgerCol1: { width: 50, fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.textSecondary },
  ledgerCol2: { flex: 1, fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.textSecondary },
  ledgerCol3: { width: 70, fontSize: fontSizes.xs, fontWeight: fontWeights.bold, textAlign: 'right' },
  ledgerCol4: { width: 70, fontSize: fontSizes.xs, fontWeight: fontWeights.bold, textAlign: 'right' },
})

const actionStyles = StyleSheet.create({
  wrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

const balanceStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: spacing.sm,
    alignItems: 'center',
  },
  value: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  label: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
})

const summaryStyles = StyleSheet.create({
  cell: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    fontSize: fontSizes.sm,
  },
  label: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
})

const ledgerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  col1: { width: 50, fontSize: fontSizes.xs, color: colors.textMuted },
  col3: { width: 70, fontSize: fontSizes.xs, fontWeight: fontWeights.semibold, textAlign: 'right' },
  col4: { width: 70, fontSize: fontSizes.xs, fontWeight: fontWeights.semibold, textAlign: 'right' },
  desc: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  ref: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
})
