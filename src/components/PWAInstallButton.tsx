import React, { useState } from 'react';
import { Download, Share } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'full' }> = ({
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'full') {
      return (
        <p className="text-xs text-zinc-400">
          Installed as a standalone app on this device.
        </p>
      );
    }
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          variant === 'full'
            ? 'w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-[#0B0B0F] hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
            : 'min-h-[40px] flex items-center gap-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'full'
              ? 'w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-white/10 border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-white/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
              : 'min-h-[40px] flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
          }
        >
          <Share className="w-3.5 h-3.5 shrink-0" />
          Install on iOS
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#14151B] border border-white/10 p-6 space-y-4">
              <h3 className="font-display text-xl font-medium text-zinc-100">
                Install on iPhone or iPad
              </h3>
              <ol className="space-y-2 text-sm text-zinc-300 leading-relaxed list-decimal list-inside">
                <li>
                  Tap the <span className="font-semibold text-amber-300">Share</span> icon in the Safari toolbar.
                </li>
                <li>
                  Scroll down and choose <span className="font-semibold text-amber-300">Add to Home Screen</span>.
                </li>
                <li>
                  Open <span className="font-semibold text-zinc-100">Notifye</span> from your home screen for standalone mode and iOS push alerts.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-white/10 text-sm font-medium text-zinc-100 hover:bg-white/15 transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (variant === 'full') {
    return (
      <p className="text-xs text-zinc-400 leading-relaxed">
        Use your browser&apos;s <span className="text-zinc-200 font-medium">Install Notifye</span> option in the address bar or menu to add Notifye to your home screen or desktop.
      </p>
    );
  }

  return null;
};
