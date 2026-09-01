/**
 * Service tab — service jobs list with search + status filter.
 *
 * Mirrors the web app's Jobs panel:
 *   - Sticky search bar (job id, customer, mobile, brand, serial)
 *   - Status filter chips (All / Pending / In Progress / Ready / Delivered)
 *   - Priority badge highlight for Urgent/High
 *   - FAB → /job/new
 *
 * Data: GET /api/jobs?status=&search=
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
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
import { useJobs } from '@/hooks/useApi'
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
import type { Job, JobStatus } from '@/types'

const STATUS_FILTERS: (JobStatus | 'All')[] = [
  'All',
  'Pending',
  'In Progress',
  'Awaiting Parts',
  'Ready',
  'Delivered',
]

export default function ServiceScreen() {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('All')

  const debouncedSearch = useDebounce(search, 350)
  const query = useJobs({
    status: status === 'All' ? undefined : status,
    search: debouncedSearch || undefined,
  })

  const onRefresh = useCallback(async () => {
    await query.refetch({ cancelRefetch: false })
  }, [query])

  const data = useMemo(() => (query.data ?? []) as Job[], [query.data])

  const urgentCount = useMemo(() => data.filter((j) => j.priority === 'Urgent' || j.priority === 'High').length, [data])

  return (
    <View style={[styles.flex, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
      <View style={{ paddingTop: insets.top + spacing.lg }}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
              Service Jobs
            </Text>
            <Text style={styles.sub}>
              {data.length} jobs
              {urgentCount > 0 ? <Text style={{ color: colors.danger }}> · {urgentCount} urgent</Text> : null}
            </Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search job #, customer, mobile, brand…" />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {STATUS_FILTERS.map((s) => {
            const active = status === s
            return <Chip key={s} label={s} active={active} onPress={() => setStatus(s)} />
          })}
        </ScrollView>
      </View>

      {query.isLoading && data.length === 0 ? (
        <LoadingSpinner label="Loading service jobs…" full />
      ) : query.isError && data.length === 0 ? (
        <ErrorView
          title="Could not load service jobs"
          message={(query.error as any)?.message || 'Network error'}
          onRetry={() => void query.refetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState
          title="No service jobs found"
          message={search ? 'Try a different search term' : 'Open your first service job to get started'}
          icon="construct-outline"
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ListRow
              title={item.customerName || 'Unknown customer'}
              subtitle={`${item.jobId} · ${item.brandModel || item.deviceType || 'No device'}`}
              meta={formatINR(item.balanceDue || item.finalAmount)}
              metaTone={item.balanceDue > 0 ? 'warning' : 'success'}
              badge={item.status}
              badgeTone={toneForStatus(item.status)}
              avatarName={item.customerName}
              onPress={() => router.push(`/job/${item.id}`)}
            />
          )}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={onRefresh} tintColor={colors.brand} />}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={5}
        />
      )}

      <FAB icon="add" onPress={() => router.push('/job/new')} />
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
    marginTop: 2,
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
