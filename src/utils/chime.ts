import { triggerHaptic } from './haptics';

type ChimeVariant = 'send' | 'receive' | 'urgentSend' | 'receiveUrgent';

let audioCtx: AudioContext | null = null;
let lastResumeFailedAt = 0;

function createContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    return new Ctx();
  } catch {
    return null;
  }
}

/**
 * Returns a running AudioContext, waking or rebuilding it if needed.
 *
 * Mobile WebViews stop the audio engine after a quiet spell or a trip to the background:
 * the context becomes 'suspended' (Android, iOS) or 'interrupted' (iOS), or a 'running' context
 * silently loses its output. The old code only resumed 'suspended' and played before resume()
 * finished, so the button went silent until the app was killed.
 */
async function getRunningContext(): Promise<AudioContext | null> {
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = createContext();
  const ctx = audioCtx;
  if (!ctx) return null;
  if (ctx.state === 'running') return ctx;

  try {
    await Promise.race([
      ctx.resume(),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('resume timeout')), 400)),
    ]);
  } catch {
    // fall through to the state check
  }
  if ((ctx.state as AudioContextState) === 'running') return ctx;

  // Resume didn't take: throw the context away and start a fresh one (needs a user gesture,
  // which the button press is). Avoid rebuilding in a tight loop.
  const now = Date.now();
  if (now - lastResumeFailedAt < 1000) return null;
  lastResumeFailedAt = now;
  void ctx.close().catch(() => undefined);
  audioCtx = createContext();
  if (!audioCtx) return null;
  try {
    await audioCtx.resume();
  } catch {
    // ignore
  }
  return audioCtx.state === 'running' ? audioCtx : null;
}

/** Call from a user gesture (first tap) so later sounds are allowed to play. */
export function unlockAudio(): void {
  void getRunningContext();
}

// After the app comes back to the foreground, rebuild the context: on iOS a context that
// survived a background trip often reports 'running' but produces no sound.
if (typeof document !== 'undefined') {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt > 5000 && audioCtx) {
      const old = audioCtx;
      audioCtx = null;
      void old.close().catch(() => undefined);
    }
  });
}

function playNotes(ctx: AudioContext, variant: ChimeVariant): void {
  const now = ctx.currentTime + 0.01;
  const notes =
    variant === 'receiveUrgent'
      ? [523.25, 659.25, 783.99, 1046.5]
      : variant === 'urgentSend'
      ? [440, 587.33, 783.99]
      : variant === 'receive'
      ? [440, 554.37, 659.25]
      : [392, 523.25];

  const isUrgent = variant === 'urgentSend' || variant === 'receiveUrgent';
  const isReceive = variant === 'receive' || variant === 'receiveUrgent';

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + idx * (isUrgent ? 0.075 : 0.085);
    const duration = isUrgent ? 1.05 : isReceive ? 0.85 : 0.45;

    osc.type = idx === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(isUrgent ? 0.16 : isReceive ? 0.14 : 0.08, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + duration + 0.02);
  });
}

export function playWarmChime(variant: ChimeVariant): void {
  if (variant === 'receive') {
    triggerHaptic('receive');
  } else if (variant === 'receiveUrgent') {
    triggerHaptic('receiveUrgent');
  }

  const ctx = audioCtx;
  if (ctx && ctx.state === 'running') {
    try {
      playNotes(ctx, variant);
    } catch {
      // ignore
    }
    return;
  }
  void getRunningContext().then((running) => {
    if (!running) return;
    try {
      playNotes(running, variant);
    } catch {
      // ignore
    }
  });
}
