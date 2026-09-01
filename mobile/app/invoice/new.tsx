/**
 * New invoice screen — minimal create-invoice flow.
 *
 * The web app's invoice create form is complex (HSN, tax slabs,
 * per-item discount, digital keys, etc.). The mobile app provides
 * a streamlined version for on-the-go invoicing:
 *   - Customer lookup (autocomplete from /api/customers)
 *   - Add items (search by name/sku/barcode, set qty)
 *   - Payment mode + paid amount
 *   - Submit → POST /api/invoices
 *
 * For complex invoices, the user should use the web app (which has
 * full keyboard + bulk item pick + serial assignment UI).
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { SearchBar } from '@/components/SearchBar'
import { colors, fontSizes, fontWeights, radii, spacing } from '@/lib/theme'
import { formatINR } from '@/lib/format'
import { useColorScheme } from 'react-native'
import { useCustomers, useItems, useOfflineMutation } from '@/hooks/useApi'
import type { Customer, Item, InvoiceItem } from '@/types'

const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Credit', 'BankTransfer'] as const
type PaymentMode = (typeof PAYMENT_MODES)[number]

export default function NewInvoiceScreen() {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [customerSearch, setCustomerSearch] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [items, setItems] = useState<Array<{ itemId?: string; name: string; qty: number; rate: number; total: number }>>([])
  const [itemSearch, setItemSearch] = useState('')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash')
  const [paidAmount, setPaidAmount] = useState('')

  const debouncedCustomerSearch = useDebounce(customerSearch, 350)
  const debouncedItemSearch = useDebounce(itemSearch, 350)
  const customersQuery = useCustomers(debouncedCustomerSearch || undefined)
  const itemsQuery = useItems(debouncedItemSearch ? { search: debouncedItemSearch } : undefined)

  const mutation = useOfflineMutation<{ id?: string; invoiceNumber?: string }, { customer: Customer; items: InvoiceItem[]; paymentMode: string; paidAmount: number }>({
    path: () => '/api/invoices',
    method: 'POST',
    body: (vars) => ({
      customerId: vars.customer.id,
      customerName: vars.customer.name,
      customerPhone: vars.customer.phone,
      items: vars.items,
      paymentMode: vars.paymentMode,
      paidAmount: vars.paidAmount,
    }),
    invalidateQueries: () => [['invoices'], ['dashboard'], ['customers']],
    onSuccess: (data) => {
      Alert.alert('Invoice created', data?.invoiceNumber || '', [
        { text: 'View', onPress: () => router.replace(`/invoice/${data?.id || ''}`) },
        { text: 'Done', onPress: () => router.back() },
      ])
    },
    onError: (err) => {
      Alert.alert('Failed to create invoice', String((err as any)?.message || err))
    },
  })

  const grandTotal = useMemo(() => items.reduce((acc, i) => acc + i.total, 0), [items])

  const addCustomer = (c: Customer) => {
    setCustomer(c)
    setCustomerSearch('')
  }
  const addItem = (i: Item) => {
    setItems((prev) => {
      const existing = prev.find((p) => p.itemId === i.id)
      if (existing) {
        return prev.map((p) =>
          p === existing ? { ...p, qty: p.qty + 1, total: (p.qty + 1) * p.rate } : p
        )
      }
      return [...prev, { itemId: i.id, name: i.name, qty: 1, rate: i.sellingPrice, total: i.sellingPrice }]
    })
    setItemSearch('')
  }
  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }
  const setQty = (idx: number, qty: number) => {
    setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, qty, total: qty * p.rate } : p)))
  }

  const handleSubmit = useCallback(() => {
    if (!customer) {
      Alert.alert('Select a customer first')
      return
    }
    if (items.length === 0) {
      Alert.alert('Add at least one item')
      return
    }
    mutation.mutate({
      customer,
      items: items.map((i) => ({
        itemId: i.itemId,
        name: i.name,
        qty: i.qty,
        rate: i.rate,
        total: i.total,
      })),
      paymentMode,
      paidAmount: Number(paidAmount) || 0,
    })
  }, [customer, items, mutation, paidAmount, paymentMode])

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
      <ScreenHeader title="New Invoice" onBack={() => router.back()} subtitle={`${items.length} items · ${formatINR(grandTotal)}`} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
          <Card padding="lg">
            <Text style={[styles.label, { color: colors.textMuted }]}>Customer</Text>
            {customer ? (
              <View style={styles.selectedWrap}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.selectedText, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
                    {customer.name}
                  </Text>
                  <Text style={styles.selectedSub} numberOfLines={1}>{customer.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => setCustomer(null)}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <SearchBar value={customerSearch} onChange={setCustomerSearch} placeholder="Search customer by name or phone…" />
                {customersQuery.data && customerSearch ? (
                  <View style={{ marginTop: spacing.sm }}>
                    {(customersQuery.data as Customer[]).slice(0, 5).map((c) => (
                      <TouchableOpacity key={c.id} style={[styles.suggestion, { borderBottomColor: isDark ? colors.borderDark : colors.border }]} onPress={() => addCustomer(c)}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.selectedText, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>{c.name}</Text>
                          <Text style={styles.selectedSub} numberOfLines={1}>{c.phone}</Text>
                        </View>
                        <Ionicons name="add-circle" size={20} color={colors.brand} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </Card>

          <Card padding="lg" style={{ marginTop: spacing.md }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Items</Text>
            <SearchBar value={itemSearch} onChange={setItemSearch} placeholder="Search items…" />
            {itemsQuery.data && itemSearch ? (
              <View style={{ marginTop: spacing.sm }}>
                {(itemsQuery.data as Item[]).slice(0, 5).map((i) => (
                  <TouchableOpacity key={i.id} style={[styles.suggestion, { borderBottomColor: isDark ? colors.borderDark : colors.border }]} onPress={() => addItem(i)}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.selectedText, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>{i.name}</Text>
                      <Text style={styles.selectedSub} numberOfLines={1}>{i.sku} · {formatINR(i.sellingPrice)}</Text>
                    </View>
                    <Ionicons name="add-circle" size={20} color={colors.brand} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {items.length === 0 ? (
              <Text style={styles.hint}>Add at least one item to invoice</Text>
            ) : (
              items.map((it, idx) => (
                <View key={idx} style={[styles.itemRow, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.itemName, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={2}>{it.name}</Text>
                    <Text style={styles.itemMeta}>{formatINR(it.rate)} × {it.qty} = {formatINR(it.total)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <TouchableOpacity onPress={() => setQty(idx, Math.max(1, it.qty - 1))}>
                      <Ionicons name="remove-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                    <Text style={[styles.qtyText, { color: isDark ? colors.textInverted : colors.textPrimary }]}>{it.qty}</Text>
                    <TouchableOpacity onPress={() => setQty(idx, it.qty + 1)}>
                      <Ionicons name="add-circle" size={20} color={colors.brand} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeItem(idx)}>
                      <Ionicons name="trash-outline" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </Card>

          <Card padding="lg" style={{ marginTop: spacing.md }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Payment</Text>
            <View style={styles.chipRow}>
              {PAYMENT_MODES.map((m) => (
                <Chip key={m} label={m} active={paymentMode === m} onPress={() => setPaymentMode(m)} />
              ))}
            </View>
            <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.md }]}>Paid Amount (₹)</Text>
            <View style={[styles.amountInput, { borderColor: isDark ? colors.borderDark : colors.border, backgroundColor: isDark ? colors.surfaceMutedDark : colors.surfaceMuted }]}>
              <TextInput
                value={paidAmount}
                onChangeText={setPaidAmount}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                style={[styles.amountField, { color: isDark ? colors.textInverted : colors.textPrimary }]}
              />
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textInverted : colors.textPrimary }]}>Grand Total</Text>
              <Text style={[styles.totalValue, { color: isDark ? colors.textInverted : colors.textPrimary }]}>{formatINR(grandTotal)}</Text>
            </View>
          </Card>
        </ScrollView>

        <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button label={mutation.isPending ? 'Saving…' : 'Create Invoice'} full size="lg" onPress={handleSubmit} loading={mutation.isPending} disabled={mutation.isPending} />
        </View>
      </KeyboardAvoidingView>
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
      <Text style={[chipStyles.label, { color: active ? colors.textInverted : colors.textSecondary }]}>{label}</Text>
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  label: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  selectedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingVertical: spacing.xs,
  },
  selectedText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  selectedSub: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: spacing.md,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  itemMeta: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  qtyText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    minWidth: 20,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  amountField: {
    flex: 1,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    padding: 0,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  totalValue: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
  },
  actionBar: {
    padding: spacing.lg,
    backgroundColor: 'transparent',
  },
})

const chipStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
})
