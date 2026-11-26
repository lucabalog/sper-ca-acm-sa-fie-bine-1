import React, { useState } from 'react';
import { Check, Eye, Moon, RotateCcw, Sparkles, Vibrate, X } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import type {
  ActivityScaleOption,
  AmbientNightMode,
  AutoDeleteDuration,
  ButtonShape,
  ButtonSizeOption,
  SectionOrderOption,
  StudioThemePrefs,
  TouchAnimationStyle,
  VerticalPlacementOption,
} from '../types';
import { getHapticIntensityLabel, triggerHaptic } from '../utils/haptics';
import {
  BACKGROUND_COLOR_SWATCHES,
  BUTTON_COLOR_SWATCHES,
  DEFAULT_THEME_PREFS,
  hexToRgba,
  resolveAmbientPalette,
} from '../utils/themeColors';
import { ThinkOfMeButton } from './ThinkOfMeButton';

interface CustomizeSheetProps {
  open: boolean;
  onClose: () => void;
  prefs: StudioThemePrefs;
  onChange: (next: StudioThemePrefs) => void;
}

type StudioTab = 'style' | 'layout' | 'night';

const SHAPES: { id: ButtonShape; label: string }[] = [
  { id: 'orb', label: 'Orb' },
  { id: 'squircle', label: 'Squircle' },
  { id: 'bloom', label: 'Bloom' },
];

const ANIMATIONS: { id: TouchAnimationStyle; label: string }[] = [
  { id: 'ripples', label: 'Ripples' },
  { id: 'heartbeat', label: 'Heartbeat' },
  { id: 'spark', label: 'Spark burst' },
  { id: 'squish', label: 'Velvet squish' },
];

const BUTTON_SIZES: { id: ButtonSizeOption; label: string }[] = [
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Medium' },
  { id: 'lg', label: 'Large' },
];

const ACTIVITY_SCALES: { id: ActivityScaleOption; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'standard', label: 'Standard' },
  { id: 'expanded', label: 'Expanded' },
];

const SECTION_ORDERS: { id: SectionOrderOption; label: string }[] = [
  { id: 'button_first', label: 'Button first' },
  { id: 'activity_first', label: 'Activity first' },
];

const PLACEMENTS: { id: VerticalPlacementOption; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'center', label: 'Center' },
  { id: 'bottom', label: 'Bottom' },
];

const NIGHT_MODES: { id: AmbientNightMode; label: string }[] = [
  { id: 'auto', label: 'Auto (8pm–6am)' },
  { id: 'always', label: 'Always on' },
  { id: 'off', label: 'Off' },
];

const TIMERS: AutoDeleteDuration[] = [5, 10, 15];

interface VisibilityItem {
  key: 'showHeader' | 'showHeading' | 'showRecentPings' | 'showNotificationsTab' | 'showFloatingAlerts';
  label: string;
  hint: string;
}

const VISIBILITY_ITEMS: VisibilityItem[] = [
  { key: 'showHeader', label: 'Top bar', hint: 'Brand and utility icons' },
  { key: 'showHeading', label: 'Prompt title', hint: 'Partner name above button' },
  { key: 'showNotificationsTab', label: 'Notifications tab', hint: 'Dedicated alerts drawer tab' },
  { key: 'showFloatingAlerts', label: 'Pop-up banners', hint: 'Floating incoming alert card' },
  {
    key: 'showRecentPings',
    label: 'Pin notifications on main screen',
    hint: 'Off by default — kept in Notifications tab',
  },
];

// Underdamped spring gives every setting transition a smooth overshoot + final wiggle settle
const PILL_SPRING = { type: 'spring' as const, stiffness: 460, damping: 16, mass: 0.72 };
const SHEET_SPRING = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.85 };
const WIGGLE_EASE = [0.22, 1, 0.36, 1] as const;

export const CustomizeSheet: React.FC<CustomizeSheetProps> = ({
  open,
  onClose,
  prefs,
  onChange,
}) => {
  const [sheetOpacity, setSheetOpacity] = useState(0.9);
  const [previewBurstKey, setPreviewBurstKey] = useState(0);
  const [activeTab, setActiveTab] = useState<StudioTab>('style');
  const prefersReducedMotion = useReducedMotion();

  const ambient = resolveAmbientPalette(prefs);

  const update = <K extends keyof StudioThemePrefs>(key: K, value: StudioThemePrefs[K]) => {
    onChange({ ...prefs, [key]: value });
  };

  const pillTransition = prefersReducedMotion ? { duration: 0.1 } : PILL_SPRING;

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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:p-4 pointer-events-auto">
          {/* Transparent animated backdrop to preview live studio behind */}
          <motion.div
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0"
            style={{ backgroundColor: `rgba(0, 0, 0, ${Math.max(0.12, sheetOpacity * 0.45)})` }}
          />

          <LayoutGroup id="customize-sheet">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="customize-sheet-title"
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 44, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.97 }}
              transition={prefersReducedMotion ? { duration: 0.14 } : SHEET_SPRING}
              className="relative z-10 w-full sm:max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain pb-sheet-safe rounded-t-3xl sm:rounded-2xl border border-white/15 p-5 sm:p-6 space-y-5 shadow-2xl transition-colors"
              style={{
                backgroundColor: hexToRgba(ambient.effectiveBg, sheetOpacity),
              }}
            >
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto sm:hidden" />

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 id="customize-sheet-title" className="font-display text-xl font-medium text-zinc-100">
                    Studio Customizer
                  </h2>
                  <p className="text-xs text-zinc-300/80">
                    Colors, layout sections, sizing, and Ambient Night mode.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close customizer"
                  className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Live Transparent Preview Stage */}
              <div
                className="rounded-2xl border border-white/15 p-4 space-y-3 overflow-hidden relative"
                style={{
                  backgroundColor: hexToRgba(ambient.effectiveBg, Math.min(0.92, sheetOpacity + 0.1)),
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <Eye className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Live preview</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewBurstKey((k) => k + 1)}
                    className="min-h-[34px] px-2.5 rounded-lg bg-white/10 hover:bg-white/15 active:scale-[0.96] text-xs font-medium text-zinc-100 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" style={{ color: ambient.effectiveButton }} />
                    <span>Test touch</span>
                  </button>
                </div>

                <div className="py-6 flex items-center justify-center">
                  <ThinkOfMeButton
                    label={prefs.buttonLabel}
                    subLabel={prefs.buttonSubLabel}
                    shape={prefs.buttonShape}
                    animationStyle={prefs.touchAnimation}
                    color={ambient.effectiveButton}
                    size="sm"
                    externalBurstKey={previewBurstKey}
                    onPress={() => undefined}
                  />
                </div>

                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="preview-transparency-slider" className="text-zinc-300">
                      Preview panel transparency
                    </label>
                    <span className="font-mono text-zinc-300 tabular-nums">
                      {Math.round((1 - sheetOpacity) * 100)}% see-through
                    </span>
                  </div>
                  <input
                    id="preview-transparency-slider"
                    type="range"
                    min={0.22}
                    max={0.95}
                    step={0.01}
                    value={sheetOpacity}
                    onChange={(e) => setSheetOpacity(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>
              </div>

              {/* Animated Sub-Tabs */}
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-black/35 border border-white/10">
                {(
                  [
                    { id: 'style', label: 'Style' },
                    { id: 'layout', label: 'Layout' },
                    { id: 'night', label: 'Night & Alerts' },
                  ] as { id: StudioTab; label: string }[]
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
                          layoutId="customize-active-tab-pill"
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
                {activeTab === 'style' && (
                  <motion.div
                    key="tab-style"
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-4"
                  >
                    {/* Button Label & Sub-caption */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label htmlFor="btn-label-input" className="block text-xs font-medium text-zinc-300">
                          Button label
                        </label>
                        <input
                          id="btn-label-input"
                          type="text"
                          maxLength={24}
                          value={prefs.buttonLabel}
                          onChange={(e) => update('buttonLabel', e.target.value)}
                          placeholder="Think of me"
                          className="w-full min-h-[42px] rounded-xl bg-black/35 border border-white/15 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label
                          htmlFor="btn-sublabel-input"
                          className="block text-xs font-medium text-zinc-300"
                        >
                          Sub-caption
                        </label>
                        <input
                          id="btn-sublabel-input"
                          type="text"
                          maxLength={24}
                          value={prefs.buttonSubLabel}
                          onChange={(e) => update('buttonSubLabel', e.target.value)}
                          placeholder="Tap to notify"
                          className="w-full min-h-[42px] rounded-xl bg-black/35 border border-white/15 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                        />
                      </div>
                    </div>

                    {/* Shape Selector */}
                    <div className="space-y-2">
                      <span className="block text-xs font-medium text-zinc-300">Button shape</span>
                      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/35 border border-white/10">
                        {SHAPES.map((s) => {
                          const active = prefs.buttonShape === s.id;
                          return (
                            <motion.button
                              key={s.id}
                              type="button"
                              whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                              onClick={() => update('buttonShape', s.id)}
                              className={`relative min-h-[40px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                active ? 'text-[#0B0B0F]' : 'text-zinc-300 hover:text-white'
                              }`}
                            >
                              {active && (
                                <motion.span
                                  layoutId="setting-pill-shape"
                                  transition={pillTransition}
                                  className="absolute inset-0 rounded-lg bg-white shadow-sm"
                                />
                              )}
                              {renderAnimatedLabel(s.label, active)}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Touch Animation Selector (Bouncy Sliding Pill + Final Wiggle) */}
                    <div className="space-y-2">
                      <span className="block text-xs font-medium text-zinc-300">Touch animation</span>
                      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/35 border border-white/10">
                        {ANIMATIONS.map((anim) => {
                          const active = prefs.touchAnimation === anim.id;
                          return (
                            <motion.button
                              key={anim.id}
                              type="button"
                              whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                              onClick={() => {
                                update('touchAnimation', anim.id);
                                setTimeout(() => setPreviewBurstKey((k) => k + 1), 35);
                              }}
                              className={`relative min-h-[40px] px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                active ? 'text-[#0B0B0F]' : 'text-zinc-300 hover:text-white'
                              }`}
                            >
                              {active && (
                                <motion.span
                                  layoutId="setting-pill-touch-animation"
                                  transition={pillTransition}
                                  className="absolute inset-0 rounded-lg bg-white shadow-sm"
                                />
                              )}
                              {renderAnimatedLabel(anim.label, active)}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Button Color Swatches + Custom Color */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-300">Button color</span>
                        <span className="font-mono text-xs text-zinc-400 uppercase">{prefs.buttonColor}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {BUTTON_COLOR_SWATCHES.map((swatch) => {
                          const active = prefs.buttonColor.toLowerCase() === swatch.hex.toLowerCase();
                          return (
                            <motion.button
                              key={swatch.hex}
                              type="button"
                              title={swatch.name}
                              aria-label={`Button color ${swatch.name}`}
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
                              onClick={() => update('buttonColor', swatch.hex)}
                              className="relative w-10 h-10 rounded-full flex items-center justify-center cursor-pointer border border-white/20"
                              style={{ backgroundColor: swatch.hex }}
                            >
                              {active && (
                                <motion.span
                                  layoutId="setting-ring-button-color"
                                  transition={pillTransition}
                                  className="absolute -inset-1 rounded-full border-2 border-white pointer-events-none"
                                />
                              )}
                              {active && <Check className="relative z-10 w-4 h-4 text-[#0B0B0F] drop-shadow" />}
                            </motion.button>
                          );
                        })}
                        <label
                          title="Custom button color"
                          className="w-10 h-10 rounded-full border border-dashed border-white/35 flex items-center justify-center text-[11px] font-medium text-zinc-200 cursor-pointer overflow-hidden relative hover:border-white/70"
                        >
                          <span>+</span>
                          <input
                            type="color"
                            aria-label="Custom button color"
                            value={prefs.buttonColor}
                            onChange={(e) => update('buttonColor', e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Background Color Swatches + Custom Color */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-300">Background color</span>
                        <span className="font-mono text-xs text-zinc-400 uppercase">
                          {prefs.backgroundColor}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {BACKGROUND_COLOR_SWATCHES.map((swatch) => {
                          const active = prefs.backgroundColor.toLowerCase() === swatch.hex.toLowerCase();
                          return (
                            <motion.button
                              key={swatch.hex}
                              type="button"
                              title={swatch.name}
                              aria-label={`Background color ${swatch.name}`}
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
                              onClick={() => update('backgroundColor', swatch.hex)}
                              className="relative w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer border border-white/20"
                              style={{ backgroundColor: swatch.hex }}
                            >
                              {active && (
                                <motion.span
                                  layoutId="setting-ring-bg-color"
                                  transition={pillTransition}
                                  className="absolute -inset-1 rounded-[14px] border-2 border-white pointer-events-none"
                                />
                              )}
                              {active && <Check className="relative z-10 w-4 h-4 text-white" />}
                            </motion.button>
                          );
                        })}
                        <label
                          title="Custom background color"
                          className="w-10 h-10 rounded-xl border border-dashed border-white/35 flex items-center justify-center text-[11px] font-medium text-zinc-200 cursor-pointer overflow-hidden relative hover:border-white/70"
                        >
                          <span>+</span>
                          <input
                            type="color"
                            aria-label="Custom background color"
                            value={prefs.backgroundColor}
                            onChange={(e) => update('backgroundColor', e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'layout' && (
                  <motion.div
                    key="tab-layout"
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-5"
                  >
                    {/* What you see */}
                    <div className="space-y-2">
                      <span className="block text-xs font-medium text-zinc-300">What you see</span>
                      <div className="divide-y divide-white/10 rounded-xl bg-black/30 border border-white/10">
                        {VISIBILITY_ITEMS.map((item) => {
                          const enabled = prefs[item.key];
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => update(item.key, !enabled)}
                              className="w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.04] transition-colors cursor-pointer first:rounded-t-xl last:rounded-b-xl"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-zinc-100">{item.label}</p>
                                <p className="text-[11px] text-zinc-400 truncate">{item.hint}</p>
                              </div>
                              <span
                                aria-hidden="true"
                                className={`w-10 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
                                  enabled ? 'justify-end' : 'justify-start bg-white/15'
                                }`}
                                style={enabled ? { backgroundColor: ambient.effectiveButton } : undefined}
                              >
                                <motion.span
                                  layout
                                  animate={
                                    prefersReducedMotion
                                      ? undefined
                                      : {
                                          rotate: enabled ? [0, -10, 8, -3, 0] : [0, 10, -8, 3, 0],
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
                          );
                        })}
                      </div>
                    </div>

                    {/* Where sections sit */}
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <span className="block text-xs font-medium text-zinc-300">Section order</span>
                        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/35 border border-white/10">
                          {SECTION_ORDERS.map((order) => {
                            const active = prefs.sectionOrder === order.id;
                            return (
                              <motion.button
                                key={order.id}
                                type="button"
                                whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                                onClick={() => update('sectionOrder', order.id)}
                                className={`relative min-h-[40px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                  active ? 'text-[#0B0B0F]' : 'text-zinc-300 hover:text-white'
                                }`}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="setting-pill-section-order"
                                    transition={pillTransition}
                                    className="absolute inset-0 rounded-lg bg-white shadow-sm"
                                  />
                                )}
                                {renderAnimatedLabel(order.label, active)}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="block text-xs font-medium text-zinc-300">
                          Button vertical placement
                        </span>
                        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/35 border border-white/10">
                          {PLACEMENTS.map((pos) => {
                            const active = prefs.buttonPlacement === pos.id;
                            return (
                              <motion.button
                                key={pos.id}
                                type="button"
                                whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                                onClick={() => update('buttonPlacement', pos.id)}
                                className={`relative min-h-[40px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                  active ? 'text-[#0B0B0F]' : 'text-zinc-300 hover:text-white'
                                }`}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="setting-pill-placement"
                                    transition={pillTransition}
                                    className="absolute inset-0 rounded-lg bg-white shadow-sm"
                                  />
                                )}
                                {renderAnimatedLabel(pos.label, active)}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* How big sections are */}
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <span className="block text-xs font-medium text-zinc-300">Button size</span>
                        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/35 border border-white/10">
                          {BUTTON_SIZES.map((sz) => {
                            const active = prefs.buttonSize === sz.id;
                            return (
                              <motion.button
                                key={sz.id}
                                type="button"
                                whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                                onClick={() => update('buttonSize', sz.id)}
                                className={`relative min-h-[40px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                  active ? 'text-[#0B0B0F]' : 'text-zinc-300 hover:text-white'
                                }`}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="setting-pill-button-size"
                                    transition={pillTransition}
                                    className="absolute inset-0 rounded-lg bg-white shadow-sm"
                                  />
                                )}
                                {renderAnimatedLabel(sz.label, active)}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="block text-xs font-medium text-zinc-300">
                          Recent pings panel size
                        </span>
                        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/35 border border-white/10">
                          {ACTIVITY_SCALES.map((sc) => {
                            const active = prefs.activityScale === sc.id;
                            return (
                              <motion.button
                                key={sc.id}
                                type="button"
                                whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                                onClick={() => update('activityScale', sc.id)}
                                className={`relative min-h-[40px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                  active ? 'text-[#0B0B0F]' : 'text-zinc-300 hover:text-white'
                                }`}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="setting-pill-activity-scale"
                                    transition={pillTransition}
                                    className="absolute inset-0 rounded-lg bg-white shadow-sm"
                                  />
                                )}
                                {renderAnimatedLabel(sc.label, active)}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'night' && (
                  <motion.div
                    key="tab-night"
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-5"
                  >
                    {/* Ambient Night Mode */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                          <Moon className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Ambient Night mode</span>
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          {ambient.isNightActive ? 'Active now' : 'Standard brightness'}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Automatically dims UI brightness and deepens colors during local nighttime hours (8:00 PM – 6:00 AM).
                      </p>
                      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/35 border border-white/10">
                        {NIGHT_MODES.map((mode) => {
                          const active = prefs.ambientNightMode === mode.id;
                          return (
                            <motion.button
                              key={mode.id}
                              type="button"
                              whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                              onClick={() => update('ambientNightMode', mode.id)}
                              className={`relative min-h-[40px] px-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                                active ? 'text-[#0B0B0F]' : 'text-zinc-300 hover:text-white'
                              }`}
                            >
                              {active && (
                                <motion.span
                                  layoutId="setting-pill-night-mode"
                                  transition={pillTransition}
                                  className="absolute inset-0 rounded-lg bg-white shadow-sm"
                                />
                              )}
                              {renderAnimatedLabel(mode.label, active)}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Ephemeral History Auto-Delete Timer */}
                    <div className="space-y-2">
                      <span className="block text-xs font-medium text-zinc-300">
                        History auto-delete timer
                      </span>
                      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/35 border border-white/10">
                        {TIMERS.map((sec) => {
                          const active = prefs.autoDeleteSeconds === sec;
                          return (
                            <motion.button
                              key={sec}
                              type="button"
                              whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                              onClick={() => update('autoDeleteSeconds', sec)}
                              className={`relative min-h-[40px] rounded-lg font-mono text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                                active ? 'text-[#0B0B0F]' : 'text-zinc-300 hover:text-white'
                              }`}
                            >
                              {active && (
                                <motion.span
                                  layoutId="setting-pill-timer"
                                  transition={pillTransition}
                                  className="absolute inset-0 rounded-lg bg-white shadow-sm"
                                />
                              )}
                              {renderAnimatedLabel(`${sec}s`, active)}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Incoming Alert Haptic Feedback Intensity / Duration */}
                    <div className="rounded-xl bg-black/30 border border-white/10 p-3.5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="incoming-haptic-slider"
                          className="flex items-center gap-1.5 text-xs font-medium text-zinc-200"
                        >
                          <Vibrate className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Incoming alert vibration</span>
                        </label>
                        <span className="font-mono text-[11px] text-zinc-300 tabular-nums">
                          {prefs.incomingHapticIntensity === 0
                            ? 'Off'
                            : `${prefs.incomingHapticIntensity}% · ${getHapticIntensityLabel(
                                prefs.incomingHapticIntensity
                              )}`}
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Adjust vibration pulse duration and strength when your partner sends a normal or priority alert.
                      </p>

                      <div className="space-y-1.5">
                        <input
                          id="incoming-haptic-slider"
                          type="range"
                          min={0}
                          max={200}
                          step={10}
                          value={prefs.incomingHapticIntensity}
                          onChange={(e) =>
                            update('incomingHapticIntensity', Number(e.target.value))
                          }
                          className="w-full accent-amber-400 cursor-pointer"
                        />
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                          <span>Off</span>
                          <span>100%</span>
                          <span>200%</span>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            triggerHaptic('receive', prefs.incomingHapticIntensity)
                          }
                          disabled={prefs.incomingHapticIntensity === 0}
                          className="min-h-[34px] px-3 rounded-lg bg-white/10 hover:bg-white/15 active:scale-[0.97] text-xs font-medium text-zinc-100 flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <Vibrate className="w-3.5 h-3.5" style={{ color: ambient.effectiveButton }} />
                          <span>Test vibration</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Footer Actions */}
              <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => onChange(DEFAULT_THEME_PREFS)}
                  className="min-h-[44px] px-4 rounded-xl bg-white/10 text-zinc-200 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-white/15 active:scale-[0.97] transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-white text-[#0B0B0F] text-sm font-semibold hover:bg-zinc-200 active:scale-[0.98] transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </LayoutGroup>
        </div>
      )}
    </AnimatePresence>
  );
};
