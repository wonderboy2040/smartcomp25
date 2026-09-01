/**
 * Avatar — circular avatar with initials fallback (no image required).
 */

import { View, Text, StyleSheet } from 'react-native'
import { colors, fontSizes, fontWeights } from '@/lib/theme'
import { initials } from '@/lib/format'

interface AvatarProps {
  name?: string | null
  size?: number
  color?: string
}

export function Avatar({ name, size = 40, color = colors.brand }: AvatarProps) {
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.textInverted,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.5,
  },
})
