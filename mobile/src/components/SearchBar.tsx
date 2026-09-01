/**
 * SearchBar — controlled text input with a search icon and a clear (×) button.
 */

import { View, TextInput, TouchableOpacity, StyleSheet, type TextInputProps } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontSizes, radii, spacing } from '@/lib/theme'
import { useColorScheme } from 'react-native'

interface SearchBarProps extends Omit<TextInputProps, 'onChange' | 'value'> {
  value: string
  onChange: (text: string) => void
  placeholder?: string
}

export function SearchBar({ value, onChange, placeholder = 'Search…', ...rest }: SearchBarProps) {
  const isDark = useColorScheme() === 'dark'
  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: isDark ? colors.surfaceMutedDark : colors.surfaceMuted,
          borderColor: isDark ? colors.borderDark : colors.border,
        },
      ]}
    >
      <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.icon} />
      <TextInput
        {...rest}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: isDark ? colors.textInverted : colors.textPrimary }]}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <TouchableOpacity onPress={() => onChange('')} style={styles.clear}>
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    height: 44,
  },
  icon: {
    marginRight: spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: fontSizes.md,
    padding: 0,
    height: 44,
  },
  clear: {
    paddingHorizontal: spacing.xs,
  },
})
