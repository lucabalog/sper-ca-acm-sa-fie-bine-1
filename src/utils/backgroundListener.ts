import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Notifye's own background listener (Android: android-native/NotifyeListenerService.java,
 * iPhone: ios-widget/NotifyeLiveListener.swift)
 * keeps a connection open to this phone's private relay channel and shows the partner's taps
 * as Notifye notifications, even when the app is closed. Nothing else needs to be installed.
 */
interface NotifyeListenerPlugin {
  start(options: { topic: string; partnerName: string }): Promise<void>;
  stop(): Promise<void>;
  openBatterySettings(): Promise<void>;
}

const NotifyeListener = registerPlugin<NotifyeListenerPlugin>('NotifyeListener');

const available = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NotifyeListener');

/** True when the native listener shows background notifications (so JS must not duplicate them). */
export const nativeListenerAvailable = available;

export async function startBackgroundListener(topic: string, partnerName: string): Promise<void> {
  if (!available()) return;
  try {
    await NotifyeListener.start({ topic, partnerName });
  } catch {
    // Service couldn't start (e.g. notifications blocked); in-app alerts still work.
  }
}

export async function stopBackgroundListener(): Promise<void> {
  if (!available()) return;
  try {
    await NotifyeListener.stop();
  } catch {
    // ignore
  }
}

/** Opens Android's battery settings so the user can let Notifye run unrestricted. */
export async function openBatterySettings(): Promise<void> {
  if (!available()) return;
  try {
    await NotifyeListener.openBatterySettings();
  } catch {
    // ignore
  }
}
