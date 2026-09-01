/**
 * SmartComp Mobile — haptic feedback wrapper.
 *
 * Subtle haptics on button presses, success/error states, etc.
 * Falls back gracefully on platforms/devices without haptic support.
 */

import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'

export function hapticLight(): void {
  if (Platform.OS === 'web') return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null)
}

export function hapticMedium(): void {
  if (Platform.OS === 'web') return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null)
}

export function hapticHeavy(): void {
  if (Platform.OS === 'web') return
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => null)
}

export function hapticSuccess(): void {
  if (Platform.OS === 'web') return
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null)
}

export function hapticError(): void {
  if (Platform.OS === 'web') return
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null)
}

export function hapticWarning(): void {
  if (Platform.OS === 'web') return
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null)
}

export function hapticSelection(): void {
  if (Platform.OS === 'web') return
  Haptics.selectionAsync().catch(() => null)
}
