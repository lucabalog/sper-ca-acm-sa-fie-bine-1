import React, { useEffect, useState } from 'react';
import { Bell, BellRing, Check, RotateCcw, Sparkles, X } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import type { AutoDeleteDuration, PingDoc, StudioThemePrefs } from '../types';
import { ClosedAppNotificationsCard } from './ClosedAppNotificationsCard';
import {
  DEFAULT_THEME_PREFS,
  NOTIFICATION_COLOR_SWATCHES,
  hexToRgba,
  shiftColor,
} from '../utils/themeColors';

interface NotificationsSheetProps {
  open: boolean;
  onClose: () => void;
  pings: PingDoc[];
  currentUid: string;
  accentColor: string;
  backgroundColor: string;
  prefs: StudioThemePrefs;
  onUpdatePrefs: (next: StudioThemePrefs) => void;
  onChangeAutoDelete: (seconds: AutoDeleteDuration) => void;
  onToggleFloatingAlerts: () => void;
  onPreviewAlert: (urgent: boolean) => void;
  closedAppPushEnabled: boolean;
  onSetClosedAppPush: (enabled: boolean) => void;
  partnerHasClosedAppPush: boolean;
  partnerName: string;
}

type NotifTab = 'alerts' | 'customize';
type AlertTier = 'normal' | 'priority';

const TIMER_CHOICES: AutoDeleteDuration[] = [5, 10, 15];
const PILL_SPRING = { type: 'spring' as const, stiffness: 460, damping: 16, mass: 0.72 };
const SHEET_SPRING = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.85 };
const WIGGLE_EASE = [0.22, 1, 0.36, 1] as const;

function formatPingTime(ping: PingDoc): string {
  const ms = ping.clientCreatedMs ?? (ping.createdAt?.toMillis ? ping.createdAt.toMillis() : Date.now());
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const NotificationsSheet: React.FC<NotificationsSheetProps> = ({
  open,
  onClose,
  pings,
  currentUid,
  accentColor,
  backgroundColor,
  prefs,
  onUpdatePrefs,
  onChangeAutoDelete,
  onToggleFloatingAlerts,
  onPreviewAlert,
  closedAppPushEnabled,
  onSetClosedAppPush,
  partnerHasClosedAppPush,
  partnerName,
}) => {
  const [activeTab, setActiveTab] = useState<NotifTab>('alerts');
  const [selectedTier, setSelectedTier] = useState<AlertTier>('normal');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open || pings.length === 0) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open, pings.length]);

  const ttlMs = prefs.autoDeleteSeconds * 1000;
  const pillTransition = prefersReducedMotion ? { duration: 0.1 } : PILL_SPRING;

  const isPriorityTier = selectedTier === 'priority';
  const currentMessage = isPriorityTier ? prefs.priorityNotifMessage : prefs.normalNotifMessage;
  const currentTag = isPriorityTier ? prefs.priorityNotifTag : prefs.normalNotifTag;
  const currentColor = isPriorityTier
    ? prefs.priorityNotifColor || '#FB7185'
    : prefs.normalNotifColor || accentColor;
  const currentPulse = isPriorityTier ? prefs.priorityNotifPulse : prefs.normalNotifPulse;
  const previewGlow = shiftColor(currentColor, 26);

  const updatePref = <K extends keyof StudioThemePrefs>(key: K, value: StudioThemePrefs[K]) => {
    onUpdatePrefs({ ...prefs, [key]: value });
  };

  const renderAnimatedLabel = (text: string, active: boolean) => (
    <motion.span
      className="relative z-10 inline-block"
      animate={
        active && !prefersReducedMotion
          ? {
              scale: [1, 1.07, 0.96, 1.025, 1],
              rotate: [0, -1.8, 1.3, -0.5, 0],
            }
          : { scale: 1, rotate: 0 }
      }
      transition={{ duration: 0.44, ease: WIGGLE_EASE }}
    >
      {text}
    </motion.span>
  );

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <motion.div
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60"
          />

          <LayoutGroup id="notifications-sheet">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="notifications-sheet-title"
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 44, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.97 }}
              transition={prefersReducedMotion ? { duration: 0.14 } : SHEET_SPRING}
              className="relative z-10 w-full sm:max-w-lg max-h-[88dvh] overflow-y-auto overscroll-contain pb-sheet-safe rounded-t-3xl sm:rounded-2xl border border-white/15 p-5 sm:p-6 space-y-5 shadow-2xl"
              style={{ backgroundColor: hexToRgba(backgroundColor, 0.92) }}
            >
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto sm:hidden" />

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 id="notifications-sheet-title" className="font-display text-xl font-medium text-zinc-100">
                    Notifications
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Live alerts &amp; custom styles for normal and priority pings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close notifications"
                  className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Alerts / Customize Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/35 border border-white/10">
                {(
                  [
                    { id: 'alerts', label: 'Active alerts' },
                    { id: 'customize', label: 'Customize styles' },
                  ] as { id: NotifTab; label: string }[]
                ).map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <motion.button
                      key={tab.id}
                      type="button"
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative min-h-[38px] px-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        active ? 'text-[#0B0B0F]' : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="notif-sheet-tab-pill"
                          transition={pillTransition}
                          className="absolute inset-0 rounded-lg bg-white shadow-sm"
                        />
                      )}
                      {renderAnimatedLabel(tab.label, active)}
                    </motion.button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {activeTab === 'alerts' ? (
                  <motion.div
                    key="notif-alerts-tab"
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-4"
                  >
                    <ClosedAppNotificationsCard
                      enabled={closedAppPushEnabled}
                      onSetEnabled={onSetClosedAppPush}
                      partnerHasIt={partnerHasClosedAppPush}
                      partnerName={partnerName}
                      accentColor={accentColor}
                    />

                    {/* Controls Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-y border-white/10">
                      <motion.button
                        type="button"
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
                        onClick={onToggleFloatingAlerts}
                        className="min-h-[38px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-zinc-200 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Bell
                          className="w-3.5 h-3.5 transition-colors"
                          style={{
                            color: prefs.showFloatingAlerts
                              ? prefs.normalNotifColor || accentColor
                              : '#71717A',
                          }}
                        />
                        <span>
                          {prefs.showFloatingAlerts ? 'Pop-up banners on' : 'Pop-up banners hidden'}
                        </span>
                      </motion.button>

                      <div
                        aria-label="Auto-delete duration"
                        className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/35 border border-white/[0.08]"
                      >
                        {TIMER_CHOICES.map((sec) => {
                          const active = prefs.autoDeleteSeconds === sec;
                          return (
                            <motion.button
                              key={sec}
                              type="button"
                              whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                              onClick={() => onChangeAutoDelete(sec)}
                              className={`relative min-h-[32px] px-2.5 rounded-md font-mono text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                                active ? 'text-[#0B0B0F]' : 'text-zinc-400 hover:text-zinc-100'
                              }`}
                            >
                              {active && (
                                <motion.span
                                  layoutId="notif-timer-pill"
                                  transition={pillTransition}
                                  className="absolute inset-0 rounded-md bg-white shadow-sm"
                                />
                              )}
                              {renderAnimatedLabel(`${sec}s`, active)}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onPreviewAlert(false)}
                        className="flex-1 min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.97] text-xs font-medium transition-all cursor-pointer"
                        style={{ color: prefs.normalNotifColor || accentColor }}
                      >
                        Preview normal
                      </button>
                      <button
                        type="button"
                        onClick={() => onPreviewAlert(true)}
                        className="flex-1 min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-[0.97] text-xs font-medium transition-all cursor-pointer"
                        style={{ color: prefs.priorityNotifColor || '#FB7185' }}
                      >
                        Preview priority
                      </button>
                    </div>

                    {pings.length === 0 ? (
                      <div className="py-10 text-center space-y-1.5">
                        <Bell className="w-6 h-6 mx-auto text-zinc-600" />
                        <p className="text-sm text-zinc-300">No active notifications</p>
                        <p className="text-xs text-zinc-500">
                          Incoming attention pings appear here for {prefs.autoDeleteSeconds} seconds.
                        </p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-white/[0.08]">
                        <AnimatePresence initial={false}>
                          {pings.map((ping) => {
                            const isSelf = ping.senderUid === currentUid;
                            const isUrgent = ping.kind === 'urgent_attention';
                            const pingAccent = isUrgent
                              ? prefs.priorityNotifColor || '#FB7185'
                              : prefs.normalNotifColor || accentColor;
                            const pingTag = isUrgent
                              ? prefs.priorityNotifTag.trim() || 'Priority'
                              : prefs.normalNotifTag.trim();
                            const createdMs =
                              ping.clientCreatedMs ??
                              (ping.createdAt?.toMillis ? ping.createdAt.toMillis() : nowMs);
                            const elapsed = Math.max(0, nowMs - createdMs);
                            const remainingMs = Math.max(0, ttlMs - elapsed);
                            const remainingSec = Math.ceil(remainingMs / 1000);
                            const progress = Math.max(0, Math.min(1, remainingMs / ttlMs));

                            return (
                              <motion.li
                                key={ping.pingId}
                                layout
                                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                                transition={{ duration: 0.2 }}
                                className="py-3.5 first:pt-1 last:pb-1 space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {isUrgent ? (
                                      <BellRing className="w-3.5 h-3.5 shrink-0" style={{ color: pingAccent }} />
                                    ) : (
                                      <Bell className="w-3.5 h-3.5 shrink-0" style={{ color: pingAccent }} />
                                    )}
                                    <span
                                      className="font-medium truncate"
                                      style={{ color: isSelf && !isUrgent ? '#E4E4E7' : pingAccent }}
                                    >
                                      {isSelf ? 'You' : ping.senderName}
                                    </span>
                                    {pingTag && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span style={{ color: pingAccent }}>{pingTag}</span>
                                      </>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 font-mono tabular-nums text-zinc-500">
                                    <span>{formatPingTime(ping)}</span>
                                    <span aria-hidden="true">·</span>
                                    <span style={{ color: pingAccent }}>{remainingSec}s</span>
                                  </div>
                                </div>

                                <p className="text-sm text-zinc-100 leading-relaxed break-words">
                                  {ping.message}
                                </p>

                                <div className="h-[2px] w-full rounded-full bg-white/[0.08] overflow-hidden">
                                  <div
                                    className="h-full w-full origin-left"
                                    style={{
                                      backgroundColor: pingAccent,
                                      transform: `scaleX(${progress})`,
                                      transition: 'transform 1000ms linear',
                                    }}
                                  />
                                </div>
                              </motion.li>
                            );
                          })}
                        </AnimatePresence>
                      </ul>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="notif-customize-tab"
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-4"
                  >
                    {/* Normal vs Priority Tier Selector */}
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/35 border border-white/10">
                      {(
                        [
                          { id: 'normal', label: 'Normal alert' },
                          { id: 'priority', label: 'Priority alert (3s hold)' },
                        ] as { id: AlertTier; label: string }[]
                      ).map((tier) => {
                        const active = selectedTier === tier.id;
                        return (
                          <motion.button
                            key={tier.id}
                            type="button"
                            whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                            onClick={() => setSelectedTier(tier.id)}
                            className={`relative min-h-[38px] px-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                              active ? 'text-[#0B0B0F]' : 'text-zinc-300 hover:text-white'
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId="notif-tier-pill"
                                transition={pillTransition}
                                className="absolute inset-0 rounded-lg bg-white shadow-sm"
                              />
                            )}
                            {renderAnimatedLabel(tier.label, active)}
                          </motion.button>
                        );
                      })}
                    </div>

                    {/* Live Banner Preview */}
                    <div
                      className="rounded-2xl border p-3.5 space-y-2 relative overflow-hidden transition-colors"
                      style={{
                        backgroundColor: hexToRgba(backgroundColor, 0.92),
                        borderColor: hexToRgba(currentColor, isPriorityTier ? 0.72 : 0.45),
                        boxShadow: `0 10px 30px ${hexToRgba(currentColor, isPriorityTier ? 0.24 : 0.14)}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          {currentPulse && !prefersReducedMotion && (
                            <motion.span
                              key={`prev_pulse_${selectedTier}`}
                              aria-hidden="true"
                              animate={{ scale: [1, isPriorityTier ? 1.65 : 1.45], opacity: [0.7, 0] }}
                              transition={{
                                duration: isPriorityTier ? 0.95 : 1.4,
                                repeat: Infinity,
                                ease: 'easeOut',
                              }}
                              className="absolute inset-0 rounded-full pointer-events-none"
                              style={{ border: `1.5px solid ${currentColor}` }}
                            />
                          )}
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center border"
                            style={{
                              backgroundColor: hexToRgba(currentColor, isPriorityTier ? 0.26 : 0.18),
                              borderColor: hexToRgba(currentColor, isPriorityTier ? 0.65 : 0.45),
                              color: previewGlow,
                            }}
                          >
                            {isPriorityTier ? (
                              <BellRing className="w-4 h-4" />
                            ) : (
                              <Bell className="w-4 h-4" />
                            )}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200 truncate">
                            <span>Partner</span>
                            {currentTag.trim() && (
                              <>
                                <span aria-hidden="true" className="text-zinc-500">·</span>
                                <span style={{ color: previewGlow }}>{currentTag.trim()}</span>
                              </>
                            )}
                            <span aria-hidden="true" className="text-zinc-500">·</span>
                            <span className="font-mono tabular-nums" style={{ color: currentColor }}>
                              {prefs.autoDeleteSeconds}s
                            </span>
                          </div>
                          <p className="text-sm font-medium text-white truncate mt-0.5">
                            {currentMessage.trim() ||
                              (isPriorityTier
                                ? DEFAULT_THEME_PREFS.priorityNotifMessage
                                : DEFAULT_THEME_PREFS.normalNotifMessage)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Message & Badge Tag Inputs */}
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="notif-msg-input"
                          className="block text-xs font-medium text-zinc-300"
                        >
                          {isPriorityTier ? 'Priority message sent on 3s hold' : 'Normal message sent on tap'}
                        </label>
                        <input
                          id="notif-msg-input"
                          type="text"
                          maxLength={140}
                          value={currentMessage}
                          onChange={(e) =>
                            updatePref(
                              isPriorityTier ? 'priorityNotifMessage' : 'normalNotifMessage',
                              e.target.value
                            )
                          }
                          placeholder={
                            isPriorityTier
                              ? DEFAULT_THEME_PREFS.priorityNotifMessage
                              : DEFAULT_THEME_PREFS.normalNotifMessage
                          }
                          className="w-full min-h-[42px] rounded-xl bg-black/35 border border-white/15 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="notif-tag-input"
                          className="block text-xs font-medium text-zinc-300"
                        >
                          Alert badge label
                        </label>
                        <input
                          id="notif-tag-input"
                          type="text"
                          maxLength={28}
                          value={currentTag}
                          onChange={(e) =>
                            updatePref(
                              isPriorityTier ? 'priorityNotifTag' : 'normalNotifTag',
                              e.target.value
                            )
                          }
                          placeholder={isPriorityTier ? 'Needs you now' : 'Thinking of you'}
                          className="w-full min-h-[42px] rounded-xl bg-black/35 border border-white/15 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                        />
                      </div>
                    </div>

                    {/* Accent Color Swatches */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-300">
                          {isPriorityTier ? 'Priority banner color' : 'Normal banner color'}
                        </span>
                        <span className="font-mono text-xs text-zinc-400 uppercase">
                          {isPriorityTier
                            ? prefs.priorityNotifColor
                            : prefs.normalNotifColor || 'Match button'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {!isPriorityTier && (
                          <motion.button
                            type="button"
                            whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
                            onClick={() => updatePref('normalNotifColor', '')}
                            className={`relative h-10 px-3 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
                              prefs.normalNotifColor === ''
                                ? 'bg-white/15 border-white text-white'
                                : 'bg-black/30 border-white/20 text-zinc-300 hover:border-white/50'
                            }`}
                          >
                            Auto
                          </motion.button>
                        )}
                        {NOTIFICATION_COLOR_SWATCHES.map((swatch) => {
                          const rawColor = isPriorityTier
                            ? prefs.priorityNotifColor
                            : prefs.normalNotifColor;
                          const active = rawColor.toLowerCase() === swatch.hex.toLowerCase();
                          return (
                            <motion.button
                              key={`${selectedTier}_${swatch.hex}`}
                              type="button"
                              title={swatch.name}
                              aria-label={`${selectedTier} notification color ${swatch.name}`}
                              whileTap={prefersReducedMotion ? undefined : { scale: 0.88 }}
                              animate={
                                active && !prefersReducedMotion
                                  ? {
                                      scale: [1, 1.18, 0.98, 1.1, 1.07],
                                      rotate: [0, -5, 4, -1.5, 0],
                                    }
                                  : { scale: 1, rotate: 0 }
                              }
                              transition={{ duration: 0.44, ease: WIGGLE_EASE }}
                              onClick={() =>
                                updatePref(
                                  isPriorityTier ? 'priorityNotifColor' : 'normalNotifColor',
                                  swatch.hex
                                )
                              }
                              className="relative w-10 h-10 rounded-full flex items-center justify-center cursor-pointer border border-white/20"
                              style={{ backgroundColor: swatch.hex }}
                            >
                              {active && (
                                <motion.span
                                  layoutId={`notif-color-ring-${selectedTier}`}
                                  transition={pillTransition}
                                  className="absolute -inset-1 rounded-full border-2 border-white pointer-events-none"
                                />
                              )}
                              {active && <Check className="relative z-10 w-4 h-4 text-[#0B0B0F] drop-shadow" />}
                            </motion.button>
                          );
                        })}
                        <label
                          title="Custom notification color"
                          className="w-10 h-10 rounded-full border border-dashed border-white/35 flex items-center justify-center text-[11px] font-medium text-zinc-200 cursor-pointer overflow-hidden relative hover:border-white/70"
                        >
                          <span>+</span>
                          <input
                            type="color"
                            aria-label="Custom notification color"
                            value={currentColor}
                            onChange={(e) =>
                              updatePref(
                                isPriorityTier ? 'priorityNotifColor' : 'normalNotifColor',
                                e.target.value
                              )
                            }
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Arrival Motion & Pulse Toggle */}
                    <button
                      type="button"
                      onClick={() =>
                        updatePref(
                          isPriorityTier ? 'priorityNotifPulse' : 'normalNotifPulse',
                          !currentPulse
                        )
                      }
                      className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between gap-3 text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-100">Arrival pulse &amp; shimmer</p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {isPriorityTier
                            ? 'Double ring pulse, bell shake, and glow sweep'
                            : 'Soft arrival ring pulse and light sweep'}
                        </p>
                      </div>
                      <span
                        aria-hidden="true"
                        className={`w-10 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
                          currentPulse ? 'justify-end' : 'justify-start bg-white/15'
                        }`}
                        style={currentPulse ? { backgroundColor: currentColor } : undefined}
                      >
                        <motion.span
                          layout
                          animate={
                            prefersReducedMotion
                              ? undefined
                              : {
                                  rotate: currentPulse ? [0, -10, 8, -3, 0] : [0, 10, -8, 3, 0],
                                  scale: [1, 1.12, 0.94, 1.04, 1],
                                }
                          }
                          transition={{
                            layout: pillTransition,
                            rotate: { duration: 0.44, ease: WIGGLE_EASE },
                            scale: { duration: 0.44, ease: WIGGLE_EASE },
                          }}
                          className="w-5 h-5 rounded-full bg-white shadow"
                        />
                      </span>
                    </button>

                    {/* Footer Preview & Reset Actions */}
                    <div className="flex items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdatePrefs({
                            ...prefs,
                            normalNotifMessage: DEFAULT_THEME_PREFS.normalNotifMessage,
                            normalNotifTag: DEFAULT_THEME_PREFS.normalNotifTag,
                            normalNotifColor: DEFAULT_THEME_PREFS.normalNotifColor,
                            normalNotifPulse: DEFAULT_THEME_PREFS.normalNotifPulse,
                            priorityNotifMessage: DEFAULT_THEME_PREFS.priorityNotifMessage,
                            priorityNotifTag: DEFAULT_THEME_PREFS.priorityNotifTag,
                            priorityNotifColor: DEFAULT_THEME_PREFS.priorityNotifColor,
                            priorityNotifPulse: DEFAULT_THEME_PREFS.priorityNotifPulse,
                          })
                        }
                        className="min-h-[42px] px-3.5 rounded-xl bg-white/10 text-zinc-200 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-white/15 active:scale-[0.97] transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                        <span>Reset</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onPreviewAlert(isPriorityTier)}
                        className="flex-1 min-h-[42px] px-4 rounded-xl bg-white text-[#0B0B0F] text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-zinc-200 active:scale-[0.98] transition-all cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>Show live {isPriorityTier ? 'priority' : 'normal'} pop-up</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </LayoutGroup>
        </div>
      )}
    </AnimatePresence>
  );
};
