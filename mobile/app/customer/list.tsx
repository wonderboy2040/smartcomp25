/**
 * Customer list screen — search + browse + open customer detail.
 *
 * Data: GET /api/customers?search=
 */

import { useState, useEffect } from 'react'
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useCustomers } from '@/hooks/useApi'
import { ListRow } from '@/components/ListRow'
import { SearchBar } from '@/components/SearchBar'
import { ScreenHeader } from '@/components/ScreenHeader'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ErrorView } from '@/components/ErrorView'
import { EmptyState } from '@/components/EmptyState'
import { colors, fontSizes, fontWeights, spacing } from '@/lib/theme'
import { formatINR, maskPhone } from '@/lib/format'
import { useColorScheme } from 'react-native'
import type { Customer } from '@/types'

export default function CustomerListScreen() {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 350)
  const q = useCustomers(debounced || undefined)

  const data = (q.data ?? []) as Customer[]

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
      <ScreenHeader title="Customers" subtitle={`${data.length} total`} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search customer name, phone, GSTIN…" />
      </View>

      {q.isLoading && data.length === 0 ? (
        <LoadingSpinner label="Loading customers…" full />
      ) : q.isError && data.length === 0 ? (
        <ErrorView title="Could not load customers" message={(q.error as any)?.message || 'Network error'} onRetry={() => void q.refetch()} />
      ) : data.length === 0 ? (
        <EmptyState title="No customers found" message={search ? 'Try a different search term' : 'Add your first customer from the web app'} icon="people-outline" />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={maskPhone(item.phone)}
              meta={formatINR(item.creditBalance)}
              metaTone={Number(item.creditBalance) > 0 ? 'warning' : 'success'}
              avatarName={item.name}
              onPress={() => router.push(`/customer/${item.id}`)}
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => void q.refetch({ cancelRefetch: false })} tintColor={colors.brand} />}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={5}
        />
      )}
    </View>
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
