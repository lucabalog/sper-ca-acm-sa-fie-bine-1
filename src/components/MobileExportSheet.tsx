import React, { useState } from 'react';
import { Check, Download, FileArchive, Globe, Package, Smartphone, X } from 'lucide-react';
import { downloadFlutterGitHubIpaBundle } from '../utils/flutterExport';
import { downloadCapacitorIpaBundle } from '../utils/iosExport';

interface MobileExportSheetProps {
  open: boolean;
  onClose: () => void;
  accentColor?: string;
}

type CapacitorMode = 'bundled' | 'hosted';

export const MobileExportSheet: React.FC<MobileExportSheetProps> = ({
  open,
  onClose,
  accentColor = '#F59E0B',
}) => {
  const [capMode, setCapMode] = useState<CapacitorMode>('bundled');
  const [hostedUrl, setHostedUrl] = useState(() => {
    if (typeof window !== 'undefined' && window.location.origin.startsWith('https://')) {
      return window.location.origin;
    }
    return '';
  });
  const [downloadingCap, setDownloadingCap] = useState(false);
  const [capDone, setCapDone] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);

  const [downloadingFlutter, setDownloadingFlutter] = useState(false);
  const [flutterDone, setFlutterDone] = useState(false);

  if (!open) return null;

  const handleDownloadCapacitor = async () => {
    setDownloadingCap(true);
    setCapDone(false);
    setCapError(null);
    try {
      await downloadCapacitorIpaBundle(
        capMode === 'hosted' ? hostedUrl.trim() : undefined
      );
      setCapDone(true);
    } catch (err) {
      setCapError(
        err instanceof Error ? err.message : 'Failed to prepare iOS IPA bundle.'
      );
    } finally {
      setDownloadingCap(false);
    }
  };

  const handleDownloadFlutter = async () => {
    setDownloadingFlutter(true);
    setFlutterDone(false);
    try {
      await downloadFlutterGitHubIpaBundle();
      setFlutterDone(true);
    } finally {
      setDownloadingFlutter(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-export-title"
        className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain pb-sheet-safe rounded-t-3xl sm:rounded-2xl bg-[#14151B] border border-white/10 p-5 sm:p-6 space-y-5 shadow-2xl"
      >
        <div className="w-10 h-1 bg-white/15 rounded-full mx-auto sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
              <h2 id="mobile-export-title" className="font-display text-xl font-medium text-zinc-100">
                Export iOS .ipa
              </h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Package Notifye with Capacitor &amp; Xcode build scripts to compile <span className="font-mono text-zinc-300">Notifye-unsigned.ipa</span> on GitHub&apos;s free macOS runner or a Mac.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close iOS IPA export sheet"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Full Notifye App via Capacitor */}
        <section className="rounded-2xl bg-black/30 border border-white/10 p-4 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">
              01. Full Notifye App (Capacitor → .ipa)
            </h3>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white/10 text-zinc-200">
              Recommended
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Includes the full Notifye interface, interactive iOS 17+ Home Screen &amp; Lock Screen widgets (<span className="font-mono text-zinc-300">ios-widget/</span>), <span className="font-mono text-zinc-300">capacitor.config.json</span>, <span className="font-mono text-zinc-300">.github/workflows/build-ios-ipa.yml</span>, and <span className="font-mono text-zinc-300">build-ipa.sh</span>.
          </p>

          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/45 border border-white/10">
            <button
              type="button"
              onClick={() => setCapMode('bundled')}
              className={`min-h-[38px] px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                capMode === 'bundled'
                  ? 'bg-white text-[#0B0B0F]'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5 shrink-0" />
              <span>Bundled app</span>
            </button>
            <button
              type="button"
              onClick={() => setCapMode('hosted')}
              className={`min-h-[38px] px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                capMode === 'hosted'
                  ? 'bg-white text-[#0B0B0F]'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>Live HTTPS URL</span>
            </button>
          </div>

          {capMode === 'hosted' && (
            <div className="space-y-1.5">
              <label htmlFor="ipa-hosted-url" className="block text-[11px] text-zinc-400">
                App HTTPS URL wrapped inside the .ipa shell
              </label>
              <input
                id="ipa-hosted-url"
                type="url"
                value={hostedUrl}
                onChange={(e) => setHostedUrl(e.target.value)}
                placeholder="https://your-notifye-app.example"
                className="w-full min-h-[40px] rounded-xl bg-[#0B0B0F] border border-white/15 px-3 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
              />
            </div>
          )}

          {capError && (
            <p role="alert" className="text-xs text-red-300">
              {capError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleDownloadCapacitor()}
            disabled={downloadingCap || (capMode === 'hosted' && !hostedUrl.trim().startsWith('https://'))}
            style={{ backgroundColor: accentColor }}
            className="w-full min-h-[46px] px-4 rounded-xl text-[#0B0B0F] text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
          >
            {capDone ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : downloadingCap ? (
              <Download className="w-4 h-4 animate-bounce shrink-0" />
            ) : (
              <FileArchive className="w-4 h-4 shrink-0" />
            )}
            <span>
              {capDone
                ? 'Downloaded notifye-ios-ipa-project.zip'
                : downloadingCap
                ? 'Packaging Notifye iOS project...'
                : 'Download Capacitor .ipa Project (.zip)'}
            </span>
          </button>

          <ol className="text-[11px] text-zinc-400 space-y-1 list-decimal list-inside pt-1 leading-relaxed">
            <li>Unzip and push to a GitHub repo (or run <span className="font-mono text-zinc-300">./build-ipa.sh</span> on a Mac).</li>
            <li>On GitHub, open <span className="text-zinc-200 font-medium">Actions → Build iOS IPA</span> and download <span className="font-mono text-zinc-300">Notifye-unsigned.ipa</span>.</li>
            <li>Install on iPhone using <span className="text-zinc-200 font-medium">Sideloadly</span>, <span className="text-zinc-200 font-medium">AltStore</span>, or Xcode signing.</li>
          </ol>
        </section>

        {/* Section 2: Native Flutter Alternative */}
        <section className="rounded-2xl bg-black/20 border border-white/[0.08] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-100">
            02. Native Flutter Minimal (.ipa)
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Lightweight native Dart/Flutter starter wired to your Firebase project with its own GitHub Actions macOS workflow (<span className="font-mono text-zinc-300">Notifye-unsigned.ipa</span>).
          </p>

          <button
            type="button"
            onClick={() => void handleDownloadFlutter()}
            disabled={downloadingFlutter}
            className="w-full min-h-[42px] px-4 rounded-xl bg-white/[0.08] border border-white/10 text-zinc-100 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-white/[0.14] transition-colors disabled:opacity-60 cursor-pointer"
          >
            {flutterDone ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : downloadingFlutter ? (
              <Download className="w-4 h-4 animate-bounce shrink-0" />
            ) : (
              <FileArchive className="w-4 h-4 shrink-0" />
            )}
            <span>
              {flutterDone
                ? 'Downloaded notifye-flutter-ipa.zip'
                : downloadingFlutter
                ? 'Packaging Flutter project...'
                : 'Download Native Flutter .ipa Zip'}
            </span>
          </button>
        </section>
      </div>
    </div>
  );
};
