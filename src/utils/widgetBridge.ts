import { Capacitor, registerPlugin } from '@capacitor/core';
import firebaseConfig from '../../firebase-applet-config.json';
import type { PairDoc, StudioThemePrefs, UserProfile } from '../types';
import { getContrastInk, shiftColor } from './themeColors';

/** shiftColor() returns `rgb(r, g, b)`; the Swift widget expects `#RRGGBB`. */
function shiftHex(hex: string, delta: number): string {
  const m = shiftColor(hex, delta).match(/\d+/g) ?? ['245', '158', '11'];
  return '#' + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export interface WidgetSyncPayload {
  apiKey: string;
  projectId: string;
  databaseId: string;
  refreshToken: string;
  uid: string;
  displayName: string;
  pairId: string;
  partnerName: string;
  memberUids: string[];
  buttonLabel: string;
  buttonColorHex: string;
  backgroundColorHex: string;
  normalMessage: string;
  priorityMessage: string;
  defaultUrgent: boolean;
  /** Same gradient stops and text colour as the in-app button (ThinkOfMeButton). */
  buttonTopHex: string;
  buttonBottomHex: string;
  buttonInkHex: string;
  buttonShape: string;
  /** Partner's ntfy topic for closed-app notifications ('' if they haven't turned it on). */
  partnerPushTopic: string;
  updatedAtMs: number;
}

interface NotifyeWidgetBridgePlugin {
  syncWidgetState(payload: WidgetSyncPayload): Promise<{ appGroupAvailable?: boolean; appGroup?: string }>;
  clearWidgetState(): Promise<void>;
}

// Registered natively by NotifyeBridgeViewController (iOS). Capacitor only exposes a native
// plugin to JS through registerPlugin(); window.Capacitor.Plugins is not pre-populated.
const NotifyeWidgetBridge = registerPlugin<NotifyeWidgetBridgePlugin>('NotifyeWidgetBridge');

function widgetBridgeAvailable(): boolean {
  return Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('NotifyeWidgetBridge');
}

export function isNativeCapacitorApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Last sync result, so the Widgets sheet can tell the user if the widget can't see the app. */
export let lastWidgetSync: { ok: boolean; appGroupAvailable: boolean } | null = null;

export async function syncNativeWidgetState(params: {
  refreshToken: string;
  profile: UserProfile;
  pair: PairDoc | null;
  themePrefs: StudioThemePrefs;
  partnerPushTopic: string;
}): Promise<void> {
  const { refreshToken, profile, pair, themePrefs, partnerPushTopic } = params;
  const isActive = Boolean(pair && pair.status === 'active');
  const partnerName = isActive && pair
    ? (pair.partnerAUid === profile.uid ? pair.partnerBName : pair.partnerAName) || 'Partner'
    : 'Partner';

  const buttonColor = themePrefs.buttonColor || '#F59E0B';
  const payload: WidgetSyncPayload = {
    apiKey: firebaseConfig.apiKey,
    projectId: firebaseConfig.projectId,
    databaseId: firebaseConfig.firestoreDatabaseId,
    refreshToken,
    uid: profile.uid,
    displayName: profile.displayName,
    pairId: isActive && pair ? pair.pairId : '',
    partnerName,
    memberUids: isActive && pair ? pair.memberUids : [],
    buttonLabel: themePrefs.buttonLabel || 'Think of me',
    buttonColorHex: buttonColor,
    backgroundColorHex: themePrefs.backgroundColor || '#0B0B0F',
    normalMessage:
      themePrefs.normalNotifMessage.trim() || 'Your partner wants your attention',
    priorityMessage:
      themePrefs.priorityNotifMessage.trim() || 'Your partner really needs your attention',
    defaultUrgent: themePrefs.widgetDefaultKind === 'urgent_attention',
    buttonTopHex: shiftHex(buttonColor, 26),
    buttonBottomHex: shiftHex(buttonColor, -14),
    buttonInkHex: getContrastInk(buttonColor),
    buttonShape: themePrefs.buttonShape,
    partnerPushTopic: isActive ? partnerPushTopic : '',
    updatedAtMs: Date.now(),
  };

  try {
    localStorage.setItem(
      'notifye_widget_preview_meta',
      JSON.stringify({
        partnerName: payload.partnerName,
        buttonLabel: payload.buttonLabel,
        paired: Boolean(payload.pairId),
        updatedAtMs: payload.updatedAtMs,
      })
    );
  } catch {
    // ignore storage errors
  }

  if (!widgetBridgeAvailable()) return;
  try {
    const res = await NotifyeWidgetBridge.syncWidgetState(payload);
    lastWidgetSync = { ok: true, appGroupAvailable: res?.appGroupAvailable !== false };
  } catch {
    lastWidgetSync = { ok: false, appGroupAvailable: false };
  }
}

export async function clearNativeWidgetState(): Promise<void> {
  try {
    localStorage.removeItem('notifye_widget_preview_meta');
  } catch {
    // ignore
  }
  if (!widgetBridgeAvailable()) return;
  try {
    await NotifyeWidgetBridge.clearWidgetState();
  } catch {
    // ignore
  }
}
