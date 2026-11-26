import { Capacitor } from '@capacitor/core';

/**
 * Notifications that arrive even when Notifye is fully closed, without a paid Apple account or
 * a server of our own. They're relayed through ntfy (https://ntfy.sh), a free push service with
 * free iPhone and Android apps that already have push permission.
 *
 * Each phone picks a long random "topic" (it works like a password) and subscribes to it in the
 * ntfy app. The topic is shared with the partner through Firestore
 * (pairs/{pairId}/devices/{uid}.fcmToken = "ntfy:<topic>"). Every ping also POSTs to the
 * partner's topic.
 */

const NTFY_SERVER = 'https://ntfy.sh';
const TOPIC_KEY = 'notifye_push_topic';
const ENABLED_KEY = 'notifye_push_enabled';
export const NTFY_TOKEN_PREFIX = 'ntfy:';

export const NTFY_APP_STORE_URL = 'https://apps.apple.com/app/ntfy/id1625396347';
export const NTFY_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=io.heckel.ntfy';

function randomTopic(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'notifye-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** This phone's private receive topic (created once, kept on the device). */
export function getReceiveTopic(): string {
  try {
    const existing = localStorage.getItem(TOPIC_KEY);
    if (existing && /^notifye-[a-z0-9]{24}$/.test(existing)) return existing;
    const created = randomTopic();
    localStorage.setItem(TOPIC_KEY, created);
    return created;
  } catch {
    return randomTopic();
  }
}

export function isClosedAppPushEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setClosedAppPushEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(ENABLED_KEY, '1');
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    // ignore storage errors
  }
}

export const toDeviceToken = (topic: string) => `${NTFY_TOKEN_PREFIX}${topic}`;

export function topicFromDeviceToken(token: string | null | undefined): string | null {
  if (!token || !token.startsWith(NTFY_TOKEN_PREFIX)) return null;
  const topic = token.slice(NTFY_TOKEN_PREFIX.length);
  return /^notifye-[a-z0-9]{24}$/.test(topic) ? topic : null;
}

export function devicePlatform(): 'web' | 'ios-pwa' | 'android-pwa' {
  const p = Capacitor.getPlatform();
  return p === 'ios' ? 'ios-pwa' : p === 'android' ? 'android-pwa' : 'web';
}

/** Opens the ntfy app on this topic. Android supports ntfy:// links; iOS needs the topic pasted. */
export function ntfySubscribeLink(topic: string): string {
  return `ntfy://ntfy.sh/${topic}?display=Notifye`;
}

export const ntfyStoreUrl = (): string =>
  Capacitor.getPlatform() === 'android' ? NTFY_PLAY_STORE_URL : NTFY_APP_STORE_URL;

/** Opens an app store page or other external link from inside the app. */
export async function openExternal(url: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      return (await AppLauncher.openUrl({ url })).completed;
    } catch {
      return false;
    }
  }
  return window.open(url, '_blank', 'noopener') !== null;
}

/**
 * Android only: opens ntfy straight on this phone's topic, which subscribes to it.
 * Returns false when ntfy isn't installed (the ntfy:// link has nothing to open).
 */
export async function openNtfySubscription(topic: string): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return false;
  return openExternal(ntfySubscribeLink(topic));
}

/** Calls `onResume` each time the user comes back to Notifye (e.g. from ntfy or the store). */
export function onAppResume(onResume: () => void): () => void {
  if (Capacitor.isNativePlatform()) {
    let remove: (() => void) | null = null;
    let cancelled = false;
    void import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) onResume();
      });
      if (cancelled) void handle.remove();
      else remove = () => void handle.remove();
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') onResume();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}

async function publish(topic: string, title: string, message: string, urgent: boolean): Promise<boolean> {
  try {
    // JSON publishing (instead of Title/Priority headers) so names and messages can contain any
    // characters; HTTP header values are limited to Latin-1.
    const res = await fetch(NTFY_SERVER, {
      method: 'POST',
      body: JSON.stringify({
        topic,
        title,
        message,
        priority: urgent ? 5 : 4,
        tags: [urgent ? 'rotating_light' : 'bell'],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ntfy.sh allows short bursts, then about one message per 5 s per phone (250 a day). Fast taps are
// all delivered in-app through Firestore; the closed-app push sends the first tap right away and
// folds the rest of a burst into one follow-up ("+3 more").
const PUSH_WINDOW_MS = 5000;
let lastPushAt = 0;
let pendingCount = 0;
let pendingTimer: number | undefined;
let pendingArgs: { topic: string; title: string; message: string; urgent: boolean } | null = null;

export function sendClosedAppPush(
  partnerDeviceToken: string,
  args: { senderName: string; message: string; urgent: boolean }
): void {
  const topic = topicFromDeviceToken(partnerDeviceToken);
  if (!topic) return;
  const title = args.urgent ? `Priority from ${args.senderName}` : args.senderName;
  const now = Date.now();

  if (now - lastPushAt >= PUSH_WINDOW_MS && pendingTimer === undefined) {
    lastPushAt = now;
    void publish(topic, title, args.message, args.urgent);
    return;
  }

  pendingCount += 1;
  pendingArgs = {
    topic,
    title,
    message: args.message,
    urgent: args.urgent || Boolean(pendingArgs?.urgent),
  };
  if (pendingTimer === undefined) {
    pendingTimer = window.setTimeout(() => {
      const p = pendingArgs;
      const count = pendingCount;
      pendingTimer = undefined;
      pendingArgs = null;
      pendingCount = 0;
      lastPushAt = Date.now();
      if (p) {
        void publish(p.topic, p.title, count > 1 ? `${p.message} (+${count - 1} more)` : p.message, p.urgent);
      }
    }, Math.max(250, PUSH_WINDOW_MS - (now - lastPushAt)));
  }
}

/** Sends a test notification to this phone's own topic. */
export function sendTestPush(topic: string): Promise<boolean> {
  return publish(topic, 'Notifye', "You're all set: your partner's taps will reach you even when Notifye is closed.", false);
}
