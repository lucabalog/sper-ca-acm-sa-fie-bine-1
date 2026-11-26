import { Capacitor } from '@capacitor/core';

// System notifications inside the iOS/Android app. WKWebView/Android WebView have no Web
// Notification API, so incoming pings use the native local-notifications plugin instead.
// Loaded on demand so the web build doesn't pay for it.
const load = () => import('@capacitor/local-notifications');

export const nativeNotificationsSupported = (): boolean => Capacitor.isNativePlatform();

/** Ask for notification permission (Android 13+ and iOS both require it). Never re-prompts after a denial. */
export async function ensureNativeNotificationPermission(): Promise<boolean> {
  if (!nativeNotificationsSupported()) return false;
  try {
    const { LocalNotifications } = await load();
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    if (current.display === 'denied') return false;
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  } catch {
    return false;
  }
}

let nextId = Math.floor(Date.now() / 1000) % 1_000_000;

export async function showNativeNotification(title: string, body: string): Promise<void> {
  if (!nativeNotificationsSupported()) return;
  try {
    const { LocalNotifications } = await load();
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;
    nextId = (nextId + 1) % 2_000_000_000;
    await LocalNotifications.schedule({
      notifications: [{ id: nextId, title, body }],
    });
  } catch {
    // Notification delivery is best effort; the in-app banner still shows.
  }
}
