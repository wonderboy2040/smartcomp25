/**
 * New service job screen — mobile-friendly create-job flow.
 *
 * Captures the minimum fields needed to open a service job:
 *   - Customer mobile + name (autofill by phone if existing)
 *   - Device info (type, brand, serial, problem)
 *   - Service type (InShop / OnSite / Pickup)
 *   - Priority (Low / Medium / High / Urgent)
 *   - Estimated amount + advance
 *
 * For complex flows (parts assignment, engineer assignment, diagnosis
 * notes), the user should use the web app.
 *
 * Submit → POST /api/jobs
 */

import { useState, useCallback, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { SearchBar } from '@/components/SearchBar'
import { colors, fontSizes, fontWeights, radii, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'
import { useCustomers, useOfflineMutation } from '@/hooks/useApi'
import type { Customer, ServiceType, JobPriority } from '@/types'

const DEVICE_TYPES = ['Laptop', 'Desktop', 'Printer', 'Monitor', 'Mobile', 'Tablet', 'Other']
const SERVICE_TYPES: ServiceType[] = ['InShop', 'OnSite', 'Pickup']
const PRIORITIES: JobPriority[] = ['Low', 'Medium', 'High', 'Urgent']

export default function NewJobScreen() {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [customerSearch, setCustomerSearch] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerMobile, setCustomerMobile] = useState('')
  const [deviceType, setDeviceType] = useState('Laptop')
  const [brandModel, setBrandModel] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [problemDesc, setProblemDesc] = useState('')
  const [accessories, setAccessories] = useState('')
  const [serviceType, setServiceType] = useState<ServiceType>('InShop')
  const [priority, setPriority] = useState<JobPriority>('Medium')
  const [estimatedAmount, setEstimatedAmount] = useState('')
  const [advanceAmount, setAdvanceAmount] = useState('')

  const debouncedCustomerSearch = useDebounce(customerSearch, 350)
  const customersQuery = useCustomers(debouncedCustomerSearch || undefined)

  const mutation = useOfflineMutation<{ id?: string; jobId?: string }, Record<string, unknown>>({
    path: () => '/api/jobs',
    method: 'POST',
    body: (vars) => vars,
    invalidateQueries: () => [['jobs'], ['dashboard']],
    onSuccess: (data) => {
      Alert.alert('Job created', data?.jobId || '', [
        { text: 'View', onPress: () => router.replace(`/job/${data?.id || ''}`) },
        { text: 'Done', onPress: () => router.back() },
      ])
    },
    onError: (err) => Alert.alert('Failed to create job', String((err as any)?.message || err)),
  })

  const addExistingCustomer = (c: Customer) => {
    setCustomer(c)
    setCustomerName(c.name)
    setCustomerMobile(c.phone)
    setCustomerSearch('')
  }

  const handleSubmit = useCallback(() => {
    if (!customerName.trim()) {
      Alert.alert('Customer name required')
      return
    }
    if (!customerMobile.trim() || customerMobile.replace(/\D/g, '').length < 10) {
      Alert.alert('Valid customer mobile required (10 digits)')
      return
    }
    if (!brandModel.trim() && !deviceType) {
      Alert.alert('Device type / brand required')
      return
    }
    if (!problemDesc.trim()) {
      Alert.alert('Problem description required')
      return
    }
    mutation.mutate({
      customerId: customer?.id,
      customerName: customerName.trim(),
      customerMobile: customerMobile.trim(),
      deviceType,
      brandModel: brandModel.trim(),
      serialNumber: serialNumber.trim(),
      problemDesc: problemDesc.trim(),
      accessories: accessories.trim(),
      serviceType,
      priority,
      estimatedAmount: Number(estimatedAmount) || 0,
      advanceAmount: Number(advanceAmount) || 0,
    })
  }, [customerName, customerMobile, brandModel, deviceType, problemDesc, accessories, serviceType, priority, estimatedAmount, advanceAmount, customer, mutation])

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
      <ScreenHeader title="New Service Job" onBack={() => router.back()} />
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
                  <Text style={styles.selectedSub}>{customer.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => { setCustomer(null); setCustomerName(''); setCustomerMobile('') }}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <SearchBar value={customerSearch} onChange={setCustomerSearch} placeholder="Search existing customer…" />
                {customersQuery.data && customerSearch ? (
                  <View style={{ marginTop: spacing.sm }}>
                    {(customersQuery.data as Customer[]).slice(0, 5).map((c) => (
                      <TouchableOpacity key={c.id} style={[styles.suggestion, { borderBottomColor: isDark ? colors.borderDark : colors.border }]} onPress={() => addExistingCustomer(c)}>
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

            <LabeledInput label="Customer Name" value={customerName} onChange={setCustomerName} placeholder="e.g. Ramesh Kumar" dark={isDark} />
            <LabeledInput label="Customer Mobile" value={customerMobile} onChange={setCustomerMobile} placeholder="10-digit phone" keyboardType="number-pad" dark={isDark} />
          </Card>

          <Card padding="lg" style={{ marginTop: spacing.md }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Device</Text>
            <Text style={styles.fieldLabel}>Device Type</Text>
            <View style={styles.chipRow}>
              {DEVICE_TYPES.map((d) => (
                <Chip key={d} label={d} active={deviceType === d} onPress={() => setDeviceType(d)} />
              ))}
            </View>
            <LabeledInput label="Brand / Model" value={brandModel} onChange={setBrandModel} placeholder="e.g. Dell Inspiron 15 3000" dark={isDark} />
            <LabeledInput label="Serial Number" value={serialNumber} onChange={setSerialNumber} placeholder="Optional" dark={isDark} />
            <LabeledInput label="Problem Description" value={problemDesc} onChange={setProblemDesc} placeholder="Describe the issue…" multiline dark={isDark} />
            <LabeledInput label="Accessories Received" value={accessories} onChange={setAccessories} placeholder="e.g. Charger, bag" dark={isDark} />
          </Card>

          <Card padding="lg" style={{ marginTop: spacing.md }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Service</Text>
            <Text style={styles.fieldLabel}>Service Type</Text>
            <View style={styles.chipRow}>
              {SERVICE_TYPES.map((s) => (
                <Chip key={s} label={s} active={serviceType === s} onPress={() => setServiceType(s)} />
              ))}
            </View>
            <Text style={styles.fieldLabel}>Priority</Text>
            <View style={styles.chipRow}>
              {PRIORITIES.map((p) => (
                <Chip key={p} label={p} active={priority === p} onPress={() => setPriority(p)} />
              ))}
            </View>
            <LabeledInput label="Estimated Amount (₹)" value={estimatedAmount} onChange={setEstimatedAmount} placeholder="0" keyboardType="number-pad" dark={isDark} />
            <LabeledInput label="Advance Received (₹)" value={advanceAmount} onChange={setAdvanceAmount} placeholder="0" keyboardType="number-pad" dark={isDark} />
          </Card>
        </ScrollView>

        <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button
            label={mutation.isPending ? 'Saving…' : 'Create Job'}
            full
            size="lg"
            onPress={handleSubmit}
            loading={mutation.isPending}
            disabled={mutation.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  dark,
}: {
  label: string
  value: string
  onChange: (t: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address'
  multiline?: boolean
  dark: boolean
}) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={inputStyles.label}>{label}</Text>
      <View style={[inputStyles.wrap, { borderColor: dark ? colors.borderDark : colors.border, backgroundColor: dark ? colors.surfaceMutedDark : colors.surfaceMuted }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          multiline={multiline}
          autoCapitalize="none"
          autoCorrect={false}
          style={[inputStyles.field, { color: dark ? colors.textInverted : colors.textPrimary }, multiline && { minHeight: 80, textAlignVertical: 'top' }]}
        />
      </View>
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
  fieldLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  selectedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  actionBar: {
    padding: spacing.lg,
    backgroundColor: 'transparent',
  },
})

const inputStyles = StyleSheet.create({
  label: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginBottom: 4,
    fontWeight: fontWeights.medium,
  },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  field: {
    flex: 1,
    fontSize: fontSizes.md,
    padding: 0,
    minHeight: 24,
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
