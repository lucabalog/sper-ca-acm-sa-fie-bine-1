import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BellRing, Check, ClipboardCheck, ExternalLink, Loader2 } from 'lucide-react';
import {
  getReceiveTopic,
  ntfyStoreUrl,
  onAppResume,
  openExternal,
  openNtfySubscription,
  sendTestPush,
} from '../utils/closedAppPush';

interface ClosedAppNotificationsCardProps {
  enabled: boolean;
  onSetEnabled: (enabled: boolean) => void;
  partnerHasIt: boolean;
  partnerName: string;
  accentColor: string;
}

/**
 * One-button setup for notifications while Notifye is closed (relayed by the free ntfy app).
 *
 * Android: Turn on -> ntfy opens already subscribed (or Google Play first, then ntfy
 * automatically when you come back) -> back in Notifye a test notification is sent. Done.
 * iPhone: the ntfy iPhone app has no links to subscribe from another app, so Turn on copies the
 * code and you paste it once in ntfy; coming back to Notifye sends the test automatically.
 */
type Phase =
  | 'idle'
  | 'installing' // Android: sent to Google Play, open ntfy when the user returns
  | 'subscribing' // Android: ntfy opened on the topic, finish when the user returns
  | 'pasting' // iPhone / web: code copied, waiting for the user to paste it in ntfy
  | 'testing'
  | 'done'
  | 'failed';

export const ClosedAppNotificationsCard: React.FC<ClosedAppNotificationsCardProps> = ({
  enabled,
  onSetEnabled,
  partnerHasIt,
  partnerName,
  accentColor,
}) => {
  const [topic] = useState(getReceiveTopic);
  const [phase, setPhase] = useState<Phase>('idle');
  const [copied, setCopied] = useState(false);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;
  const isAndroid = Capacitor.getPlatform() === 'android';

  const runTest = async () => {
    setPhase('testing');
    setPhase((await sendTestPush(topic)) ? 'done' : 'failed');
  };

  const copyTopic = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(topic);
      setCopied(true);
      return true;
    } catch {
      // Older WebViews: fall back to a hidden textarea + execCommand('copy').
      try {
        const ta = document.createElement('textarea');
        ta.value = topic;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, topic.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(ok);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const turnOn = async () => {
    onSetEnabled(true);
    if (isAndroid) {
      if (await openNtfySubscription(topic)) {
        setPhase('subscribing');
      } else {
        setPhase('installing');
        await openExternal(ntfyStoreUrl());
      }
      return;
    }
    await copyTopic();
    setPhase('pasting');
  };

  // Coming back to Notifye moves the setup forward without any extra taps.
  useEffect(
    () =>
      onAppResume(() => {
        const p = phaseRef.current;
        if (p === 'installing') {
          void openNtfySubscription(topic).then((opened) => opened && setPhase('subscribing'));
        } else if (p === 'subscribing' || p === 'pasting') {
          void runTest();
        }
      }),
    [topic]
  );

  const partnerLine = partnerHasIt
    ? `${partnerName} has it on too.`
    : `${partnerName} hasn't turned it on yet. Until they do, your taps reach them only while their Notifye is open.`;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
      <div className="flex items-start gap-3">
        <BellRing className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accentColor }} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-100">Notify me when Notifye is closed</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Free, no account. Delivered by the ntfy app.
          </p>
        </div>
        {enabled && phase === 'idle' && (
          <span className="text-xs font-semibold flex items-center gap-1 shrink-0" style={{ color: accentColor }}>
            <Check className="w-3.5 h-3.5" /> On
          </span>
        )}
      </div>

      {!enabled && (
        <button
          type="button"
          onClick={() => void turnOn()}
          className="w-full min-h-[46px] rounded-xl text-[#0B0B0F] text-sm font-semibold cursor-pointer active:scale-[0.98] transition-transform"
          style={{ backgroundColor: accentColor }}
        >
          Turn on
        </button>
      )}

      {phase === 'installing' && (
        <p className="text-xs text-zinc-300 leading-relaxed">
          Install <span className="font-semibold text-zinc-100">ntfy</span> from Google Play, then come back here.
          Notifye will finish the setup.
        </p>
      )}

      {phase === 'subscribing' && (
        <p className="text-xs text-zinc-300 leading-relaxed">
          In ntfy, allow notifications if asked, then come back here to finish.
        </p>
      )}

      {phase === 'pasting' && (
        <div className="space-y-2.5">
          <p className="text-xs text-zinc-300 flex items-center gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
            {copied ? 'Your private code is copied.' : 'Copy your private code:'}
          </p>
          {!copied && (
            <code className="block truncate rounded-lg bg-black/40 border border-white/10 px-2.5 py-2 font-mono text-[12px] text-zinc-200 select-all">
              {topic}
            </code>
          )}
          <ol className="text-xs text-zinc-300 leading-relaxed list-decimal pl-4 space-y-0.5">
            <li>
              Open <span className="font-semibold text-zinc-100">ntfy</span> (
              <button
                type="button"
                onClick={() => void openExternal(ntfyStoreUrl())}
                className="underline underline-offset-2 text-zinc-100 cursor-pointer inline-flex items-center gap-0.5"
              >
                get it free <ExternalLink className="w-3 h-3" />
              </button>
              ).
            </li>
            <li>
              Tap <span className="font-semibold text-zinc-100">+</span>, paste, tap{' '}
              <span className="font-semibold text-zinc-100">Subscribe</span> and allow notifications.
            </li>
            <li>Come back here. A test notification is sent automatically.</li>
          </ol>
          <button
            type="button"
            onClick={() => void runTest()}
            className="min-h-[36px] px-3 rounded-lg bg-white/[0.08] border border-white/10 text-xs font-medium text-zinc-100 cursor-pointer"
          >
            I&apos;ve subscribed
          </button>
        </div>
      )}

      {phase === 'testing' && (
        <p className="text-xs text-zinc-300 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending a test notification…
        </p>
      )}

      {phase === 'done' && (
        <p className="text-xs text-zinc-300 leading-relaxed">
          <span className="font-semibold" style={{ color: accentColor }}>Done.</span> You should see a test
          notification from ntfy. If it didn&apos;t arrive, check that ntfy is allowed to send notifications.
        </p>
      )}

      {phase === 'failed' && (
        <p className="text-xs text-rose-300">
          Couldn&apos;t reach ntfy. Check your internet connection and{' '}
          <button type="button" onClick={() => void runTest()} className="underline cursor-pointer">
            try again
          </button>
          .
        </p>
      )}

      {enabled && (
        <div className="space-y-2 pt-2 border-t border-white/10">
          <p className="text-[12px] text-zinc-500 leading-relaxed">{partnerLine}</p>
          <div className="flex items-center gap-4 text-xs">
            {(phase === 'idle' || phase === 'done') && (
              <button type="button" onClick={() => void runTest()} className="text-zinc-300 underline underline-offset-2 cursor-pointer">
                Send test
              </button>
            )}
            {phase === 'idle' && !isAndroid && (
              <button
                type="button"
                onClick={() => void copyTopic().then(() => setPhase('pasting'))}
                className="text-zinc-300 underline underline-offset-2 cursor-pointer"
              >
                Set up again
              </button>
            )}
            {phase === 'idle' && isAndroid && (
              <button type="button" onClick={() => void turnOn()} className="text-zinc-300 underline underline-offset-2 cursor-pointer">
                Open in ntfy
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onSetEnabled(false);
                setPhase('idle');
                setCopied(false);
              }}
              className="text-zinc-500 underline underline-offset-2 cursor-pointer ml-auto"
            >
              Turn off
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
