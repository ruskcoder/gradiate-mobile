import { SWITCH_TIMING } from '@/lib/ui-animations';
import { cn } from '@/lib/utils';
import * as SwitchPrimitives from '@rn-primitives/switch';
import * as React from 'react';
import { Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// Track geometry: w-8 (32) − 2×1px border = 30 inner; thumb is size-4 (16),
// so the thumb travels 30 − 16 = 14px, matching web's `translate-x-3.5`.
const THUMB_TRAVEL = 14;

// Web keeps the original registry component: CSS `transition-*` handles the
// animation in the browser, exactly like the docs site.
function WebSwitch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitives.Root>) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        'flex h-[1.15rem] w-8 shrink-0 flex-row items-center rounded-full border border-transparent shadow-sm shadow-black/5',
        'focus-visible:border-ring focus-visible:ring-ring/50 peer inline-flex outline-none transition-all focus-visible:ring-[3px] disabled:cursor-not-allowed',
        props.checked ? 'bg-primary' : 'bg-input dark:bg-input/80',
        props.disabled && 'opacity-50',
        className
      )}
      {...props}>
      <SwitchPrimitives.Thumb
        className={cn(
          'bg-background pointer-events-none block size-4 rounded-full ring-0 transition-transform',
          props.checked
            ? 'dark:bg-primary-foreground translate-x-3.5'
            : 'dark:bg-foreground translate-x-0'
        )}
      />
    </SwitchPrimitives.Root>
  );
}

// Native reproduces the same motion with Reanimated: the thumb slides and the
// `bg-primary` track cross-fades in over the `bg-input` track (opacity 0 → 1),
// on tailwind's default 150ms `cubic-bezier(0.4, 0, 0.2, 1)` curve.
function NativeSwitch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitives.Root>) {
  const checked = !!props.checked;
  // Seed with the current value so an already-on switch doesn't animate in on
  // mount; the effect then drives every subsequent toggle.
  const progress = useSharedValue(checked ? 1 : 0);

  React.useEffect(() => {
    progress.value = withTiming(checked ? 1 : 0, SWITCH_TIMING);
  }, [checked, progress]);

  const fillStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
  }));

  return (
    <SwitchPrimitives.Root
      className={cn(
        'bg-input dark:bg-input/80 relative flex h-[1.15rem] w-8 shrink-0 flex-row items-center overflow-hidden rounded-full border border-transparent shadow-sm shadow-black/5',
        props.disabled && 'opacity-50',
        className
      )}
      {...props}>
      <Animated.View
        pointerEvents="none"
        style={fillStyle}
        className="bg-primary absolute bottom-0 left-0 right-0 top-0 rounded-full"
      />
      <SwitchPrimitives.Thumb asChild>
        <Animated.View
          style={thumbStyle}
          className={cn(
            'bg-background size-4 rounded-full',
            checked ? 'dark:bg-primary-foreground' : 'dark:bg-foreground'
          )}
        />
      </SwitchPrimitives.Thumb>
    </SwitchPrimitives.Root>
  );
}

function Switch(props: React.ComponentProps<typeof SwitchPrimitives.Root>) {
  // Platform.OS is constant for the session, so the hook order in each branch
  // is stable.
  return Platform.OS === 'web' ? <WebSwitch {...props} /> : <NativeSwitch {...props} />;
}

export { Switch };
