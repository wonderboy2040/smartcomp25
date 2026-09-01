/**
 * Inventory tab — items / stock list.
 *
 * Features:
 *   - Sticky search bar
 *   - "Low stock only" toggle
 *   - Barcode scan button (top-right) → opens /barcode modal
 *   - Each row shows name + sku + stock + selling price + cost
 *   - Long-press to edit (or view detail — currently the inventory panel
 *     on web handles editing; the mobile app is read-mostly for v1)
 *
 * Data: GET /api/items?lowStock=&search=
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useItems } from '@/hooks/useApi'
import { SearchBar } from '@/components/SearchBar'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ErrorView } from '@/components/ErrorView'
import { EmptyState } from '@/components/EmptyState'
import { FAB } from '@/components/FAB'
import { Badge } from '@/components/Badge'
import { colors, fontSizes, fontWeights, radii, spacing } from '@/lib/theme'
import { formatINR } from '@/lib/format'
import { useColorScheme } from 'react-native'
import type { Item } from '@/types'

export default function InventoryScreen() {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const debouncedSearch = useDebounce(search, 350)

  const query = useItems({
    lowStock: lowStockOnly || undefined,
    search: debouncedSearch || undefined,
  })

  const data = useMemo(() => (query.data ?? []) as Item[], [query.data])

  const onRefresh = useCallback(async () => {
    await query.refetch({ cancelRefetch: false })
  }, [query])

  return (
    <View style={[styles.flex, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
      <View style={{ paddingTop: insets.top + spacing.lg }}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
              Inventory
            </Text>
            <Text style={styles.sub}>
              {data.length} items
              {query.data ? <Text> · ₹{formatStockValue(query.data as Item[])} value</Text> : null}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/barcode')}
            activeOpacity={0.7}
            style={[styles.scanBtn, { backgroundColor: isDark ? colors.surfaceMutedDark : colors.surfaceMuted }]}
          >
            <Ionicons name="barcode-outline" size={18} color={isDark ? colors.textInverted : colors.textPrimary} />
            <Text style={[styles.scanBtnLabel, { color: isDark ? colors.textInverted : colors.textPrimary }]}>Scan</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search item name, SKU, barcode…" />
        </View>

        <View style={styles.toggleRow}>
          <Toggle
            label="Low stock only"
            active={lowStockOnly}
            onPress={() => setLowStockOnly((v) => !v)}
          />
        </View>
      </View>

      {query.isLoading && data.length === 0 ? (
        <LoadingSpinner label="Loading items…" full />
      ) : query.isError && data.length === 0 ? (
        <ErrorView
          title="Could not load items"
          message={(query.error as any)?.message || 'Network error'}
          onRetry={() => void query.refetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState
          title="No items found"
          message={search ? 'Try a different search term' : 'Add your first item to start tracking stock'}
          icon="cube-outline"
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ItemRow item={item} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={onRefresh} tintColor={colors.brand} />}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={5}
        />
      )}

      <FAB icon="add" onPress={() => router.push('/barcode' as any)} />
    </View>
  )
}

function ItemRow({ item }: { item: Item }) {
  const isDark = useColorScheme() === 'dark'
  const lowStock = item.stock <= (item.minStock || item.reorderLevel || 5)
  return (
    <View style={[rowStyles.wrap, { backgroundColor: isDark ? colors.surfaceDark : colors.surface, borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
      <View style={rowStyles.left}>
        <View style={[rowStyles.iconWrap, { backgroundColor: lowStock ? colors.dangerLight : `${colors.brand}22` }]}>
          <Ionicons name="cube" size={18} color={lowStock ? colors.danger : colors.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[rowStyles.title, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={rowStyles.subtitle} numberOfLines={1}>
            {[item.sku, item.brand, item.category].filter(Boolean).join(' · ') || 'No SKU'}
          </Text>
        </View>
      </View>
      <View style={rowStyles.right}>
        <Text style={[rowStyles.price, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
          {formatINR(item.sellingPrice)}
        </Text>
        <Text style={[rowStyles.stock, { color: lowStock ? colors.danger : colors.textMuted }]}>
          {item.stock} in stock
        </Text>
        {lowStock ? <Badge label="Reorder" tone="danger" /> : null}
      </View>
    </View>
  )
}

function Toggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const isDark = useColorScheme() === 'dark'
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        toggleStyles.wrap,
        {
          backgroundColor: active ? colors.brand : isDark ? colors.surfaceMutedDark : colors.surfaceMuted,
          borderColor: active ? colors.brand : isDark ? colors.borderDark : colors.border,
        },
      ]}
    >
      <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={active ? colors.textInverted : colors.textMuted} />
      <Text style={[toggleStyles.label, { color: active ? colors.textInverted : colors.textSecondary }]}>{label}</Text>
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

function formatStockValue(items: Item[]): string {
  const v = items.reduce((acc, i) => acc + (Number(i.sellingPrice) || 0) * (Number(i.stock) || 0), 0)
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  scanBtnLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  toggleRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
})

const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  price: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  stock: {
    fontSize: fontSizes.sm,
  },
})

const toggleStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
})
