import { Easing, ReduceMotion, withTiming } from 'react-native-reanimated';

// Reanimated keyframes that mirror the web (tailwindcss-animate / tailwind
// transition) motion the RNR components only ship for the `web:` platform.
// Keeping the durations/easings identical is what makes native "feel" the same
// as the docs site instead of the bare `FadeIn` fallback.
//
// `ReduceMotion.Never` is intentional: without it the OS-level "Reduce Motion"
// accessibility setting makes Reanimated skip these outright (a common reason
// RNR animations look dead on a physical device).

// tailwindcss-animate's `animate-in` uses the CSS default `ease`
// (cubic-bezier(0.25, 0.1, 0.25, 1)).
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
// Tailwind's default `transition-*` timing function.
const EASE_TRANSITION = Easing.bezier(0.4, 0, 0.2, 1);
const NEVER = ReduceMotion.Never;

export const SWITCH_TIMING = {
  duration: 150,
  easing: EASE_TRANSITION,
  reduceMotion: NEVER,
} as const;

// `fade-in-0 zoom-in-95` over 150ms — select / popover / dropdown enter.
export function popoverEntering() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.95 }] },
    animations: {
      opacity: withTiming(1, { duration: 150, easing: EASE, reduceMotion: NEVER }),
      transform: [{ scale: withTiming(1, { duration: 150, easing: EASE, reduceMotion: NEVER }) }],
    },
  };
}

// `fade-out-0 zoom-out-95` — the matching exit (only plays when the primitive
// keeps the node mounted; several rn-primitives overlays unmount immediately).
export function popoverExiting() {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: 100, easing: EASE, reduceMotion: NEVER }),
      transform: [{ scale: withTiming(0.95, { duration: 100, easing: EASE, reduceMotion: NEVER }) }],
    },
  };
}

// Same shape as popover but 200ms to match the dialog's `duration-200`.
export function dialogEntering() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.95 }] },
    animations: {
      opacity: withTiming(1, { duration: 200, easing: EASE, reduceMotion: NEVER }),
      transform: [{ scale: withTiming(1, { duration: 200, easing: EASE, reduceMotion: NEVER }) }],
    },
  };
}

export function dialogExiting() {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: 150, easing: EASE, reduceMotion: NEVER }),
      transform: [{ scale: withTiming(0.95, { duration: 150, easing: EASE, reduceMotion: NEVER }) }],
    },
  };
}

// Plain `fade-in-0` / `fade-out-0` for dimmed backdrops.
export function overlayEntering() {
  'worklet';
  return {
    initialValues: { opacity: 0 },
    animations: { opacity: withTiming(1, { duration: 150, easing: EASE, reduceMotion: NEVER }) },
  };
}

export function overlayExiting() {
  'worklet';
  return {
    initialValues: { opacity: 1 },
    animations: { opacity: withTiming(0, { duration: 150, easing: EASE, reduceMotion: NEVER }) },
  };
}
