/**
 * FAB — floating action button (bottom-right of tab screens).
 */

import { TouchableOpacity, View, StyleSheet, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radii, spacing } from '@/lib/theme'
import { hapticMedium } from '@/lib/haptics'

interface FABProps {
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
  color?: string
  style?: ViewStyle
}

export function FAB({ icon, onPress, color = colors.brand, style }: FABProps) {
  const handlePress = () => {
    hapticMedium()
    onPress()
  }
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[styles.fab, { backgroundColor: color }, style]}
    >
      <Ionicons name={icon} size={24} color={colors.textInverted} />
    </TouchableOpacity>
  )
}

const _View = View // silence unused-import warning in case it's added later
void _View

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 6,
  },
})
