/**
 * Tab layout — bottom tab bar with 5 entries:
 *   Dashboard  |  Sales  |  Service  |  Inventory  |  More
 *
 * Plus an offline-queue badge that appears on the "More" tab when
 * there are pending writes.
 */

import { Tabs, Redirect } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontSizes, fontWeights, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'
import { useAuth } from '@/hooks/useAuth'
import { useOfflineSync } from '@/hooks/useOfflineSync'

export default function TabsLayout() {
  const { status, loading } = useAuth()
  const isDark = useColorScheme() === 'dark'
  const { size: offlineSize } = useOfflineSync()

  if (loading) return null
  // Redirect to login if the user is not authenticated but the backend
  // requires a PIN.
  if (status.pinRequired && !status.authenticated) {
    return <Redirect href="/login" />
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: isDark ? colors.surfaceDark : colors.surface,
          borderTopColor: isDark ? colors.borderDark : colors.border,
          height: 56 + spacing.sm,
          paddingBottom: spacing.sm,
        },
        tabBarLabelStyle: {
          fontSize: fontSizes.xs,
          fontWeight: fontWeights.medium,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: 'Sales',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="service"
        options={{
          title: 'Service',
          tabBarIcon: ({ color, size }) => <Ionicons name="construct-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="ellipsis-horizontal-circle-outline" size={size} color={color} />
              {offlineSize > 0 ? <Badge count={offlineSize} /> : null}
            </View>
          ),
        }}
      />
    </Tabs>
  )
}

function Badge({ count }: { count: number }) {
  return (
    <View style={styles.badgeWrap}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  badgeWrap: {
    position: 'absolute',
    top: -2,
    right: -6,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.textInverted,
    fontSize: fontSizes.xs - 1,
    fontWeight: fontWeights.bold,
  },
})
