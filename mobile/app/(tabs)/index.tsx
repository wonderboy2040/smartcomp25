/**
 * Dashboard tab — KPI grid + recent activity + sales trend sparkline.
 *
 * Mirrors the web app's Dashboard panel: pulls from /api/dashboard
 * and shows:
 *   - 8 KPI tiles (today sales / month sales / pending jobs / low stock / etc.)
 *   - Recent invoices (last 5)
 *   - Recent jobs (last 5)
 *   - Low-stock alerts (top 5)
 *   - Sales trend (last 7 days) — rendered as a small bar chart
 */

import { ScrollView, View, Text, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDashboard } from '@/hooks/useApi'
import { StatCard } from '@/components/StatCard'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ErrorView } from '@/components/ErrorView'
import { EmptyState } from '@/components/EmptyState'
import { toneForStatus } from '@/components/Badge'
import { colors, fontSizes, fontWeights, spacing, radii } from '@/lib/theme'
import { formatINR, formatRelativeTime } from '@/lib/format'
import { useColorScheme } from 'react-native'
import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

export default function DashboardScreen() {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboard()
  const { logout } = useAuth()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch({ cancelRefetch: false })
    setRefreshing(false)
  }, [refetch])

  if (isLoading && !data) {
    return <LoadingSpinner label="Loading dashboard…" full />
  }
  if (isError && !data) {
    return (
      <ErrorView
        title="Could not load dashboard"
        message={(error as any)?.message || 'Network error'}
        onRetry={() => void refetch()}
      />
    )
  }

  const s = data?.stats

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing || isFetching} onRefresh={onRefresh} tintColor={colors.brand} />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.greeting, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
            {getGreeting()} 👋
          </Text>
          <Text style={[styles.greetingSub, { color: colors.textMuted }]} numberOfLines={1}>
            Here's your shop at a glance
          </Text>
        </View>
        <View style={styles.headerActions}>
          <HeaderIcon icon="settings-outline" onPress={() => router.push('/settings')} />
          <HeaderIcon icon="log-out-outline" onPress={logout} />
        </View>
      </View>

      {/* KPI Grid */}
      <View style={styles.grid}>
        <StatCard
          label="Today's Sales"
          value={formatINR(s?.monthSales ?? 0)}
          subtitle="Month"
          icon="trending-up"
          color="success"
          onPress={() => router.push('/(tabs)/sales')}
        />
        <StatCard
          label="Pending Jobs"
          value={String(s?.pendingJobs ?? 0)}
          subtitle={`${s?.highPriorityJobs ?? 0} urgent`}
          icon="construct"
          color="warning"
          onPress={() => router.push('/(tabs)/service')}
        />
        <StatCard
          label="Low Stock"
          value={String(s?.lowStockCount ?? 0)}
          subtitle="items"
          icon="warning"
          color="danger"
          onPress={() => router.push('/(tabs)/inventory')}
        />
        <StatCard
          label="Customers"
          value={String(s?.totalCustomers ?? 0)}
          subtitle="total"
          icon="people"
          color="info"
          onPress={() => router.push('/(tabs)/more')}
        />
        <StatCard
          label="Outstanding"
          value={formatINR(s?.totalOutstanding ?? 0)}
          subtitle="credit"
          icon="wallet"
          color="warning"
        />
        <StatCard
          label="Today Service"
          value={formatINR(s?.todayServiceTotal ?? 0)}
          subtitle="revenue"
          icon="build"
          color="brand"
          onPress={() => router.push('/(tabs)/service')}
        />
        <StatCard
          label="Stock Value"
          value={formatINR(s?.stockValueSelling ?? 0)}
          subtitle="selling"
          icon="cube"
          color="info"
          onPress={() => router.push('/(tabs)/inventory')}
        />
        <StatCard
          label="Pending Enquiries"
          value={String(s?.pendingEnquiries ?? 0)}
          subtitle="follow-up"
          icon="mail-open"
          color="danger"
        />
      </View>

      {/* Sales trend bar chart */}
      {data?.salesTrend && data.salesTrend.length > 0 ? (
        <Card padding="lg" style={{ marginTop: spacing.md }}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
              Sales — Last 7 Days
            </Text>
            <Text style={styles.cardSub}>
              {formatINR(data.salesTrend.reduce((a, b) => a + b.sales, 0))} total
            </Text>
          </View>
          <BarChart
            data={data.salesTrend.map((d) => d.sales)}
            labels={data.salesTrend.map((d) => d.dayName)}
            color={colors.success}
          />
        </Card>
      ) : null}

      {/* Recent invoices */}
      <Section title="Recent Invoices" onSeeAll={() => router.push('/(tabs)/sales')} isDark={isDark}>
        {data?.recentInvoices && data.recentInvoices.length > 0 ? (
          data.recentInvoices.slice(0, 5).map((inv) => (
            <ListRow
              key={inv.id}
              title={inv.customerName || 'Walk-in customer'}
              subtitle={`${inv.invoiceNumber} · ${formatRelativeTime(inv.date || inv.createdAt)}`}
              meta={formatINR(inv.grandTotal)}
              metaTone={inv.paymentStatus === 'Paid' ? 'success' : inv.paymentStatus === 'Partial' ? 'warning' : 'danger'}
              badge={inv.paymentStatus}
              badgeTone={toneForStatus(inv.paymentStatus)}
              avatarName={inv.customerName}
              onPress={() => router.push(`/invoice/${inv.id}`)}
            />
          ))
        ) : (
          <EmptyState title="No invoices yet" message="Create your first invoice" icon="receipt-outline" />
        )}
      </Section>

      {/* Recent jobs */}
      <Section title="Recent Service Jobs" onSeeAll={() => router.push('/(tabs)/service')} isDark={isDark}>
        {data?.recentJobs && data.recentJobs.length > 0 ? (
          data.recentJobs.slice(0, 5).map((job) => (
            <ListRow
              key={job.id}
              title={job.customerName || 'Unknown'}
              subtitle={`${job.jobId} · ${job.brandModel || job.deviceType}`}
              meta={formatINR(job.balanceDue)}
              metaTone={job.balanceDue > 0 ? 'warning' : 'success'}
              badge={job.status}
              badgeTone={toneForStatus(job.status)}
              avatarName={job.customerName}
              onPress={() => router.push(`/job/${job.id}`)}
            />
          ))
        ) : (
          <EmptyState title="No service jobs yet" message="Open a new job" icon="construct-outline" />
        )}
      </Section>

      {/* Low stock */}
      {data?.lowStockList && data.lowStockList.length > 0 ? (
        <Section title="Low Stock Alerts" onSeeAll={() => router.push('/(tabs)/inventory')} isDark={isDark}>
          {data.lowStockList.slice(0, 5).map((item) => (
            <ListRow
              key={item.id}
              title={item.name}
              subtitle={item.sku || item.brand || 'No SKU'}
              meta={`${item.stock} left`}
              metaTone="danger"
              badge="Reorder"
              badgeTone="danger"
              onPress={() => router.push('/(tabs)/inventory')}
            />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  )
}

function HeaderIcon({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const isDark = useColorScheme() === 'dark'
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[headerIconStyles.wrap, { backgroundColor: isDark ? colors.surfaceMutedDark : colors.surfaceMuted }]}
    >
      <Ionicons name={icon} size={18} color={isDark ? colors.textInverted : colors.textPrimary} />
    </TouchableOpacity>
  )
}

const headerIconStyles = StyleSheet.create({
  wrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

function Section({
  title,
  onSeeAll,
  isDark,
  children,
}: {
  title: string
  onSeeAll?: () => void
  isDark: boolean
  children: React.ReactNode
}) {
  return (
    <Card padding="md" style={{ marginTop: spacing.md }}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
          {title}
        </Text>
        {onSeeAll ? (
          <Text onPress={onSeeAll} style={styles.seeAll}>
            See all
          </Text>
        ) : null}
      </View>
      {children}
    </Card>
  )
}

function BarChart({ data, labels, color }: { data: number[]; labels: string[]; color: string }) {
  const max = Math.max(1, ...data)
  const isDark = useColorScheme() === 'dark'
  return (
    <View style={chartStyles.wrap}>
      {data.map((v, i) => (
        <View key={i} style={chartStyles.col}>
          <View style={[chartStyles.barWrap, { backgroundColor: isDark ? colors.surfaceMutedDark : colors.surfaceMuted }]}>
            <View style={[chartStyles.bar, { height: `${Math.max(2, (v / max) * 100)}%`, backgroundColor: color }]} />
          </View>
          <Text style={chartStyles.label}>{labels[i]}</Text>
        </View>
      ))}
    </View>
  )
}

function getGreeting(): string {
  const hr = new Date().getHours()
  if (hr < 12) return 'Good morning'
  if (hr < 17) return 'Good afternoon'
  return 'Good evening'
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  greeting: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
  },
  greetingSub: {
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  cardSub: {
    fontSize: fontSizes.sm,
    color: colors.success,
    fontWeight: fontWeights.semibold,
  },
  seeAll: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
})

const chartStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    height: 160,
    borderRadius: radii.md,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    gap: 4,
  },
  barWrap: {
    flex: 1,
    width: '70%',
    maxHeight: 120,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 6,
  },
  label: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.medium,
  },
})
