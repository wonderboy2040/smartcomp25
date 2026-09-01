/**
 * Job detail screen — full service job view with status timeline,
 * parts used, payment breakdown, customer info, and quick actions.
 *
 * Data: GET /api/jobs/:id
 */

import { ScrollView, View, Text, StyleSheet, Linking, RefreshControl, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useJob, useOfflineMutation } from '@/hooks/useApi'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Card } from '@/components/Card'
import { Badge, toneForStatus } from '@/components/Badge'
import { Button } from '@/components/Button'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ErrorView } from '@/components/ErrorView'
import { colors, fontSizes, fontWeights, radii, spacing } from '@/lib/theme'
import { formatINR, formatDate, formatRelativeTime, maskPhone } from '@/lib/format'
import { useColorScheme } from 'react-native'
import { useState, useCallback } from 'react'
import type { JobStatus } from '@/types'

const NEXT_STATUSES: Record<JobStatus, JobStatus | null> = {
  Pending: 'In Progress',
  'In Progress': 'Ready',
  'Awaiting Parts': 'In Progress',
  Ready: 'Delivered',
  Delivered: null,
  Cancelled: null,
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const { data, isLoading, isError, error, refetch } = useJob(id)
  const [refreshing, setRefreshing] = useState(false)

  const statusMutation = useOfflineMutation<unknown, { id: string; status: JobStatus }>({
    path: (vars) => `/api/jobs/${vars.id}`,
    method: 'PUT',
    body: (vars) => ({ status: vars.status }),
    invalidateQueries: (vars) => [['job', vars.id], ['jobs'], ['dashboard']],
    onError: (err) => Alert.alert('Status update failed', String((err as any)?.message || err)),
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch({ cancelRefetch: false })
    setRefreshing(false)
  }, [refetch])

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
        <LoadingSpinner label="Loading job…" full />
      </View>
    )
  }
  if (isError && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
        <ErrorView title="Service job not found" message={(error as any)?.message || 'Network error'} onRetry={() => void refetch()} />
      </View>
    )
  }
  if (!data) return null

  const advanceStatus = NEXT_STATUSES[data.status]

  const handleAdvance = () => {
    if (!advanceStatus) return
    Alert.alert(
      'Update status?',
      `Change job ${data.jobId} to "${advanceStatus}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Update', onPress: () => statusMutation.mutate({ id: data.id, status: advanceStatus }) },
      ]
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.backgroundDark : colors.background }}>
      <ScreenHeader
        title={data.jobId}
        subtitle={data.brandModel || data.deviceType}
        onBack={() => router.back()}
        right={
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <IconBtn icon="call-outline" onPress={() => Linking.openURL(`tel:${data.customerMobile}`)} />
            <IconBtn icon="logo-whatsapp" onPress={() => Linking.openURL(`https://wa.me/91${(data.customerMobile || '').replace(/\D/g, '').slice(-10)}`)} />
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Status banner */}
        <Card padding="lg">
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Status</Text>
              <Text style={[styles.statusValue, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
                {data.status}
              </Text>
            </View>
            <Badge label={data.priority} tone={data.priority === 'Urgent' ? 'danger' : data.priority === 'High' ? 'warning' : 'neutral'} size="md" />
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.subtle}>Opened {formatRelativeTime(data.createdAt)}</Text>
            {data.isOverdue ? <Badge label="Overdue" tone="danger" /> : null}
          </View>
        </Card>

        {/* Customer info */}
        <Card padding="lg" style={{ marginTop: spacing.md }}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Customer</Text>
          <Text style={[styles.value, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={1}>
            {data.customerName || 'Unknown'}
          </Text>
          {data.customerMobile ? <Text style={styles.subtle}>{maskPhone(data.customerMobile)}</Text> : null}
        </Card>

        {/* Device info */}
        <Card padding="lg" style={{ marginTop: spacing.md }}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Device</Text>
          <DetailRow label="Type" value={data.deviceType} />
          <DetailRow label="Brand / Model" value={data.brandModel} />
          {data.serialNumber ? <DetailRow label="Serial" value={data.serialNumber} /> : null}
          <DetailRow label="Service Type" value={data.serviceType} />
          {data.assignedEngineer ? <DetailRow label="Engineer" value={data.assignedEngineer} /> : null}
          {data.warrantyExpiry ? <DetailRow label="Warranty Till" value={formatDate(data.warrantyExpiry)} /> : null}
        </Card>

        {/* Problem */}
        {data.problemDesc ? (
          <Card padding="lg" style={{ marginTop: spacing.md }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Problem Description</Text>
            <Text style={[styles.body, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
              {data.problemDesc}
            </Text>
            {data.accessories ? (
              <>
                <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.md }]}>Accessories Received</Text>
                <Text style={[styles.body, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
                  {data.accessories}
                </Text>
              </>
            ) : null}
            {data.diagnosisNotes ? (
              <>
                <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.md }]}>Diagnosis Notes</Text>
                <Text style={[styles.body, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
                  {data.diagnosisNotes}
                </Text>
              </>
            ) : null}
          </Card>
        ) : null}

        {/* Parts used */}
        {data.partsUsed && data.partsUsed.length > 0 ? (
          <Card padding="lg" style={{ marginTop: spacing.md }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Parts Used ({data.partsUsed.length})</Text>
            {data.partsUsed.map((p, i) => (
              <View key={i} style={[styles.partRow, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
                <Text style={[styles.partName, { color: isDark ? colors.textInverted : colors.textPrimary }]}>{p.name}</Text>
                <Text style={styles.partMeta}>{p.qty} × {formatINR(p.rate)} = {formatINR(p.total)}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Payment */}
        <Card padding="lg" style={{ marginTop: spacing.md }}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Payment</Text>
          <AmountRow label="Estimated" value={formatINR(data.estimatedAmount)} isDark={isDark} />
          <AmountRow label="Advance" value={formatINR(data.advance)} isDark={isDark} />
          {data.finalAmount > 0 ? <AmountRow label="Final" value={formatINR(data.finalAmount)} isDark={isDark} /> : null}
          {data.paid > 0 ? <AmountRow label="Paid" value={formatINR(data.paid)} tone="success" isDark={isDark} /> : null}
          <View style={styles.divider} />
          <AmountRow label="Balance Due" value={formatINR(data.balanceDue)} tone={data.balanceDue > 0 ? 'danger' : 'success'} bold isDark={isDark} />
        </Card>

        {/* Status history */}
        {data.statusHistory && data.statusHistory.length > 0 ? (
          <Card padding="lg" style={{ marginTop: spacing.md }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Status Timeline</Text>
            {data.statusHistory.slice().reverse().map((h, i) => (
              <View key={i} style={styles.timelineRow}>
                <View style={[styles.timelineDot, { backgroundColor: i === 0 ? colors.brand : colors.textMuted }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.timelineStatus, { color: isDark ? colors.textInverted : colors.textPrimary }]}>
                    {h.status}
                  </Text>
                  <Text style={styles.timelineMeta}>{formatDate(h.at, 'long')}</Text>
                  {h.note ? <Text style={styles.timelineNote}>{h.note}</Text> : null}
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Advance status action */}
        {advanceStatus ? (
          <Button
            label={`Mark as ${advanceStatus}`}
            full
            size="lg"
            onPress={handleAdvance}
            loading={statusMutation.isPending}
            disabled={statusMutation.isPending}
            style={{ marginTop: spacing.lg }}
          />
        ) : null}

        {data.trackUrl ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.subtle}>Share tracking link:</Text>
            <Text style={[styles.trackLink, { color: colors.brand }]} numberOfLines={1}>
              {data.trackUrl}
            </Text>
          </View>
        ) : null}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  const isDark = useColorScheme() === 'dark'
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={[detailStyles.value, { color: isDark ? colors.textInverted : colors.textPrimary }]} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  )
}

function AmountRow({ label, value, tone, bold, isDark }: { label: string; value: string; tone?: 'success' | 'danger'; bold?: boolean; isDark: boolean }) {
  const color = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : (bold ? (isDark ? colors.textInverted : colors.textPrimary) : colors.textSecondary)
  return (
    <View style={amountStyles.row}>
      <Text style={[amountStyles.label, bold && { fontWeight: fontWeights.semibold, fontSize: fontSizes.md }, { color: bold ? (isDark ? colors.textInverted : colors.textPrimary) : colors.textSecondary }]}>{label}</Text>
      <Text style={[amountStyles.value, bold && { fontSize: fontSizes.lg, fontWeight: fontWeights.bold }, { color }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    color: colors.textMuted,
  },
  statusValue: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  value: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  subtle: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  body: {
    fontSize: fontSizes.md,
    lineHeight: 22,
    marginTop: 4,
  },
  partRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  partName: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  partMeta: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineStatus: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  timelineMeta: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  timelineNote: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  trackLink: {
    fontSize: fontSizes.xs,
    marginTop: 4,
    fontFamily: 'Courier',
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

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: 4,
  },
  label: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    width: 110,
  },
  value: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    textAlign: 'right',
  },
})

const amountStyles = StyleSheet.create({
  row: {
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
