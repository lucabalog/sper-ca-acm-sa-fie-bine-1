import React from 'react';
import { BellRing, X } from 'lucide-react';

interface ClosedAppPromptProps {
  accentColor: string;
  onOpen: () => void;
  onDismiss: () => void;
}

/** One-time nudge shown after pairing, above the bottom bar, pointing to the ntfy setup. */
export const ClosedAppPrompt: React.FC<ClosedAppPromptProps> = ({ accentColor, onOpen, onDismiss }) => (
  <div
    className="fixed left-0 right-0 z-[35] px-3 flex justify-center pointer-events-none"
    style={{ bottom: 'calc(54px + var(--safe-bottom) + 12px)' }}
  >
    <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/12 bg-[#16171D] shadow-2xl p-3 flex items-center gap-3">
      <BellRing className="w-5 h-5 shrink-0" style={{ color: accentColor }} />
      <p className="flex-1 min-w-0 text-xs text-zinc-200 leading-snug">
        Get notified even when Notifye is closed. Free, takes a minute.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="min-h-[36px] px-3 rounded-lg text-[#0B0B0F] text-xs font-semibold shrink-0 cursor-pointer"
        style={{ backgroundColor: accentColor }}
      >
        Turn on
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="min-h-[36px] min-w-[36px] rounded-lg text-zinc-400 flex items-center justify-center shrink-0 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  </div>
);
