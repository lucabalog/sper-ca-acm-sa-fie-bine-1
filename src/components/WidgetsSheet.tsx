import React, { useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Flame,
  LayoutGrid,
  Maximize2,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { isNativeCapacitorApp, lastWidgetSync } from '../utils/widgetBridge';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { PingDoc, StudioThemePrefs, WidgetDefaultKind } from '../types';
import { hexToRgba, resolveAmbientPalette } from '../utils/themeColors';

interface WidgetsSheetProps {
  open: boolean;
  onClose: () => void;
  partnerName: string;
  latestPing: PingDoc | null;
  prefs: StudioThemePrefs;
  onUpdatePrefs: (next: StudioThemePrefs) => void;
  onSendNormal: () => Promise<void>;
  onSendUrgent: () => Promise<void>;
  onOpenStandaloneWidget: () => void;
  onOpenIpaExport?: () => void;
  sendingPing: boolean;
}

const SHEET_SPRING = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.85 };

const isNativeApp = isNativeCapacitorApp();
const isIOS = Capacitor.getPlatform() === 'ios';

export const WidgetsSheet: React.FC<WidgetsSheetProps> = ({
  open,
  onClose,
  partnerName,
  latestPing,
  prefs,
  onUpdatePrefs,
  onSendNormal,
  onSendUrgent,
  onOpenStandaloneWidget,
  onOpenIpaExport,
  sendingPing,
}) => {
  const [widgetFeedback, setWidgetFeedback] = useState<'normal' | 'urgent' | null>(null);
  const [copiedKey, setCopiedKey] = useState<'send' | 'priority' | null>(null);
  const widgetSync = open ? lastWidgetSync : null;
  const prefersReducedMotion = useReducedMotion();

  const ambient = resolveAmbientPalette(prefs);
  const isPriorityDefault = prefs.widgetDefaultKind === 'urgent_attention';
  const priorityColor = prefs.priorityNotifColor.trim() || '#FB7185';
  const primaryColor = isPriorityDefault ? priorityColor : ambient.effectiveButton;

  const triggerWidgetTap = async (urgent: boolean) => {
    if (sendingPing) return;
    if (urgent) {
      await onSendUrgent();
      setWidgetFeedback('urgent');
    } else {
      await onSendNormal();
      setWidgetFeedback('normal');
    }
    window.setTimeout(() => setWidgetFeedback(null), 2200);
  };

  const copyShortcutUrl = async (action: 'send' | 'priority') => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/?widgetAction=${action}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(action);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  };

  const setDefaultKind = (kind: WidgetDefaultKind) => {
    onUpdatePrefs({ ...prefs, widgetDefaultKind: kind });
  };

  const shapeRadiusClass =
    prefs.buttonShape === 'squircle'
      ? 'rounded-2xl'
      : 'rounded-full';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:p-4 pointer-events-auto">
          <motion.div
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/65"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="widgets-sheet-title"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 44, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.97 }}
            transition={prefersReducedMotion ? { duration: 0.14 } : SHEET_SPRING}
            className="relative z-10 w-full sm:max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain pb-sheet-safe rounded-t-3xl sm:rounded-2xl border border-white/15 p-5 sm:p-6 space-y-5 shadow-2xl"
            style={{ backgroundColor: hexToRgba(ambient.effectiveBg, 0.94) }}
          >
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto sm:hidden" />

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 shrink-0" style={{ color: ambient.effectiveButton }} />
                  <h2 id="widgets-sheet-title" className="font-display text-xl font-medium text-zinc-100">
                    Widgets
                  </h2>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Press the button right inside a widget to send a live notification to {partnerName}.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close widgets"
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Interactive Widget Gallery */}
            <div className="space-y-4">
              {/* 1. Small 2x2 Quick Button Widget + Lock Screen Circular */}
              <div className="grid grid-cols-12 gap-3 items-stretch">
                <div
                  className="col-span-7 rounded-3xl border border-white/15 p-4 flex flex-col items-center justify-between gap-2.5 text-center shadow-lg"
                  style={{ backgroundColor: hexToRgba(ambient.effectiveBg, 0.98) }}
                >
                  <div className="w-full flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-medium text-zinc-300 truncate">
                      {prefs.widgetShowPartnerName ? partnerName : 'Notifye'}
                    </span>
                    <span className="text-[10px] text-zinc-500">2×2</span>
                  </div>

                  <motion.button
                    type="button"
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.91 }}
                    disabled={sendingPing}
                    onClick={() => void triggerWidgetTap(isPriorityDefault)}
                    className={`w-20 h-20 ${shapeRadiusClass} flex flex-col items-center justify-center gap-1 shadow-lg cursor-pointer transition-transform disabled:opacity-60`}
                    style={{
                      backgroundColor: primaryColor,
                      color: '#0B0B0F',
                      boxShadow: `0 10px 24px -6px ${hexToRgba(primaryColor, 0.48)}`,
                    }}
                    aria-label={`Widget button: send notification to ${partnerName}`}
                  >
                    {widgetFeedback ? (
                      <Check className="w-5 h-5" />
                    ) : isPriorityDefault ? (
                      <Flame className="w-5 h-5" />
                    ) : (
                      <Bell className="w-5 h-5" />
                    )}
                    <span className="text-[11px] font-bold leading-none">
                      {widgetFeedback ? 'Sent' : isPriorityDefault ? 'Priority' : 'Tap'}
                    </span>
                  </motion.button>

                  <span className="text-[11px] text-zinc-400 truncate max-w-full">
                    {widgetFeedback
                      ? `Notified ${partnerName}`
                      : prefs.buttonLabel || 'Think of me'}
                  </span>
                </div>

                {/* Lock Screen Circular Widget */}
                <div className="col-span-5 rounded-3xl border border-white/15 bg-black/45 p-4 flex flex-col items-center justify-between text-center">
                  <span className="text-[10px] text-zinc-400">Lock Screen</span>
                  <motion.button
                    type="button"
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.9 }}
                    disabled={sendingPing}
                    onClick={() => void triggerWidgetTap(isPriorityDefault)}
                    className="w-16 h-16 rounded-full border-2 border-white/35 bg-white/10 hover:bg-white/15 flex flex-col items-center justify-center gap-0.5 text-zinc-100 cursor-pointer transition-colors disabled:opacity-60"
                    aria-label={`Lock screen widget button for ${partnerName}`}
                  >
                    {widgetFeedback ? (
                      <Check className="w-4 h-4 text-emerald-300" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                    <span className="text-[10px] font-medium">
                      {widgetFeedback ? 'Sent' : 'Ping'}
                    </span>
                  </motion.button>
                  <span className="text-[10px] text-zinc-500 truncate max-w-full">
                    {prefs.widgetShowPartnerName ? partnerName : 'Quick tap'}
                  </span>
                </div>
              </div>

              {/* 2. Medium 4x2 Dual Action Widget */}
              <div
                className="rounded-3xl border border-white/15 p-4 flex items-center justify-between gap-3 shadow-lg"
                style={{ backgroundColor: hexToRgba(ambient.effectiveBg, 0.98) }}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span>Notifye</span>
                    <span aria-hidden="true">·</span>
                    <span>4×2 Widget</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-100 truncate">
                    {prefs.widgetShowPartnerName ? `Reach ${partnerName}` : 'Partner shortcut'}
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {widgetFeedback === 'urgent'
                      ? `Priority alert sent to ${partnerName}`
                      : widgetFeedback === 'normal'
                      ? `Sent to ${partnerName}`
                      : latestPing
                      ? `Last: ${latestPing.message}`
                      : 'Press a button inside the widget'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <motion.button
                    type="button"
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.93 }}
                    disabled={sendingPing}
                    onClick={() => void triggerWidgetTap(false)}
                    className="min-h-[64px] min-w-[68px] px-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 text-[#0B0B0F] font-semibold cursor-pointer disabled:opacity-60"
                    style={{ backgroundColor: ambient.effectiveButton }}
                  >
                    {widgetFeedback === 'normal' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span className="text-[11px] whitespace-nowrap">
                      {widgetFeedback === 'normal' ? 'Sent' : 'Notify'}
                    </span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.93 }}
                    disabled={sendingPing}
                    onClick={() => void triggerWidgetTap(true)}
                    className="min-h-[64px] min-w-[60px] px-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 font-semibold cursor-pointer disabled:opacity-60"
                    style={{
                      backgroundColor: hexToRgba(priorityColor, 0.16),
                      borderColor: hexToRgba(priorityColor, 0.36),
                      color: priorityColor,
                    }}
                  >
                    {widgetFeedback === 'urgent' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Flame className="w-4 h-4" />
                    )}
                    <span className="text-[11px] whitespace-nowrap">
                      {widgetFeedback === 'urgent' ? 'Sent' : 'Priority'}
                    </span>
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Widget Behavior Settings */}
            <div className="space-y-3 pt-1 border-t border-white/10">
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-zinc-300">
                  2×2 &amp; Lock Screen button action
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/35 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setDefaultKind('attention')}
                    className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      !isPriorityDefault
                        ? 'bg-white text-[#0B0B0F]'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    Normal ping
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultKind('urgent_attention')}
                    className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      isPriorityDefault
                        ? 'bg-white text-[#0B0B0F]'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    Priority alert
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onUpdatePrefs({
                    ...prefs,
                    widgetShowPartnerName: !prefs.widgetShowPartnerName,
                  })
                }
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between gap-3 text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                <span className="text-xs font-medium text-zinc-200">
                  Show partner name on widget
                </span>
                <span
                  className={`text-xs font-medium ${
                    prefs.widgetShowPartnerName ? 'text-amber-300' : 'text-zinc-500'
                  }`}
                >
                  {prefs.widgetShowPartnerName ? 'Shown' : 'Hidden'}
                </span>
              </button>
            </div>

            {/* Launch Standalone Widget / Copy Shortcuts / Native iOS WidgetKit */}
            <div className="space-y-2.5 pt-1 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenStandaloneWidget();
                }}
                className="w-full min-h-[44px] px-4 rounded-xl text-[#0B0B0F] text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
                style={{ backgroundColor: ambient.effectiveButton }}
              >
                <Maximize2 className="w-4 h-4 shrink-0" />
                <span>Open Standalone Mini Widget</span>
              </button>

              {isNativeApp ? (
                <div className="rounded-xl bg-white/[0.05] border border-white/10 p-3.5 space-y-2 text-xs text-zinc-300 leading-relaxed">
                  <p className="text-sm font-semibold text-zinc-100">Add the Home Screen widget</p>
                  {isIOS ? (
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Touch and hold an empty spot on your Home Screen (or Lock Screen).</li>
                      <li>Tap <span className="text-zinc-100 font-medium">+</span> / <span className="text-zinc-100 font-medium">Edit</span>, search for <span className="text-zinc-100 font-medium">Notifye</span>.</li>
                      <li>Pick a size and tap <span className="text-zinc-100 font-medium">Add Widget</span>. Tapping it notifies your partner instantly.</li>
                    </ol>
                  ) : (
                    <p>Home Screen widgets are available on iPhone (iOS 17+). On Android, use the in-app button.</p>
                  )}
                  {isIOS && widgetSync && !widgetSync.appGroupAvailable && (
                    <p className="text-rose-300">
                      This install can&apos;t share data with the widget (its App Group was removed when the app was signed). Re-sign with App Groups enabled.
                    </p>
                  )}
                </div>
              ) : (
              <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void copyShortcutUrl('send')}
                  className="min-h-[40px] px-3 rounded-xl bg-white/[0.07] border border-white/10 text-xs font-medium text-zinc-200 hover:bg-white/[0.12] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {copiedKey === 'send' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{copiedKey === 'send' ? 'Copied link' : 'Copy tap link'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void copyShortcutUrl('priority')}
                  className="min-h-[40px] px-3 rounded-xl bg-white/[0.07] border border-white/10 text-xs font-medium text-zinc-200 hover:bg-white/[0.12] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {copiedKey === 'priority' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{copiedKey === 'priority' ? 'Copied link' : 'Copy priority link'}</span>
                </button>
              </div>

              <div className="pt-1 flex items-center justify-between gap-3">
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  iOS 17+ WidgetKit (<span className="font-mono text-zinc-300">NotifyeWidgets</span>) is bundled in the <span className="font-mono text-zinc-300">.ipa</span> export.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenIpaExport?.();
                  }}
                  className="min-h-[38px] px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-zinc-100 flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 shrink-0" style={{ color: ambient.effectiveButton }} />
                  <span>Get .ipa</span>
                </button>
              </div>
              </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
