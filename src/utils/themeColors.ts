import type { StudioThemePrefs } from '../types';

export interface ColorSwatch {
  name: string;
  hex: string;
}

export const BUTTON_COLOR_SWATCHES: ColorSwatch[] = [
  { name: 'Warm Amber', hex: '#F59E0B' },
  { name: 'Rose Quartz', hex: '#F43F5E' },
  { name: 'Coral Sunset', hex: '#FB7185' },
  { name: 'Electric Violet', hex: '#8B5CF6' },
  { name: 'Ocean Teal', hex: '#14B8A6' },
  { name: 'Emerald Mint', hex: '#10B981' },
  { name: 'Cobalt Sky', hex: '#3B82F6' },
  { name: 'Champagne Pearl', hex: '#E5E7EB' },
];

export const BACKGROUND_COLOR_SWATCHES: ColorSwatch[] = [
  { name: 'Obsidian', hex: '#0B0B0F' },
  { name: 'Midnight Indigo', hex: '#0B0E1A' },
  { name: 'Deep Plum', hex: '#130B18' },
  { name: 'Forest Night', hex: '#091310' },
  { name: 'Espresso Umber', hex: '#140E0B' },
  { name: 'Slate Dusk', hex: '#0F1419' },
];

export const NOTIFICATION_COLOR_SWATCHES: ColorSwatch[] = [
  { name: 'Warm Amber', hex: '#F59E0B' },
  { name: 'Rose Crimson', hex: '#FB7185' },
  { name: 'Vivid Coral', hex: '#F97316' },
  { name: 'Soft Violet', hex: '#A78BFA' },
  { name: 'Sky Cyan', hex: '#38BDF8' },
  { name: 'Mint Glow', hex: '#34D399' },
];

export const DEFAULT_THEME_PREFS: StudioThemePrefs = {
  buttonLabel: 'Think of me',
  buttonSubLabel: 'Tap to notify',
  buttonShape: 'orb',
  touchAnimation: 'ripples',
  buttonColor: '#F59E0B',
  backgroundColor: '#0B0B0F',
  autoDeleteSeconds: 10,
  ambientNightMode: 'auto',
  showHeader: true,
  showHeading: true,
  showRecentPings: false,
  showNotificationsTab: true,
  showFloatingAlerts: true,
  sectionOrder: 'button_first',
  buttonPlacement: 'center',
  buttonSize: 'lg',
  activityScale: 'standard',
  normalNotifMessage: 'Your partner wants your attention',
  normalNotifTag: 'Thinking of you',
  normalNotifColor: '',
  normalNotifPulse: true,
  priorityNotifMessage: 'Your partner really needs your attention',
  priorityNotifTag: 'Needs you now',
  priorityNotifColor: '#FB7185',
  priorityNotifPulse: true,
  incomingHapticIntensity: 100,
  widgetDefaultKind: 'attention',
  widgetShowPriorityButton: true,
  widgetShowPartnerName: true,
};

const PREFS_STORAGE_KEY = 'tether_theme_prefs_v2';
const LEGACY_STORAGE_KEY = 'tether_theme_prefs';

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return [r, g, b];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function shiftColor(hex: string, delta: number): string {
  const [r, g, b] = parseHex(hex);
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `rgb(${clamp(r + delta)}, ${clamp(g + delta)}, ${clamp(b + delta)})`;
}

export function mixHex(hexA: string, hexB: string, weightB: number): string {
  const [r1, g1, b1] = parseHex(hexA);
  const [r2, g2, b2] = parseHex(hexB);
  const w = Math.max(0, Math.min(1, weightB));
  return toHex(r1 * (1 - w) + r2 * w, g1 * (1 - w) + g2 * w, b1 * (1 - w) + b2 * w);
}

export function getContrastInk(hex: string): string {
  const [r, g, b] = parseHex(hex);
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.34 ? '#0B0B0F' : '#FAFAFA';
}

export function isLocalNightTime(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 20 || hour < 6;
}

export function resolveAmbientPalette(
  prefs: StudioThemePrefs,
  now = new Date()
): {
  isNightActive: boolean;
  effectiveBg: string;
  effectiveButton: string;
  uiBrightness: number;
} {
  const isNightActive =
    prefs.ambientNightMode === 'always' ||
    (prefs.ambientNightMode === 'auto' && isLocalNightTime(now));

  if (!isNightActive) {
    return {
      isNightActive: false,
      effectiveBg: prefs.backgroundColor,
      effectiveButton: prefs.buttonColor,
      uiBrightness: 1,
    };
  }

  return {
    isNightActive: true,
    effectiveBg: mixHex(prefs.backgroundColor, '#020204', 0.72),
    effectiveButton: mixHex(prefs.buttonColor, '#141218', 0.26),
    uiBrightness: 0.84,
  };
}

function sanitizePrefs(parsed: Partial<StudioThemePrefs>, forceHideMainFeed = false): StudioThemePrefs {
  const validDur =
    parsed.autoDeleteSeconds === 5 || parsed.autoDeleteSeconds === 15
      ? parsed.autoDeleteSeconds
      : 10;
  return {
    buttonLabel:
      typeof parsed.buttonLabel === 'string' && parsed.buttonLabel.trim()
        ? parsed.buttonLabel.slice(0, 24)
        : DEFAULT_THEME_PREFS.buttonLabel,
    buttonSubLabel:
      typeof parsed.buttonSubLabel === 'string'
        ? parsed.buttonSubLabel.slice(0, 24)
        : DEFAULT_THEME_PREFS.buttonSubLabel,
    buttonShape:
      parsed.buttonShape === 'squircle' || parsed.buttonShape === 'bloom'
        ? parsed.buttonShape
        : 'orb',
    touchAnimation:
      parsed.touchAnimation === 'heartbeat' ||
      parsed.touchAnimation === 'spark' ||
      parsed.touchAnimation === 'squish'
        ? parsed.touchAnimation
        : 'ripples',
    buttonColor:
      typeof parsed.buttonColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(parsed.buttonColor)
        ? parsed.buttonColor
        : DEFAULT_THEME_PREFS.buttonColor,
    backgroundColor:
      typeof parsed.backgroundColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(parsed.backgroundColor)
        ? parsed.backgroundColor
        : DEFAULT_THEME_PREFS.backgroundColor,
    autoDeleteSeconds: validDur,
    ambientNightMode:
      parsed.ambientNightMode === 'always' || parsed.ambientNightMode === 'off'
        ? parsed.ambientNightMode
        : 'auto',
    showHeader: typeof parsed.showHeader === 'boolean' ? parsed.showHeader : true,
    showHeading: typeof parsed.showHeading === 'boolean' ? parsed.showHeading : true,
    showRecentPings: forceHideMainFeed
      ? false
      : typeof parsed.showRecentPings === 'boolean'
      ? parsed.showRecentPings
      : false,
    showNotificationsTab:
      typeof parsed.showNotificationsTab === 'boolean' ? parsed.showNotificationsTab : true,
    showFloatingAlerts:
      typeof parsed.showFloatingAlerts === 'boolean' ? parsed.showFloatingAlerts : true,
    sectionOrder:
      parsed.sectionOrder === 'activity_first' ? 'activity_first' : 'button_first',
    buttonPlacement:
      parsed.buttonPlacement === 'top' || parsed.buttonPlacement === 'bottom'
        ? parsed.buttonPlacement
        : 'center',
    buttonSize:
      parsed.buttonSize === 'sm' || parsed.buttonSize === 'md' ? parsed.buttonSize : 'lg',
    activityScale:
      parsed.activityScale === 'compact' || parsed.activityScale === 'expanded'
        ? parsed.activityScale
        : 'standard',
    normalNotifMessage:
      typeof parsed.normalNotifMessage === 'string' && parsed.normalNotifMessage.trim()
        ? parsed.normalNotifMessage.slice(0, 140)
        : DEFAULT_THEME_PREFS.normalNotifMessage,
    normalNotifTag:
      typeof parsed.normalNotifTag === 'string'
        ? parsed.normalNotifTag.slice(0, 28)
        : DEFAULT_THEME_PREFS.normalNotifTag,
    normalNotifColor:
      typeof parsed.normalNotifColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(parsed.normalNotifColor)
        ? parsed.normalNotifColor
        : '',
    normalNotifPulse:
      typeof parsed.normalNotifPulse === 'boolean' ? parsed.normalNotifPulse : true,
    priorityNotifMessage:
      typeof parsed.priorityNotifMessage === 'string' && parsed.priorityNotifMessage.trim()
        ? parsed.priorityNotifMessage.slice(0, 140)
        : DEFAULT_THEME_PREFS.priorityNotifMessage,
    priorityNotifTag:
      typeof parsed.priorityNotifTag === 'string'
        ? parsed.priorityNotifTag.slice(0, 28)
        : DEFAULT_THEME_PREFS.priorityNotifTag,
    priorityNotifColor:
      typeof parsed.priorityNotifColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(parsed.priorityNotifColor)
        ? parsed.priorityNotifColor
        : DEFAULT_THEME_PREFS.priorityNotifColor,
    priorityNotifPulse:
      typeof parsed.priorityNotifPulse === 'boolean' ? parsed.priorityNotifPulse : true,
    incomingHapticIntensity:
      typeof parsed.incomingHapticIntensity === 'number' &&
      Number.isFinite(parsed.incomingHapticIntensity)
        ? Math.max(0, Math.min(200, Math.round(parsed.incomingHapticIntensity / 10) * 10))
        : DEFAULT_THEME_PREFS.incomingHapticIntensity,
    widgetDefaultKind:
      parsed.widgetDefaultKind === 'urgent_attention' ? 'urgent_attention' : 'attention',
    widgetShowPriorityButton:
      typeof parsed.widgetShowPriorityButton === 'boolean'
        ? parsed.widgetShowPriorityButton
        : true,
    widgetShowPartnerName:
      typeof parsed.widgetShowPartnerName === 'boolean'
        ? parsed.widgetShowPartnerName
        : true,
  };
}

export function loadThemePrefs(): StudioThemePrefs {
  try {
    const rawV2 = localStorage.getItem(PREFS_STORAGE_KEY);
    if (rawV2) {
      return sanitizePrefs(JSON.parse(rawV2) as Partial<StudioThemePrefs>, false);
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const migrated = sanitizePrefs(JSON.parse(legacyRaw) as Partial<StudioThemePrefs>, true);
      saveThemePrefs(migrated);
      return migrated;
    }

    return DEFAULT_THEME_PREFS;
  } catch {
    return DEFAULT_THEME_PREFS;
  }
}

export function saveThemePrefs(prefs: StudioThemePrefs): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage unavailability
  }
}

/**
 * Text of a normal notification. A customized button label wins (what you see on the button is
 * what your partner gets); otherwise the custom notification message, otherwise the default.
 */
export function normalPingMessage(prefs: StudioThemePrefs): string {
  const label = prefs.buttonLabel.trim();
  if (label && label !== DEFAULT_THEME_PREFS.buttonLabel) return label;
  return prefs.normalNotifMessage.trim() || DEFAULT_THEME_PREFS.normalNotifMessage;
}
