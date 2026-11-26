import React, { useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { UserProfile } from '../types';

interface NameSetupViewProps {
  profile: UserProfile;
  onSaveName: (name: string) => Promise<void>;
}

export const NameSetupView: React.FC<NameSetupViewProps> = ({
  profile,
  onSaveName,
}) => {
  const [name, setName] = useState(profile.displayName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const trimmed = name.trim();
  const isValid = trimmed.length >= 1 && trimmed.length <= 80;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveName(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your name. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-dvh pt-safe pb-safe px-safe bg-[#0B0B0F] text-[#F5F5F7] flex flex-col overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <motion.div
          animate={
            prefersReducedMotion
              ? undefined
              : {
                  opacity: [0.5, 0.85, 0.5],
                }
          }
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(30rem,140vw)] h-[min(30rem,140vw)] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(245,158,11,0.24) 0%, rgba(245,158,11,0.06) 50%, transparent 74%)',
          }}
        />
      </div>

      <header className="relative z-10 w-full max-w-5xl mx-auto px-5 h-14 flex items-center justify-between gap-4 border-b border-white/[0.06]">
        <span className="font-display text-lg font-medium tracking-tight text-zinc-100 whitespace-nowrap shrink-0">
          Notifye
        </span>
      </header>

      <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-5 py-8 flex items-center justify-center">
        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md rounded-2xl bg-[#14151B]/90 border border-white/[0.08] p-6 sm:p-8 space-y-6 shadow-2xl"
        >
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400/90">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>No account needed</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-medium text-zinc-50 tracking-tight">
              Choose your name
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Pick the name or nickname your partner will see when you pair and send notifications.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="chosen-display-name" className="block text-xs font-medium text-zinc-300">
                Your name
              </label>
              <div className="relative">
                <input
                  id="chosen-display-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 80))}
                  maxLength={80}
                  autoFocus
                  placeholder="Enter your name or nickname"
                  className="w-full min-h-[48px] rounded-xl bg-[#0B0B0F] border border-white/10 pl-4 pr-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/70"
                />
                {name.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setName('')}
                    aria-label="Clear name"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-zinc-500">
                You can change this later before linking with your partner.
              </p>
            </div>

            <button
              type="submit"
              disabled={!isValid || saving}
              className="w-full min-h-[48px] px-5 rounded-xl bg-amber-500 text-[#0B0B0F] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <span>{saving ? 'Saving...' : 'Save & Continue'}</span>
              {!saving && <ArrowRight className="w-4 h-4 shrink-0" />}
            </button>
          </form>
        </motion.div>
      </main>
    </div>
  );
};
