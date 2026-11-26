import React, { useEffect, useState } from 'react';
import {
  Bell,
  LayoutGrid,
  Palette,
  Smartphone,
  Unlink,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type {
  AutoDeleteDuration,
  PairDoc,
  PingDoc,
  StudioThemePrefs,
  UserProfile,
} from '../types';
import { hexToRgba, resolveAmbientPalette } from '../utils/themeColors';
import { IncomingNotification } from './IncomingNotification';
import { ThinkOfMeButton } from './ThinkOfMeButton';

interface PairedStudioProps {
  profile: UserProfile;
  pair: PairDoc;
  pings: PingDoc[];
  themePrefs: StudioThemePrefs;
  onChangeAutoDelete: (seconds: AutoDeleteDuration) => void;
  onOpenCustomize: () => void;
  onOpenNotifications: () => void;
  onOpenWidgets?: () => void;
  soundEnabled: boolean;
  onToggleSound: () => Promise<void>;
  onSendAttentionPing: () => Promise<void>;
  onSendUrgentAttentionPing: () => Promise<void>;
  onUnpair: () => Promise<void>;
  incomingAlert: PingDoc | null;
  onDismissAlert: () => void;
  sendingPing: boolean;
  lastSentFeedback: string | null;
  error: string | null;
  onOpenIpaExport?: () => void;
  isTestMode?: boolean;
  onExitTestMode?: () => void;
  onSimulateIncomingPing?: (urgent?: boolean) => void;
}

function formatPingTime(ping: PingDoc): string {
  const ms = ping.clientCreatedMs ?? (ping.createdAt?.toMillis ? ping.createdAt.toMillis() : Date.now());
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatKindLabel(
  kind: PingDoc['kind'],
  normalTag: string,
  priorityTag: string
): string {
  if (kind === 'urgent_attention') {
    return priorityTag.trim() || 'Priority Attention';
  }
  return normalTag.trim() || 'Attention Ping';
}

const TIMER_CHOICES: AutoDeleteDuration[] = [5, 10, 15];

export const PairedStudio: React.FC<PairedStudioProps> = ({
  profile,
  pair,
  pings,
  themePrefs,
  onChangeAutoDelete,
  onOpenCustomize,
  onOpenNotifications,
  onOpenWidgets,
  soundEnabled,
  onToggleSound,
  onSendAttentionPing,
  onSendUrgentAttentionPing,
  onUnpair,
  incomingAlert,
  onDismissAlert,
  sendingPing,
  lastSentFeedback,
  error,
  onOpenIpaExport,
  isTestMode = false,
  onExitTestMode,
  onSimulateIncomingPing,
}) => {
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clockDate, setClockDate] = useState(() => new Date());
  const [pressWaveCount, setPressWaveCount] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  // Refresh clock once per minute for automatic Ambient Night mode transitions
  useEffect(() => {
    const id = window.setInterval(() => setClockDate(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  // Countdown tick while active pings or floating alert exist
  useEffect(() => {
    if (pings.length === 0 && !incomingAlert) return;
    setNowMs(Date.now());
    // 1 s tick (was 200 ms, which re-rendered the whole studio 5x/second).
    // Progress bars animate smoothly between ticks with a 1 s CSS transition.
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [pings.length, incomingAlert]);

  const ambient = resolveAmbientPalette(themePrefs, clockDate);
  const isPartnerA = pair.partnerAUid === profile.uid;
  const partnerName = isPartnerA ? pair.partnerBName || 'Partner' : pair.partnerAName || 'Partner';
  const ttlMs = themePrefs.autoDeleteSeconds * 1000;

  const handleMainButtonPress = async () => {
    setPressWaveCount((c) => c + 1);
    await onSendAttentionPing();
  };

  const handleMainButtonUrgentPress = async () => {
    setPressWaveCount((c) => c + 1);
    await onSendUrgentAttentionPing();
  };

  // Layout placement & sizing helpers
  const mainJustifyClass =
    themePrefs.buttonPlacement === 'top'
      ? 'justify-start pt-4 sm:pt-8'
      : themePrefs.buttonPlacement === 'bottom'
      ? 'justify-end pb-14 sm:pb-16'
      : 'justify-center';

  const buttonColSpan = themePrefs.showRecentPings
    ? themePrefs.activityScale === 'compact'
      ? 'lg:col-span-8'
      : themePrefs.activityScale === 'expanded'
      ? 'lg:col-span-6'
      : 'lg:col-span-7'
    : 'lg:col-span-12';

  const activityColSpan =
    themePrefs.activityScale === 'compact'
      ? 'lg:col-span-4 p-4'
      : themePrefs.activityScale === 'expanded'
      ? 'lg:col-span-6 p-6 sm:p-7'
      : 'lg:col-span-5 p-5';

  const buttonOrderClass =
    themePrefs.sectionOrder === 'activity_first'
      ? 'order-2 lg:order-2'
      : 'order-1 lg:order-1';

  const activityOrderClass =
    themePrefs.sectionOrder === 'activity_first'
      ? 'order-1 lg:order-1'
      : 'order-2 lg:order-2';

  const tabCount =
    1 + (themePrefs.showNotificationsTab ? 1 : 0) + (onOpenWidgets ? 1 : 0);

  return (
    <div
      className={`min-h-dvh px-safe text-[#F5F5F7] flex flex-col transition-colors duration-500 ${themePrefs.showHeader ? '' : 'pt-safe'}`}
      style={{ backgroundColor: ambient.effectiveBg }}
    >
      {/* Optional Compact Single-Row Top Bar */}
      {themePrefs.showHeader && (
        <header
          className="sticky top-0 z-30 pt-safe border-b border-white/[0.06]"
          style={{
            backgroundColor: hexToRgba(ambient.effectiveBg, 0.96),
          }}
        >
          <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-2.5 min-w-0">
              <span className="font-display text-lg font-medium tracking-tight text-zinc-100 whitespace-nowrap shrink-0">
                Notifye
              </span>
              <span className="text-xs text-zinc-400 truncate">With {partnerName}</span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onOpenIpaExport && (
                <button
                  type="button"
                  onClick={onOpenIpaExport}
                  aria-label="Export iOS .ipa"
                  title="Export iOS .ipa"
                  className="min-h-[36px] px-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] flex items-center justify-center gap-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 shrink-0" style={{ color: ambient.effectiveButton }} />
                  <span className="hidden sm:inline">.ipa</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void onToggleSound()}
                aria-label={soundEnabled ? 'Mute chime' : 'Enable chime'}
                title={soundEnabled ? 'Chime on' : 'Chime muted'}
                className="min-h-[40px] min-w-[40px] rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              {isTestMode && onExitTestMode ? (
                <button
                  type="button"
                  onClick={onExitTestMode}
                  className="min-h-[36px] px-2.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-xs font-medium flex items-center justify-center transition-colors whitespace-nowrap cursor-pointer"
                  style={{ color: ambient.effectiveButton }}
                >
                  Activate pairing
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmUnpair(true)}
                  aria-label="Unpair partner"
                  title="Unpair"
                  className="min-h-[40px] min-w-[40px] rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Unlink className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Optional Animated Floating In-App Notification */}
      <IncomingNotification
        alert={themePrefs.showFloatingAlerts ? incomingAlert : null}
        accentColor={ambient.effectiveButton}
        backgroundColor={ambient.effectiveBg}
        themePrefs={themePrefs}
        ttlMs={ttlMs}
        nowMs={nowMs}
        onDismiss={onDismissAlert}
      />

      {/* Customizable Main Canvas */}
      <main
        className={`flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-main-safe flex flex-col ${mainJustifyClass}`}
      >
        {/* Night dimming: a static overlay is far cheaper than filter: brightness() on the content */}
        {ambient.isNightActive && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-[25] bg-black transition-opacity duration-500"
            style={{ opacity: Math.max(0, Math.min(0.6, 1 - ambient.uiBrightness)) }}
          />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Focal Button Section */}
          <section
            className={`${buttonColSpan} ${buttonOrderClass} flex flex-col items-center text-center space-y-6 py-4 sm:py-6`}
          >
            {themePrefs.showHeading && (
              <motion.div
                key={`heading_${pressWaveCount}`}
                initial={false}
                animate={
                  pressWaveCount > 0 && !prefersReducedMotion
                    ? { y: [0, -5, 1, 0], scale: [1, 1.025, 1] }
                    : undefined
                }
                transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-1.5"
              >
                <h1 className="font-display text-2xl sm:text-3xl font-medium text-zinc-100 [text-wrap:balance]">
                  Reach {partnerName}
                </h1>
                <p className="text-xs text-zinc-400">Tap once to notify</p>
              </motion.div>
            )}

            <div className="py-2">
              <ThinkOfMeButton
                label={themePrefs.buttonLabel}
                subLabel={themePrefs.buttonSubLabel}
                shape={themePrefs.buttonShape}
                animationStyle={themePrefs.touchAnimation}
                color={ambient.effectiveButton}
                size={themePrefs.buttonSize}
                sending={sendingPing}
                onPress={handleMainButtonPress}
                onUrgentPress={handleMainButtonUrgentPress}
              />
            </div>

            {/* Animated Status / Feedback Text on Click (No Ping Counter) */}
            <div className="min-h-[24px] flex items-center justify-center">
              <AnimatePresence mode="wait">
                {error ? (
                  <motion.p
                    key="err"
                    role="alert"
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs text-red-300"
                  >
                    {error}
                  </motion.p>
                ) : lastSentFeedback ? (
                  <motion.p
                    key={`sent_${pressWaveCount}_${lastSentFeedback}`}
                    initial={
                      prefersReducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: 10, scale: 0.96 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={
                      prefersReducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: -8, scale: 0.97 }
                    }
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                    className="text-xs font-medium tracking-wide"
                    style={{ color: ambient.effectiveButton }}
                  >
                    {lastSentFeedback}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          </section>

          {/* Optional Ephemeral Activity Section */}
          {themePrefs.showRecentPings && (
            <section
              className={`${activityColSpan} ${activityOrderClass} rounded-2xl bg-white/[0.025] border border-white/[0.07] space-y-4`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-white/[0.06]">
                <div className="flex items-baseline gap-2">
                  <h2
                    className={`font-display font-medium text-zinc-100 ${
                      themePrefs.activityScale === 'compact' ? 'text-sm' : 'text-base'
                    }`}
                  >
                    Recent pings
                  </h2>
                  <span className="text-xs text-zinc-500 font-mono tabular-nums">
                    {pings.length} active
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {isTestMode && onSimulateIncomingPing && (
                    <>
                      <button
                        type="button"
                        onClick={() => onSimulateIncomingPing(false)}
                        className="min-h-[30px] px-2.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-[11px] font-medium text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Test alert
                      </button>
                      <button
                        type="button"
                        onClick={() => onSimulateIncomingPing(true)}
                        className="min-h-[30px] px-2.5 rounded-lg bg-rose-500/15 border border-rose-400/25 hover:bg-rose-500/25 text-[11px] font-medium text-rose-200 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Test priority
                      </button>
                    </>
                  )}
                  <div
                    aria-label="Auto-delete duration"
                    className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/35 border border-white/[0.08]"
                  >
                    {TIMER_CHOICES.map((sec) => {
                      const active = themePrefs.autoDeleteSeconds === sec;
                      return (
                        <motion.button
                          key={sec}
                          type="button"
                          whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
                          onClick={() => onChangeAutoDelete(sec)}
                          className={`relative min-h-[30px] px-2 rounded-md font-mono text-[11px] font-medium tabular-nums transition-colors cursor-pointer ${
                            active ? 'text-[#0B0B0F]' : 'text-zinc-400 hover:text-zinc-100'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="studio-timer-pill"
                              transition={
                                prefersReducedMotion
                                  ? { duration: 0.1 }
                                  : { type: 'spring', stiffness: 460, damping: 16, mass: 0.72 }
                              }
                              className="absolute inset-0 rounded-md bg-white shadow-sm"
                            />
                          )}
                          <motion.span
                            className="relative z-10 inline-block"
                            animate={
                              active && !prefersReducedMotion
                                ? {
                                    scale: [1, 1.08, 0.96, 1.03, 1],
                                    rotate: [0, -2, 1.4, -0.5, 0],
                                  }
                                : { scale: 1, rotate: 0 }
                            }
                            transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                          >
                            {sec}s
                          </motion.span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {pings.length === 0 ? (
                <div
                  className={`text-center space-y-1 ${
                    themePrefs.activityScale === 'compact' ? 'py-5' : 'py-8'
                  }`}
                >
                  <p className="text-xs text-zinc-400">No active pings</p>
                  <p className="text-[11px] text-zinc-500">
                    Vanishes automatically after {themePrefs.autoDeleteSeconds}s
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  <AnimatePresence initial={false}>
                    {pings.map((ping) => {
                      const isSelf = ping.senderUid === profile.uid;
                      const isUrgent = ping.kind === 'urgent_attention';
                      const customNormalColor = themePrefs.normalNotifColor.trim();
                      const customPriorityColor = themePrefs.priorityNotifColor.trim();
                      const pingAccent = isUrgent
                        ? customPriorityColor || '#FB7185'
                        : customNormalColor || ambient.effectiveButton;
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
                          initial={
                            prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 }
                          }
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={
                            prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.95 }
                          }
                          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                          className={`first:pt-0.5 last:pb-0.5 space-y-1.5 ${
                            themePrefs.activityScale === 'compact'
                              ? 'py-2'
                              : themePrefs.activityScale === 'expanded'
                              ? 'py-4'
                              : 'py-3'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="font-medium truncate"
                                style={{ color: isSelf && !isUrgent ? '#E4E4E7' : pingAccent }}
                              >
                                {isSelf ? 'You' : ping.senderName}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span
                                className="truncate text-[11px]"
                                style={
                                  isUrgent
                                    ? { color: pingAccent }
                                    : customNormalColor
                                    ? { color: pingAccent }
                                    : undefined
                                }
                              >
                                {formatKindLabel(
                                  ping.kind,
                                  themePrefs.normalNotifTag,
                                  themePrefs.priorityNotifTag
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 font-mono tabular-nums text-[11px] text-zinc-500">
                              <span>{formatPingTime(ping)}</span>
                              <span aria-hidden="true">·</span>
                              <span style={{ color: pingAccent }}>{remainingSec}s</span>
                            </div>
                          </div>

                          <p
                            className={`leading-relaxed break-words ${
                              themePrefs.activityScale === 'expanded' ? 'text-[15px]' : 'text-sm'
                            } ${isUrgent ? 'font-medium text-white' : 'text-zinc-200'}`}
                          >
                            {ping.message}
                          </p>

                          <div className="h-[2px] w-full rounded-full bg-white/[0.06] overflow-hidden">
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
            </section>
          )}
        </div>
      </main>

      {/* Bottom tab bar (always visible) */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none flex flex-col justify-end"
      >
        {/* Always-visible bottom tab bar */}
        <nav
          aria-label="Studio tools"
          style={{ backgroundColor: hexToRgba(ambient.effectiveBg, 0.96) }}
          className="pointer-events-auto relative w-full z-20 pb-safe border-t border-white/[0.08]"
        >
          <div
            className={`w-full max-w-md mx-auto h-[54px] px-2 grid items-center ${
              tabCount === 3 ? 'grid-cols-3' : tabCount === 2 ? 'grid-cols-2' : 'grid-cols-1'
            }`}
          >

            {themePrefs.showNotificationsTab && (
              <motion.button
                type="button"
                whileHover={prefersReducedMotion ? undefined : { y: -1.5 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                onClick={() => {
                  onOpenNotifications();
                }}
                className="relative min-h-[44px] px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <div className="relative">
                  <Bell
                    className="w-[18px] h-[18px] shrink-0"
                    style={{ color: hexToRgba(ambient.effectiveButton, 0.85) }}
                  />
                  {pings.length > 0 && (
                    <span
                      className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full"
                      style={{ backgroundColor: ambient.effectiveButton }}
                    />
                  )}
                </div>
                <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                  Notifications
                </span>
              </motion.button>
            )}

            {onOpenWidgets && (
              <motion.button
                type="button"
                whileHover={prefersReducedMotion ? undefined : { y: -1.5 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                onClick={() => {
                  onOpenWidgets();
                }}
                className="min-h-[44px] px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <LayoutGrid
                  className="w-[18px] h-[18px] shrink-0"
                  style={{ color: hexToRgba(ambient.effectiveButton, 0.85) }}
                />
                <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                  Widgets
                </span>
              </motion.button>
            )}

            <motion.button
              type="button"
              whileHover={prefersReducedMotion ? undefined : { y: -1.5 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              onClick={() => {
                onOpenCustomize();
              }}
              className="min-h-[44px] px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] transition-colors cursor-pointer"
            >
              <Palette
                className="w-[18px] h-[18px] shrink-0"
                style={{ color: hexToRgba(ambient.effectiveButton, 0.85) }}
              />
              <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                Customize
              </span>
            </motion.button>
          </div>
        </nav>
      </div>

      {/* Unpair Confirmation Modal */}
      {confirmUnpair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#14151B] border border-white/10 p-6 space-y-4">
            <h3 className="font-display text-xl font-medium text-zinc-100">
              Unlink from {partnerName}?
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              This ends the shared pairing room. You can pair again anytime using a new pairing code.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setConfirmUnpair(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-white/[0.08] text-sm font-medium text-zinc-200 hover:bg-white/[0.12] transition-colors cursor-pointer"
              >
                Keep paired
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmUnpair(false);
                  void onUnpair();
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-red-500/85 text-white text-sm font-semibold hover:bg-red-500 transition-colors cursor-pointer"
              >
                Unlink
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
