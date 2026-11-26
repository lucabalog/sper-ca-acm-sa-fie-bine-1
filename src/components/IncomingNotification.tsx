import React from 'react';
import { Bell, BellRing, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { PingDoc, StudioThemePrefs } from '../types';
import { hexToRgba, shiftColor } from '../utils/themeColors';

interface IncomingNotificationProps {
  alert: PingDoc | null;
  accentColor: string;
  backgroundColor: string;
  themePrefs: StudioThemePrefs;
  ttlMs: number;
  nowMs: number;
  onDismiss: () => void;
}

function formatAlertTime(ping: PingDoc): string {
  const ms = ping.clientCreatedMs ?? (ping.createdAt?.toMillis ? ping.createdAt.toMillis() : Date.now());
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const IncomingNotification: React.FC<IncomingNotificationProps> = ({
  alert,
  accentColor,
  backgroundColor,
  themePrefs,
  ttlMs,
  nowMs,
  onDismiss,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const isUrgent = alert?.kind === 'urgent_attention';

  const createdMs = alert
    ? alert.clientCreatedMs ?? (alert.createdAt?.toMillis ? alert.createdAt.toMillis() : nowMs)
    : nowMs;
  const elapsed = Math.max(0, nowMs - createdMs);
  const remainingMs = Math.max(0, ttlMs - elapsed);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / ttlMs));

  const effectiveAccent = isUrgent
    ? themePrefs.priorityNotifColor || '#FB7185'
    : themePrefs.normalNotifColor || accentColor;
  const badgeTag = isUrgent
    ? themePrefs.priorityNotifTag.trim()
    : themePrefs.normalNotifTag.trim();
  const pulseActive = isUrgent ? themePrefs.priorityNotifPulse : themePrefs.normalNotifPulse;
  const glowHighlight = shiftColor(effectiveAccent, 28);

  return (
    <div
      aria-live={isUrgent ? 'assertive' : 'polite'}
      className="fixed top-notification left-0 right-0 z-40 px-3 sm:px-6 pointer-events-none flex justify-center"
    >
      <AnimatePresence mode="wait">
        {alert && (
          <motion.div
            key={alert.pingId}
            role="status"
            drag={prefersReducedMotion ? false : 'y'}
            dragConstraints={{ top: -80, bottom: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.y < -28 || info.velocity.y < -280) {
                onDismiss();
              }
            }}
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -28, scale: 0.9 }
            }
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : isUrgent && pulseActive
                ? { opacity: 1, y: 0, scale: [0.95, 1.025, 0.99, 1] }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -22, scale: 0.94 }
            }
            transition={
              isUrgent && pulseActive && !prefersReducedMotion
                ? {
                    y: { type: 'spring', stiffness: 420, damping: 24, mass: 0.85 },
                    opacity: { duration: 0.2 },
                    scale: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
                  }
                : { type: 'spring', stiffness: 400, damping: 24, mass: 0.85 }
            }
            className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl touch-pan-x"
            style={{
              backgroundColor: hexToRgba(backgroundColor, 0.9),
              borderColor: hexToRgba(effectiveAccent, isUrgent ? 0.72 : 0.45),
              boxShadow: isUrgent
                ? `0 20px 56px rgba(0, 0, 0, 0.65), 0 0 48px ${hexToRgba(effectiveAccent, 0.38)}`
                : `0 18px 48px rgba(0, 0, 0, 0.55), 0 0 36px ${hexToRgba(effectiveAccent, 0.22)}`,
            }}
          >
            {/* Ambient Shimmer Sweep */}
            {!prefersReducedMotion && pulseActive && (
              <motion.div
                aria-hidden="true"
                initial={{ x: '-110%', opacity: 0 }}
                animate={{ x: '130%', opacity: [0, isUrgent ? 0.65 : 0.45, 0] }}
                transition={{
                  duration: isUrgent ? 1.1 : 1.3,
                  repeat: isUrgent ? 2 : 0,
                  repeatDelay: 0.6,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.08,
                }}
                className="absolute inset-y-0 w-1/2 pointer-events-none"
                style={{
                  background: `linear-gradient(105deg, transparent 0%, ${hexToRgba(
                    glowHighlight,
                    isUrgent ? 0.32 : 0.22
                  )} 50%, transparent 100%)`,
                }}
              />
            )}

            <div className="relative p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Animated Partner Monogram + Arrival Pulse */}
                  <div className="relative shrink-0">
                    {!prefersReducedMotion && pulseActive && (
                      <motion.span
                        aria-hidden="true"
                        initial={{ scale: 0.9, opacity: 0.85 }}
                        animate={{ scale: [1, isUrgent ? 1.75 : 1.55], opacity: [0.75, 0] }}
                        transition={{
                          duration: isUrgent ? 0.95 : 1.4,
                          repeat: Infinity,
                          ease: 'easeOut',
                        }}
                        className="absolute inset-0 rounded-full pointer-events-none"
                        style={{ border: `1.5px solid ${effectiveAccent}` }}
                      />
                    )}
                    <motion.div
                      animate={
                        prefersReducedMotion || !pulseActive
                          ? undefined
                          : isUrgent
                          ? { rotate: [0, -14, 14, -10, 10, -4, 0], scale: [1, 1.14, 1] }
                          : { rotate: [0, -10, 9, -6, 3, 0], scale: [1, 1.08, 1] }
                      }
                      transition={{
                        duration: isUrgent ? 0.85 : 0.7,
                        repeat: isUrgent ? 2 : 0,
                        repeatDelay: 0.5,
                        delay: 0.08,
                        ease: 'easeInOut',
                      }}
                      className="w-9 h-9 rounded-full flex items-center justify-center border"
                      style={{
                        backgroundColor: hexToRgba(effectiveAccent, isUrgent ? 0.26 : 0.18),
                        borderColor: hexToRgba(effectiveAccent, isUrgent ? 0.65 : 0.45),
                        color: glowHighlight,
                      }}
                    >
                      {isUrgent ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                    </motion.div>
                  </div>

                  <motion.div
                    initial={prefersReducedMotion ? undefined : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
                    className="min-w-0"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200 truncate">
                      <span className="truncate">{alert.senderName}</span>
                      {badgeTag && (
                        <>
                          <span aria-hidden="true" className="text-zinc-500">·</span>
                          <span style={{ color: glowHighlight }}>{badgeTag}</span>
                        </>
                      )}
                      <span aria-hidden="true" className="text-zinc-500">·</span>
                      <span className="font-mono tabular-nums text-zinc-400">
                        {formatAlertTime(alert)}
                      </span>
                      <span aria-hidden="true" className="text-zinc-500">·</span>
                      <span
                        className="font-mono tabular-nums"
                        style={{ color: effectiveAccent }}
                      >
                        {remainingSec}s
                      </span>
                    </div>

                    <motion.p
                      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
                      className="text-sm font-medium leading-snug mt-0.5 break-words text-white"
                    >
                      {alert.message}
                    </motion.p>
                  </motion.div>
                </div>

                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label="Dismiss notification"
                  className="min-h-[40px] min-w-[40px] -mr-1.5 -mt-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

            </div>

            {/* Countdown Progress Hairline */}
            <div className="h-[2.5px] w-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full w-full origin-left"
                style={{
                  backgroundColor: effectiveAccent,
                  transform: `scaleX(${progress})`,
                  transition: 'transform 1000ms linear',
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
