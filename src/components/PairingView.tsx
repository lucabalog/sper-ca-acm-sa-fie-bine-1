import React, { useState } from 'react';
import { Check, Copy, Link2, Pencil, RefreshCw, Smartphone, X } from 'lucide-react';
import type { PairDoc, UserProfile } from '../types';

interface PairingViewProps {
  profile: UserProfile;
  waitingPair: PairDoc | null;
  pendingCode: string;
  onCreateCode: () => Promise<void>;
  onCancelCode: () => Promise<void>;
  onJoinWithCode: (code: string) => Promise<void>;
  onUpdateName: (name: string) => Promise<void>;
  onBypassPairing: () => void;
  /** Developer export tool; omitted inside the installed app. */
  onOpenIpaExport?: () => void;
  busy: boolean;
  error: string | null;
}

export const PairingView: React.FC<PairingViewProps> = ({
  profile,
  waitingPair,
  pendingCode,
  onCreateCode,
  onCancelCode,
  onJoinWithCode,
  onUpdateName,
  onBypassPairing,
  onOpenIpaExport,
  busy,
  error,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(profile.displayName);
  const [savingName, setSavingName] = useState(false);

  const handleCopy = async () => {
    if (!pendingCode) return;
    try {
      await navigator.clipboard.writeText(pendingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inputCode.trim().toUpperCase();
    if (cleaned.length === 6) {
      void onJoinWithCode(cleaned);
    }
  };

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = draftName.trim().slice(0, 80);
    if (!cleaned || savingName) return;
    setSavingName(true);
    try {
      await onUpdateName(cleaned);
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="min-h-dvh pt-safe pb-safe px-safe bg-[#0B0B0F] text-[#F5F5F7] flex flex-col">
      <header className="w-full max-w-5xl mx-auto px-5 h-14 flex items-center justify-between gap-4 border-b border-white/[0.06]">
        <span className="font-display text-lg font-medium tracking-tight text-zinc-100 whitespace-nowrap shrink-0">
          Notifye
        </span>
        {onOpenIpaExport && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenIpaExport}
            className="min-h-[38px] px-2.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs font-medium text-zinc-200 hover:text-white hover:bg-white/[0.11] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Export as iOS .ipa"
          >
            <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>iOS .ipa</span>
          </button>
        </div>
        )}
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-5 py-8 sm:py-12 flex items-center">
        <div className="w-full space-y-8">
          <div className="max-w-xl space-y-2.5">
            {editingName ? (
              <form onSubmit={handleNameSubmit} className="flex flex-wrap items-center gap-2">
                <label htmlFor="pairing-edit-name" className="sr-only">
                  Your display name
                </label>
                <input
                  id="pairing-edit-name"
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value.slice(0, 80))}
                  maxLength={80}
                  autoFocus
                  placeholder="Your name"
                  className="min-h-[38px] rounded-lg bg-[#14151B] border border-amber-500/50 px-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!draftName.trim() || savingName}
                  className="min-h-[38px] px-3 rounded-lg bg-amber-500 text-[#0B0B0F] text-xs font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {savingName ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(profile.displayName);
                    setEditingName(false);
                  }}
                  aria-label="Cancel editing name"
                  className="min-h-[38px] min-w-[38px] rounded-lg bg-white/[0.06] text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>
                  You&apos;re{' '}
                  <span className="text-zinc-200 font-medium">{profile.displayName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDraftName(profile.displayName);
                    setEditingName(true);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-[11px] text-zinc-300 transition-colors cursor-pointer"
                >
                  <Pencil className="w-3 h-3 text-amber-400" />
                  <span>Change name</span>
                </button>
              </div>
            )}
            <h1 className="font-display text-3xl sm:text-4xl font-medium text-zinc-50 tracking-tight [text-wrap:balance]">
              Link with your partner
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              One partner generates a 6-character code, and the other enters it below. Once paired, your space opens immediately.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="max-w-xl rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Option 1: Create Code */}
            <section className="rounded-2xl bg-[#14151B] border border-white/[0.08] p-6 sm:p-7 flex flex-col justify-between space-y-6">
              <div className="space-y-2">
                <h2 className="font-display text-xl font-medium text-zinc-100">
                  01. Create a pairing code
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Share this code with your partner. This screen updates automatically the moment they join.
                </p>
              </div>

              {waitingPair && pendingCode ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-[#0B0B0F] border border-amber-500/30 p-5 text-center space-y-2">
                    <span className="block text-xs text-zinc-400">Your active pairing code</span>
                    <div className="font-mono text-3xl sm:text-4xl font-semibold tracking-[0.28em] text-amber-300 tabular-nums pl-[0.28em]">
                      {pendingCode}
                    </div>
                    <p className="text-xs text-amber-200/70">Waiting for your partner to link...</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleCopy()}
                      className="flex-1 min-h-[44px] px-4 rounded-xl bg-amber-500 text-[#0B0B0F] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {copied ? <Check className="w-4 h-4 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
                      <span>{copied ? 'Copied' : 'Copy code'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onCancelCode()}
                      disabled={busy}
                      className="min-h-[44px] px-4 rounded-xl bg-white/[0.06] text-zinc-300 text-sm font-medium hover:bg-white/[0.1] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void onCreateCode()}
                  disabled={busy}
                  className="w-full min-h-[48px] px-5 rounded-xl bg-amber-500 text-[#0B0B0F] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`w-4 h-4 shrink-0 ${busy ? 'animate-spin' : ''}`} />
                  <span>{busy ? 'Creating...' : 'Create pairing code'}</span>
                </button>
              )}
            </section>

            {/* Option 2: Enter Partner Code */}
            <section className="rounded-2xl bg-[#14151B] border border-white/[0.08] p-6 sm:p-7 flex flex-col justify-between space-y-6">
              <div className="space-y-2">
                <h2 className="font-display text-xl font-medium text-zinc-100">
                  02. Enter partner&apos;s code
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Already have a 6-character code from your partner? Enter it here to connect.
                </p>
              </div>

              <form onSubmit={handleJoinSubmit} className="space-y-4">
                <div>
                  <label htmlFor="pairing-code-input" className="sr-only">
                    6-character pairing code
                  </label>
                  <input
                    id="pairing-code-input"
                    type="text"
                    value={inputCode}
                    onChange={(e) =>
                      setInputCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
                    }
                    placeholder="ABC234"
                    maxLength={6}
                    autoComplete="off"
                    className="w-full min-h-[52px] rounded-xl bg-[#0B0B0F] border border-white/10 px-4 text-center font-mono text-2xl font-semibold tracking-[0.28em] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/70 tabular-nums"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || inputCode.trim().length !== 6}
                  className="w-full min-h-[48px] px-5 rounded-xl bg-white/[0.09] border border-white/10 text-zinc-100 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-white/[0.14] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  <Link2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{busy ? 'Linking...' : 'Link partner'}</span>
                </button>
              </form>
            </section>
          </div>

          <div className="rounded-2xl bg-[#14151B]/70 border border-white/[0.06] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-zinc-200">Testing on one phone?</p>
              <p className="text-xs text-zinc-400">
                Bypass the pairing code wall to preview the studio, alerts, and customization solo.
              </p>
            </div>
            <button
              type="button"
              onClick={onBypassPairing}
              className="min-h-[42px] px-4 rounded-xl bg-white/[0.08] border border-white/10 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14] active:scale-[0.98] transition-all whitespace-nowrap cursor-pointer shrink-0"
            >
              Bypass code wall (Test mode)
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
