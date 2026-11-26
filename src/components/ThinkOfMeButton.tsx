import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import type { ButtonShape, ButtonSizeOption, TouchAnimationStyle } from '../types';
import { cancelHaptic, triggerHaptic } from '../utils/haptics';
import { getContrastInk, hexToRgba, shiftColor } from '../utils/themeColors';

interface ThinkOfMeButtonProps {
  label: string;
  subLabel: string;
  shape: ButtonShape;
  animationStyle: TouchAnimationStyle;
  color: string;
  sending?: boolean;
  size?: ButtonSizeOption;
  externalBurstKey?: number;
  onPress: () => void | Promise<void>;
  onUrgentPress?: () => void | Promise<void>;
}

interface BurstEffect {
  id: number;
  style: TouchAnimationStyle | 'urgent';
  originX: number;
  originY: number;
}

const HOLD_DURATION_MS = 3000;

// Phones/tablets: no 3D tilt, no hover glow, constant shadow. The 3D layers (perspective,
// preserve-3d, translateZ) flicker in Android WebView and re-tilting on every touch looked jumpy.
const FINE_POINTER =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const TOUCH_PRESS_TRANSITION = { type: 'tween' as const, duration: 0.12, ease: 'easeOut' as const };
const SPARK_ANGLES = Array.from({ length: 12 }, (_, i) => (i * 30 * Math.PI) / 180);

export const ThinkOfMeButton: React.FC<ThinkOfMeButtonProps> = ({
  label,
  subLabel,
  shape,
  animationStyle,
  color,
  sending = false,
  size = 'lg',
  externalBurstKey = 0,
  onPress,
  onUrgentPress,
}) => {
  const [bursts, setBursts] = useState<BurstEffect[]>([]);
  const [isPressed, setIsPressed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [clickMotionCount, setClickMotionCount] = useState(0);
  const [touchPulseKey, setTouchPulseKey] = useState(0);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const isPressedRef = useRef(false);
  const urgentTriggeredRef = useRef(false);
  const pointerDownHandledRef = useRef(false);
  const pointerTypeRef = useRef<string>('mouse');
  const holdTimerRef = useRef<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const inkColor = getContrastInk(color);
  const topTint = shiftColor(color, 26);
  const bottomTint = shiftColor(color, -14);

  // Smooth finger / cursor tilt & spotlight tracking (GPU-composited, zero React re-renders)
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const spotX = useMotionValue(50);
  const spotY = useMotionValue(50);

  const springConfig = { stiffness: 260, damping: 22, mass: 0.6 };
  const smoothX = useSpring(pointerX, springConfig);
  const smoothY = useSpring(pointerY, springConfig);
  const smoothSpotX = useSpring(spotX, { stiffness: 320, damping: 28 });
  const smoothSpotY = useSpring(spotY, { stiffness: 320, damping: 28 });

  const rotateY = useTransform(smoothX, [-1, 1], [-8, 8]);
  const rotateX = useTransform(smoothY, [-1, 1], [8, -8]);
  const contentShiftX = useTransform(smoothX, [-1, 1], [-4, 4]);
  const contentShiftY = useTransform(smoothY, [-1, 1], [-4, 4]);
  const spotlightBackground = useMotionTemplate`radial-gradient(circle at ${smoothSpotX}% ${smoothSpotY}%, rgba(255,255,255,0.36) 0%, rgba(255,255,255,0.08) 40%, transparent 72%)`;

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      cancelHaptic();
    };
  }, [clearHoldTimer]);

  const updatePointerTracking = useCallback(
    (clientX: number, clientY: number): { ox: number; oy: number } => {
      if (!buttonRef.current) return { ox: 0, oy: 0 };
      const rect = buttonRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return { ox: 0, oy: 0 };
      const relX = (clientX - rect.left) / rect.width;
      const relY = (clientY - rect.top) / rect.height;
      const clampedX = Math.max(0, Math.min(1, relX));
      const clampedY = Math.max(0, Math.min(1, relY));
      if (!prefersReducedMotion && FINE_POINTER) {
        pointerX.set((clampedX - 0.5) * 2);
        pointerY.set((clampedY - 0.5) * 2);
        spotX.set(clampedX * 100);
        spotY.set(clampedY * 100);
      }
      return {
        ox: (clampedX - 0.5) * rect.width * 0.25,
        oy: (clampedY - 0.5) * rect.height * 0.25,
      };
    },
    [prefersReducedMotion, pointerX, pointerY, spotX, spotY]
  );

  const resetPointerTracking = useCallback(() => {
    setIsHovering(false);
    pointerX.set(0);
    pointerY.set(0);
    spotX.set(50);
    spotY.set(50);
  }, [pointerX, pointerY, spotX, spotY]);

  const triggerTouchAnimation = useCallback(
    (overrideStyle?: TouchAnimationStyle | 'urgent', originX = 0, originY = 0) => {
      const id = Date.now() + Math.random();
      const style = overrideStyle ?? animationStyle;
      setBursts((prev) => [...prev.slice(-3), { id, style, originX, originY }]);
      setTouchPulseKey((k) => k + 1);
      window.setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, 920);
    },
    [animationStyle]
  );

  useEffect(() => {
    if (externalBurstKey > 0) {
      triggerHaptic('tap');
      triggerTouchAnimation();
      setClickMotionCount((c) => c + 1);
    }
  }, [externalBurstKey, triggerTouchAnimation]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    pointerTypeRef.current = e.pointerType;
    pointerDownHandledRef.current = true;
    isPressedRef.current = true;
    urgentTriggeredRef.current = false;
    setIsPressed(true);
    if (e.pointerType === 'mouse') setIsHovering(true);
    const { ox, oy } = updatePointerTracking(e.clientX, e.clientY);

    // Immediate touch feedback: Vibration API + chosen touch animation
    triggerHaptic('press');
    triggerTouchAnimation(animationStyle, ox, oy);

    clearHoldTimer();
    if (onUrgentPress) {
      // Secret 3-second hold without any visible progress/loading indicator
      holdTimerRef.current = window.setTimeout(() => {
        if (!isPressedRef.current || urgentTriggeredRef.current) return;
        urgentTriggeredRef.current = true;
        isPressedRef.current = false;
        setIsPressed(false);
        if (pointerTypeRef.current === 'touch') {
          resetPointerTracking();
        }
        triggerHaptic('urgentSend');
        triggerTouchAnimation('urgent', 0, 0);
        setClickMotionCount((c) => c + 1);
        void onUrgentPress();
      }, HOLD_DURATION_MS);
    }
  };

  const handlePointerUp = () => {
    if (!isPressedRef.current) {
      if (pointerTypeRef.current === 'touch') {
        resetPointerTracking();
      }
      return;
    }
    isPressedRef.current = false;
    setIsPressed(false);
    clearHoldTimer();
    if (pointerTypeRef.current === 'touch') {
      resetPointerTracking();
    }

    if (!urgentTriggeredRef.current) {
      triggerHaptic('tap');
      setClickMotionCount((c) => c + 1);
      void onPress();
    }
  };

  const handlePointerCancelOrLeave = () => {
    const wasPressed = isPressedRef.current;
    isPressedRef.current = false;
    setIsPressed(false);
    clearHoldTimer();
    if (wasPressed) {
      cancelHaptic();
    }
    resetPointerTracking();
  };

  const handleKeyboardClick = () => {
    if (pointerDownHandledRef.current) {
      pointerDownHandledRef.current = false;
      return;
    }
    triggerHaptic('tap');
    triggerTouchAnimation();
    setClickMotionCount((c) => c + 1);
    void onPress();
  };

  const dimensionClass =
    size === 'sm'
      ? 'w-[min(9rem,42vw)] h-[min(9rem,42vw)] sm:w-40 sm:h-40'
      : size === 'md'
      ? 'w-[min(11rem,50vw)] h-[min(11rem,50vw)] sm:w-48 sm:h-48'
      : 'w-[min(14rem,60vw)] h-[min(14rem,60vw)] sm:w-64 sm:h-64';
  const radiusClass = shape === 'squircle' ? 'rounded-[44px]' : 'rounded-full';
  const auraSizeClass =
    size === 'sm'
      ? 'w-[min(12rem,56vw)] h-[min(12rem,56vw)]'
      : size === 'md'
      ? 'w-[min(15rem,70vw)] h-[min(15rem,70vw)]'
      : 'w-[min(20rem,86vw)] h-[min(20rem,86vw)]';

  const baseRadiusPx = size === 'sm' ? 76 : size === 'md' ? 94 : 124;

  const displayLabel = label.trim() || 'Think of me';
  const labelWords = displayLabel.split(/\s+/);

  // Touch: a plain press-scale. Android WebView randomly dropped half of the button when a
  // scaled, rounded, overflow-clipped element had animated children (compositor tiling bug),
  // so on touch the button has no clipping, no inner layers and no keyframed scale.
  const touchPressAnimate = prefersReducedMotion ? undefined : { scale: isPressed ? 0.94 : 1 };

  const getButtonMotionAnimate = () => {
    if (prefersReducedMotion) return undefined;

    if (isPressed) {
      if (animationStyle === 'heartbeat') {
        return {
          scaleX: [0.95, 1.05, 0.91, 1.03, 0.94],
          scaleY: [0.95, 1.05, 0.91, 1.03, 0.94],
        };
      }
      if (animationStyle === 'squish') {
        return {
          scaleX: [1, 1.13, 0.96, 1.07],
          scaleY: [1, 0.85, 1.03, 0.9],
        };
      }
      if (animationStyle === 'spark') {
        return {
          scaleX: 0.93,
          scaleY: 0.93,
        };
      }
      return { scaleX: 0.93, scaleY: 0.93 };
    }

    if (isHovering) {
      return { scaleX: 1.04, scaleY: 1.04 };
    }

    return { scaleX: 1, scaleY: 1 };
  };

  const getButtonTransition = () => {
    if (isPressed && animationStyle === 'heartbeat') {
      return { duration: 0.72, repeat: Infinity, repeatDelay: 0.18, ease: 'easeInOut' as const };
    }
    if (isPressed && animationStyle === 'squish') {
      return { duration: 0.42, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };
    }
    if (animationStyle === 'squish') {
      return { type: 'spring' as const, stiffness: 460, damping: 13, mass: 0.75 };
    }
    return { type: 'spring' as const, stiffness: 420, damping: 22 };
  };

  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={FINE_POINTER ? { perspective: 900 } : undefined}
    >
      {/* Ambient Radial Aura (breathes stronger on finger hover or press) */}
      <motion.div
        aria-hidden="true"
        animate={
          prefersReducedMotion
            ? undefined
            : isPressed
            ? { scale: 1.16, opacity: 0.96 }
            : isHovering
            ? { scale: [1.04, 1.1, 1.04], opacity: [0.75, 0.95, 0.75] }
            : { scale: 1, opacity: 0.65 }
        }
        transition={
          isHovering && !isPressed
            ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }
        }
        className={`absolute ${auraSizeClass} rounded-full pointer-events-none transition-colors duration-300`}
        style={{
          background: `radial-gradient(circle, ${hexToRgba(color, 0.34)} 0%, ${hexToRgba(
            color,
            0.08
          )} 52%, transparent 72%)`,
        }}
      />

      {/* Hover / Press Tactile Orbit Ring */}
      <AnimatePresence>
        {(isHovering || isPressed) && !prefersReducedMotion && (
          <motion.div
            key="orbit-ring"
            aria-hidden="true"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={
              isPressed
                ? { scale: [1.02, 1.14, 1.02], opacity: [0.7, 0.35, 0.7] }
                : { scale: [1.06, 1.12, 1.06], opacity: [0.35, 0.6, 0.35] }
            }
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: isPressed ? 0.85 : 2.1, repeat: Infinity, ease: 'easeInOut' }}
            className={`absolute ${dimensionClass} ${radiusClass} border pointer-events-none`}
            style={{
              borderColor: hexToRgba(color, isPressed ? 0.78 : 0.45),
            }}
          />
        )}
      </AnimatePresence>

      {/* Bloom Outer Halo Ring */}
      {shape === 'bloom' && (
        <motion.div
          aria-hidden="true"
          animate={
            prefersReducedMotion
              ? undefined
              : { scale: [1, 1.06, 1], opacity: [0.4, 0.72, 0.4] }
          }
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          className={`absolute ${dimensionClass} rounded-full pointer-events-none border`}
          style={{
            borderColor: hexToRgba(color, 0.5),
            transform: 'scale(1.1)',
          }}
        />
      )}

      {/* Main Interactive Button with Finger/Hover Tilt & Selected Touch Animation */}
      <motion.button
        ref={buttonRef}
        type="button"
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          setIsHovering(true);
          updatePointerTracking(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse' && !isPressedRef.current) return;
          if (e.pointerType === 'mouse' && !isHovering) setIsHovering(true);
          updatePointerTracking(e.clientX, e.clientY);
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancelOrLeave}
        onPointerLeave={handlePointerCancelOrLeave}
        onClick={handleKeyboardClick}
        animate={FINE_POINTER ? getButtonMotionAnimate() : touchPressAnimate}
        transition={FINE_POINTER ? getButtonTransition() : TOUCH_PRESS_TRANSITION}
        className={`relative z-10 ${FINE_POINTER ? 'overflow-hidden' : ''} ${dimensionClass} ${radiusClass} flex flex-col items-center justify-center gap-1.5 px-5 text-center focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-75 cursor-pointer touch-none`}
        style={{
          ...(FINE_POINTER && !prefersReducedMotion
            ? { rotateX, rotateY, transformStyle: 'preserve-3d' as const }
            : {}),
          background: `linear-gradient(180deg, ${topTint} 0%, ${color} 60%, ${bottomTint} 100%)`,
          color: inkColor,
          boxShadow: !FINE_POINTER
            ? `0 0 48px ${hexToRgba(color, 0.36)}, inset 0 1px 0 rgba(255,255,255,0.28)`
            : isPressed
            ? `0 0 44px ${hexToRgba(color, 0.58)}, inset 0 3px 12px rgba(0,0,0,0.28)`
            : isHovering
            ? `0 0 72px ${hexToRgba(color, 0.44)}, inset 0 1px 0 rgba(255,255,255,0.36)`
            : `0 0 56px ${hexToRgba(color, 0.32)}, inset 0 1px 0 rgba(255,255,255,0.28)`,
        }}
      >
        {/* Inner Touch Wave Pulse While Finger Is On Button */}
        <AnimatePresence>
          {FINE_POINTER && isPressed && !prefersReducedMotion && (
            <motion.span
              key={`inner_${touchPulseKey}`}
              aria-hidden="true"
              initial={{ scale: 0.4, opacity: 0.55 }}
              animate={{ scale: [0.4, 1.32], opacity: [0.5, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, repeat: Infinity, ease: 'easeOut' }}
              className={`absolute inset-2 ${radiusClass} border-2 pointer-events-none`}
              style={{ borderColor: hexToRgba(inkColor, 0.35) }}
            />
          )}
        </AnimatePresence>

        {/* Dynamic Finger/Pointer Spotlight */}
        {FINE_POINTER && !prefersReducedMotion && (
          <motion.span
            aria-hidden="true"
            animate={{ opacity: isHovering || isPressed ? 1 : 0.35 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: spotlightBackground }}
          />
        )}

        {shape === 'bloom' && (
          <span
            aria-hidden="true"
            className="absolute inset-2.5 rounded-full border pointer-events-none"
            style={{ borderColor: hexToRgba(inkColor, 0.22) }}
          />
        )}

        {/* Parallax Kinetic Text Layer */}
        <motion.div
          className="relative z-10 flex flex-col items-center justify-center gap-1.5"
          style={
            FINE_POINTER && !prefersReducedMotion ? { x: contentShiftX, y: contentShiftY } : undefined
          }
        >
          {/* Staggered Word Wave on Click + Gentle Press Dip */}
          <motion.span
            key={clickMotionCount}
            className={`font-display font-semibold tracking-tight leading-tight flex flex-wrap items-center justify-center gap-x-1.5 ${
              size === 'sm'
                ? 'text-lg sm:text-xl'
                : size === 'md'
                ? 'text-xl sm:text-2xl'
                : 'text-2xl sm:text-[26px]'
            }`}
            animate={
              prefersReducedMotion
                ? undefined
                : isPressed
                ? { y: 2, scale: 0.95 }
                : isHovering
                ? { y: -1, scale: 1.02 }
                : { y: 0, scale: 1 }
            }
            transition={{ type: 'spring', stiffness: 450, damping: 24 }}
          >
            {labelWords.map((word, idx) => (
              <motion.span
                key={`${clickMotionCount}_${idx}`}
                initial={
                  clickMotionCount > 0 && !prefersReducedMotion
                    ? { y: 0, scale: 1 }
                    : false
                }
                animate={
                  clickMotionCount > 0 && !prefersReducedMotion
                    ? { y: [0, -8, 2, 0], scale: [1, 1.1, 0.97, 1] }
                    : undefined
                }
                transition={{
                  duration: 0.52,
                  delay: idx * 0.055,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="inline-block"
              >
                {word}
              </motion.span>
            ))}
          </motion.span>

          {subLabel.trim() && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key="sub"
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 5 }}
                animate={prefersReducedMotion ? { opacity: 0.85 } : { opacity: 0.85, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -5 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="text-xs font-medium"
              >
                {subLabel}
              </motion.span>
            </AnimatePresence>
          )}
        </motion.div>
      </motion.button>

      {/* Touch Animation Burst Layer (z-20 + translateZ above 3D-tilted button) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
        style={FINE_POINTER ? { transform: 'translateZ(28px)' } : undefined}
      >
        <AnimatePresence>
          {bursts.map((burst) => (
            <motion.div
              key={burst.id}
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              {burst.style === 'urgent' &&
                [0, 0.14, 0.28].map((delay, idx) => (
                  <motion.span
                    key={`${burst.id}_u_${idx}`}
                    initial={{ scale: 0.96, opacity: 0.9 }}
                    animate={{ scale: 1.95, opacity: 0 }}
                    transition={{
                      duration: 0.82,
                      delay,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className={`absolute ${dimensionClass} ${radiusClass} border-2 pointer-events-none`}
                    style={{
                      borderColor: color,
                      boxShadow: `0 0 26px ${hexToRgba(color, 0.45)}`,
                    }}
                  />
                ))}

              {burst.style === 'ripples' &&
                [0, 0.12, 0.24].map((delay, idx) => (
                  <motion.span
                    key={`${burst.id}_r_${idx}`}
                    initial={{ scale: 0.96, opacity: 0.82 }}
                    animate={{ scale: 1.85, opacity: 0 }}
                    transition={{
                      duration: 0.8,
                      delay,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className={`absolute ${dimensionClass} ${radiusClass} border-2 pointer-events-none`}
                    style={{ borderColor: hexToRgba(color, 0.78) }}
                  />
                ))}

              {burst.style === 'heartbeat' &&
                [0, 0.22, 0.52].map((delay, idx) => (
                  <motion.span
                    key={`${burst.id}_h_${idx}`}
                    initial={{ scale: 0.96, opacity: 0.9 }}
                    animate={{
                      scale: idx === 0 ? 1.5 : idx === 1 ? 1.82 : 2.02,
                      opacity: 0,
                    }}
                    transition={{
                      duration: 0.6,
                      delay,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className={`absolute ${dimensionClass} ${radiusClass} border-[3px] pointer-events-none`}
                    style={{
                      borderColor: color,
                      boxShadow: `0 0 28px ${hexToRgba(color, 0.5)}`,
                    }}
                  />
                ))}

              {burst.style === 'spark' && (
                <>
                  <motion.span
                    initial={{ scale: 0.96, opacity: 0.92 }}
                    animate={{ scale: 1.56, opacity: 0 }}
                    transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
                    className={`absolute ${dimensionClass} ${radiusClass} border-2 pointer-events-none`}
                    style={{ borderColor: color }}
                  />
                  {SPARK_ANGLES.map((angle, idx) => {
                    const startDist = baseRadiusPx * 0.96;
                    const endDist = baseRadiusPx + 64;
                    const sx = burst.originX * 0.2 + Math.cos(angle) * startDist;
                    const sy = burst.originY * 0.2 + Math.sin(angle) * startDist;
                    const tx = burst.originX * 0.2 + Math.cos(angle) * endDist;
                    const ty = burst.originY * 0.2 + Math.sin(angle) * endDist;
                    const deg = (angle * 180) / Math.PI;
                    return (
                      <motion.span
                        key={`${burst.id}_s_${idx}`}
                        initial={{
                          x: sx,
                          y: sy,
                          rotate: deg,
                          scaleX: 0.8,
                          scaleY: 0.8,
                          opacity: 1,
                        }}
                        animate={{
                          x: tx,
                          y: ty,
                          rotate: deg,
                          scaleX: 1.7,
                          scaleY: 0.45,
                          opacity: 0,
                        }}
                        transition={{
                          duration: 0.62,
                          delay: (idx % 2) * 0.03,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="absolute w-3.5 h-1.5 rounded-full pointer-events-none"
                        style={{
                          backgroundColor: idx % 2 === 0 ? topTint : color,
                          boxShadow: `0 0 14px ${hexToRgba(color, 0.95)}`,
                        }}
                      />
                    );
                  })}
                </>
              )}

              {burst.style === 'squish' && (
                <motion.span
                  initial={{ scaleX: 1.12, scaleY: 0.88, opacity: 0.68 }}
                  animate={{ scaleX: 1.72, scaleY: 1.58, opacity: 0 }}
                  transition={{ duration: 0.68, ease: [0.16, 1, 0.3, 1] }}
                  className={`absolute ${dimensionClass} ${radiusClass} border-2 pointer-events-none`}
                  style={{
                    borderColor: hexToRgba(color, 0.45),
                    background: `radial-gradient(circle, ${hexToRgba(color, 0.35)} 0%, transparent 70%)`,
                  }}
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
