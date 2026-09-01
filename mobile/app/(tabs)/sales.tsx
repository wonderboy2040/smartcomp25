/**
 * Sales tab — invoices list with search + status filter.
 *
 * Mirrors the web app's Invoices panel but optimised for mobile:
 *   - Sticky search bar at the top
 *   - Status filter chip row (All / Paid / Partial / Unpaid)
 *   - Virtualised list of invoices
 *   - Floating action button → /invoice/new (modal)
 *
 * Data: GET /api/invoices?status=&search=
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useInvoices } from '@/hooks/useApi'
import { ListRow } from '@/components/ListRow'
import { SearchBar } from '@/components/SearchBar'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ErrorView } from '@/components/ErrorView'
import { EmptyState } from '@/components/EmptyState'
import { FAB } from '@/components/FAB'
import { toneForStatus } from '@/components/Badge'
import { colors, fontSizes, fontWeights, radii, spacing } from '@/lib/theme'
import { formatINR, formatRelativeTime } from '@/lib/format'
import { useColorScheme } from 'react-native'

const STATUS_FILTERS = ['All', 'Paid', 'Partial', 'Unpaid'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

export default function SalesScreen() {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('All')

  const debouncedSearch = useDebounce(search, 350)
  const query = useInvoices({
    status: status === 'All' ? undefined : status,
    search: debouncedSearch || undefined,
  })

  const onRefresh = useCallback(async () => {
    await query.refetch({ cancelRefetch: false })
  }, [query])

  const data = useMemo(() => (query.data ?? []) as NonNullable<typeof query.data>, [query.data])

  return (
    <View style={[styles.flex, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
      <View style={{ paddingTop: insets.top + spacing.lg }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
            Sales
          </Text>
          <Text style={styles.sub}>{data.length} invoices</Text>
        </View>

        <View style={styles.searchWrap}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search invoice #, customer, phone…" />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {STATUS_FILTERS.map((s) => {
            const active = status === s
            return (
              <Chip
                key={s}
                label={s}
                active={active}
                onPress={() => setStatus(s)}
              />
            )
          })}
        </ScrollView>
      </View>

      {query.isLoading && data.length === 0 ? (
        <LoadingSpinner label="Loading invoices…" full />
      ) : query.isError && data.length === 0 ? (
        <ErrorView
          title="Could not load invoices"
          message={(query.error as any)?.message || 'Network error'}
          onRetry={() => void query.refetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState
          title="No invoices found"
          message={search ? 'Try a different search term' : 'Create your first invoice to get started'}
          icon="receipt-outline"
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ListRow
              title={item.customerName || 'Walk-in customer'}
              subtitle={`${item.invoiceNumber} · ${formatRelativeTime(item.date || item.createdAt)}`}
              meta={formatINR(item.grandTotal)}
              metaTone={item.paymentStatus === 'Paid' ? 'success' : item.paymentStatus === 'Partial' ? 'warning' : 'danger'}
              badge={item.paymentStatus}
              badgeTone={toneForStatus(item.paymentStatus)}
              avatarName={item.customerName}
              onPress={() => router.push(`/invoice/${item.id}`)}
            />
          )}
          contentContainerStyle={{ paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={onRefresh} tintColor={colors.brand} />}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={5}
        />
      )}

      <FAB icon="add" onPress={() => router.push('/invoice/new')} />
    </View>
  )
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        chipStyles.wrap,
        {
          backgroundColor: active ? colors.brand : 'transparent',
          borderColor: active ? colors.brand : colors.border,
        },
      ]}
    >
      <Text
        style={[
          chipStyles.label,
          { color: active ? colors.textInverted : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
  },
  sub: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  chipsRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
})

const chipStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
})

// (no unused imports)
