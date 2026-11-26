import { Capacitor } from '@capacitor/core';

export type WidgetLinkAction = 'send' | 'priority';

/**
 * notifye://send             -> normal notification
 * notifye://send?kind=priority -> priority notification
 * Opened by the iOS widget when it has no shared state (see NotifyeLinks in NotifyeWidget.swift).
 */
export function parseNotifyeLink(url: string): WidgetLinkAction | null {
  const match = /^notifye:\/\/send\b(.*)$/i.exec(url.trim());
  if (!match) return null;
  return /[?&]kind=priority\b/i.test(match[1]) ? 'priority' : 'send';
}

/** Calls `onAction` for the link that launched the app and for links opened while it runs. */
export function subscribeToWidgetLinks(onAction: (action: WidgetLinkAction) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let cancelled = false;
  let removeListener: (() => void) | null = null;
  // On a cold start iOS reports the same link twice (launch URL + retained appUrlOpen event).
  let lastUrl = '';
  let lastAt = 0;
  const handle = (url: string) => {
    const action = parseNotifyeLink(url);
    if (!action || cancelled) return;
    const now = Date.now();
    if (url === lastUrl && now - lastAt < 3000) return;
    lastUrl = url;
    lastAt = now;
    onAction(action);
  };

  void import('@capacitor/app').then(async ({ App }) => {
    if (cancelled) return;
    const listener = await App.addListener('appUrlOpen', ({ url }) => handle(url));
    removeListener = () => void listener.remove();
    if (cancelled) {
      removeListener();
      return;
    }
    const launch = await App.getLaunchUrl();
    if (launch?.url) handle(launch.url);
  });

  return () => {
    cancelled = true;
    removeListener?.();
  };
}
