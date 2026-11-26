import React from 'react';
import { Bell, Flame, Maximize2, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { PairDoc, PingDoc, StudioThemePrefs, UserProfile } from '../types';
import { hexToRgba, resolveAmbientPalette } from '../utils/themeColors';

interface WidgetStandaloneViewProps {
  profile: UserProfile;
  pair: PairDoc;
  latestPing: PingDoc | null;
  themePrefs: StudioThemePrefs;
  sendingPing: boolean;
  lastSentFeedback: string | null;
  error: string | null;
  onSendNormal: () => Promise<void>;
  onSendUrgent: () => Promise<void>;
  onExitStandalone: () => void;
}

export const WidgetStandaloneView: React.FC<WidgetStandaloneViewProps> = ({
  profile,
  pair,
  latestPing,
  themePrefs,
  sendingPing,
  lastSentFeedback,
  error,
  onSendNormal,
  onSendUrgent,
  onExitStandalone,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const ambient = resolveAmbientPalette(themePrefs);
  const isPartnerA = pair.partnerAUid === profile.uid;
  const partnerName = isPartnerA ? pair.partnerBName || 'Partner' : pair.partnerAName || 'Partner';
  const priorityColor = themePrefs.priorityNotifColor.trim() || '#FB7185';
  const isPriorityDefault = themePrefs.widgetDefaultKind === 'urgent_attention';
  const primaryColor = isPriorityDefault ? priorityColor : ambient.effectiveButton;

  return (
    <div
      className="min-h-dvh text-[#F5F5F7] flex flex-col justify-between p-4 sm:p-6 pt-safe-4 pb-safe-4"
      style={{ backgroundColor: ambient.effectiveBg }}
    >
      <header className="w-full max-w-xl mx-auto flex items-center justify-between gap-4">
        <span className="font-display text-base font-medium text-zinc-100 whitespace-nowrap shrink-0">
          Notifye
        </span>
        <button
          type="button"
          onClick={onExitStandalone}
          className="min-h-[40px] px-3 rounded-xl bg-white/[0.08] border border-white/10 text-xs font-medium text-zinc-200 hover:bg-white/[0.14] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5 shrink-0" />
          <span>Full Studio</span>
        </button>
      </header>

      <main className="w-full max-w-md mx-auto my-auto py-8 space-y-4">
        {/* Compact Quick-Press Widget */}
        <section
          className="rounded-3xl border border-white/15 p-6 flex flex-col items-center text-center gap-4 shadow-2xl"
          style={{ backgroundColor: hexToRgba(ambient.effectiveBg, 0.96) }}
        >
          <div className="space-y-0.5">
            <p className="text-xs text-zinc-400">
              {themePrefs.widgetShowPartnerName ? `Partner · ${partnerName}` : 'Quick widget'}
            </p>
            <h1 className="font-display text-xl font-medium text-zinc-100 [text-wrap:balance]">
              {themePrefs.buttonLabel || 'Think of me'}
            </h1>
          </div>

          <motion.button
            type="button"
            whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
            disabled={sendingPing}
            onClick={() => void (isPriorityDefault ? onSendUrgent() : onSendNormal())}
            className={`w-28 h-28 ${
              themePrefs.buttonShape === 'squircle' ? 'rounded-3xl' : 'rounded-full'
            } flex flex-col items-center justify-center gap-1.5 text-[#0B0B0F] font-semibold shadow-xl cursor-pointer disabled:opacity-60`}
            style={{
              backgroundColor: primaryColor,
              boxShadow: `0 16px 36px -8px ${hexToRgba(primaryColor, 0.5)}`,
            }}
          >
            {isPriorityDefault ? <Flame className="w-7 h-7" /> : <Bell className="w-7 h-7" />}
            <span className="text-xs font-bold">
              {sendingPing ? 'Sending...' : isPriorityDefault ? 'Priority' : 'Tap to send'}
            </span>
          </motion.button>

          <div className="min-h-[20px]">
            {error ? (
              <p role="alert" className="text-xs text-red-300">
                {error}
              </p>
            ) : lastSentFeedback ? (
              <p className="text-xs font-medium" style={{ color: primaryColor }}>
                {lastSentFeedback}
              </p>
            ) : latestPing ? (
              <p className="text-xs text-zinc-400 truncate max-w-[260px]">
                Latest: {latestPing.message}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">Press the widget button to notify {partnerName}</p>
            )}
          </div>
        </section>

        {/* Dual Action Strip Widget */}
        <section className="rounded-2xl border border-white/12 bg-black/30 p-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={sendingPing}
            onClick={() => void onSendNormal()}
            className="min-h-[48px] px-3 rounded-xl text-[#0B0B0F] text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap"
            style={{ backgroundColor: ambient.effectiveButton }}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Normal alert</span>
          </button>
          <button
            type="button"
            disabled={sendingPing}
            onClick={() => void onSendUrgent()}
            className="min-h-[48px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap"
            style={{
              backgroundColor: hexToRgba(priorityColor, 0.16),
              borderColor: hexToRgba(priorityColor, 0.36),
              color: priorityColor,
            }}
          >
            <Flame className="w-4 h-4 shrink-0" />
            <span>Priority alert</span>
          </button>
        </section>
      </main>

      <footer className="w-full max-w-xl mx-auto text-center text-[11px] text-zinc-500">
        Standalone widget view
      </footer>
    </div>
  );
};
