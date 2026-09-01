/**
 * usePushNotifications — registers the device for Expo push notifications
 * and POSTs the token to the web backend's /api/notifications/register
 * endpoint (if it exists — graceful no-op if the route is not present).
 *
 * Used to alert the shop owner on:
 *   - New service job assigned
 *   - Job status changed
 *   - Low stock threshold crossed
 *   - Pending payment overdue
 */

import { useEffect, useState } from 'react'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { apiPost } from '@/lib/api'
import { getLastPushToken, setLastPushToken } from '@/lib/config'
import { useAuth } from './useAuth'

Notifications.setNotificationHandler({
  handleNotificationReceived: () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
  handleNotificationReceivedInBackground: () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

interface UsePushNotificationsResult {
  token: string | null
  permissionStatus: 'granted' | 'denied' | 'undetermined' | 'blocked'
  registered: boolean
  error: string | null
}

export function usePushNotifications(): UsePushNotificationsResult {
  const { status } = useAuth()
  const [token, setToken] = useState<string | null>(null)
  const [permissionStatus, setPermissionStatus] = useState<UsePushNotificationsResult['permissionStatus']>('undetermined')
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function register() {
      if (!status.authenticated) return
      if (!Device.isDevice) {
        // Must be a physical device for push — emulators can't receive push.
        setError('Push notifications require a physical device')
        return
      }

      try {
        const current = await Notifications.getPermissionsAsync()
        setPermissionStatus(current.status)
        if (current.status !== 'granted') {
          const req = await Notifications.requestPermissionsAsync()
          setPermissionStatus(req.status)
          if (req.status !== 'granted') {
            setError('Permission denied — push disabled')
            return
          }
        }

        // Read the EAS project ID from app.json (extra.eas.projectId) so
        // there is a single source of truth — `eas init` / `eas build`
        // rewrites it there automatically. Never hardcode it here.
        const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
        const pushToken = (
          await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {})
        ).data
        if (cancelled) return
        setToken(pushToken)

        const lastToken = await getLastPushToken()
        if (lastToken !== pushToken) {
          try {
            await apiPost('/api/notifications/register', { token: pushToken, platform: Platform.OS }, { timeoutMs: 10000 })
            await setLastPushToken(pushToken)
            setRegistered(true)
          } catch (e: any) {
            // The /api/notifications/register endpoint might not exist on
            // the deployed backend (older build). Don't break the app —
            // just log.
            setError(`Push register skipped: ${e?.message || 'unknown'}`)
          }
        } else {
          setRegistered(true)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to register for push')
      }
    }

    register()
    return () => {
      cancelled = true
    }
  }, [status.authenticated])

  return { token, permissionStatus, registered, error }
}
