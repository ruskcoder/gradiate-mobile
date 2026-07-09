// Mutating `.value` on a Reanimated shared value is the library's documented
// API for updating it from gesture worklets. These worklets run on the UI
// thread, outside React's render/compiler model, so the lint rule below
// (aimed at catching mutation of plain React state/refs) doesn't apply here.
/* eslint-disable react-hooks/immutability */
import { cn } from '@/lib/utils';
import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface SliderProps {
  value: number[];
  onValueChange: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  disabled?: boolean;
}

const THUMB_SIZE = 20;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

function triggerHaptics() {
  Haptics.selectionAsync();
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className,
  disabled = false,
}: SliderProps) {
  const current = value[0] ?? min;
  const [trackWidth, setTrackWidth] = React.useState(0);
  const usableWidth = Math.max(0, trackWidth - THUMB_SIZE);

  const valueToOffset = React.useCallback(
    (v: number) => {
      const ratio = max > min ? (v - min) / (max - min) : 0;
      return clamp(ratio, 0, 1) * usableWidth;
    },
    [min, max, usableWidth]
  );

  const offset = useSharedValue(valueToOffset(current));
  const dragStartOffset = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Keep the thumb in sync with external value changes (and the first real
  // layout measurement) while not fighting an in-progress drag.
  React.useEffect(() => {
    if (isDragging.value) return;
    offset.value = withTiming(valueToOffset(current), { duration: 120 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, usableWidth]);

  const reportValue = React.useCallback(
    (rawOffset: number) => {
      const ratio = usableWidth > 0 ? rawOffset / usableWidth : 0;
      const raw = min + ratio * (max - min);
      const stepped = Math.round(raw / step) * step;
      const next = clamp(stepped, min, max);
      if (next !== current) onValueChange([next]);
    },
    [usableWidth, min, max, step, current, onValueChange]
  );

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        .onStart(() => {
          isDragging.value = true;
          dragStartOffset.value = offset.value;
          runOnJS(triggerHaptics)();
        })
        .onUpdate((e) => {
          offset.value = clamp(dragStartOffset.value + e.translationX, 0, usableWidth);
          runOnJS(reportValue)(offset.value);
        })
        .onEnd(() => {
          isDragging.value = false;
        }),
    [disabled, usableWidth, reportValue, isDragging, dragStartOffset, offset]
  );

  const onLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }, { scale: isDragging.value ? 1.15 : 1 }],
  }));

  const rangeStyle = useAnimatedStyle(() => ({
    width: offset.value + THUMB_SIZE / 2,
  }));

  return (
    <View
      onLayout={onLayout}
      className={cn('h-5 justify-center', disabled && 'opacity-50', className)}>
      <View className="h-1.5 w-full rounded-full bg-secondary" />
      <Animated.View
        style={rangeStyle}
        className="absolute h-1.5 rounded-full bg-primary"
        pointerEvents="none"
      />
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            { width: THUMB_SIZE, height: THUMB_SIZE, marginLeft: -THUMB_SIZE / 2 },
            thumbStyle,
          ]}
          className="absolute left-0 top-1/2 -mt-2.5 rounded-full border-2 border-primary bg-background shadow-sm shadow-black/20"
        />
      </GestureDetector>
    </View>
  );
}
