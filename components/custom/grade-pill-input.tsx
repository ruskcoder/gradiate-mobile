import { cn } from '@/lib/utils';
import * as React from 'react';
import { Animated, TextInput, type TextInputProps } from 'react-native';

// Only what a grade can look like while it's being typed: an optional minus,
// digits, and one decimal point.
const PARTIAL_GRADE = /^-?\d{0,3}(\.\d{0,2})?$/;

const SIZES = {
  md: { width: 92, fontSize: 21, height: 40 },
  lg: { width: 176, fontSize: 38, height: 64 },
} as const;

interface GradePillInputProps extends Omit<TextInputProps, 'onChange' | 'onChangeText' | 'value'> {
  value: string;
  onChange?: (value: string) => void;
  /** Hex color, or a `var(...)` (hide-colors mode) which falls back to `bg-primary`. */
  color: string;
  /** The calculator's answer rather than something the user typed. */
  computed?: boolean;
  loading?: boolean;
  size?: keyof typeof SIZES;
}

/**
 * A grade chip you can type into. It looks like the colored average chips used
 * across the app and recolors live as the value changes. Computed pills get a
 * dashed outline so they read as "worked out for you".
 */
export function GradePillInput({
  value,
  onChange,
  color,
  computed = false,
  loading = false,
  size = 'md',
  className,
  style,
  ...props
}: GradePillInputProps) {
  const pending = loading && !value;
  const [pulse] = React.useState(() => new Animated.Value(1));

  React.useEffect(() => {
    if (!pending) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pending, pulse]);

  const themed = color.startsWith('var');
  const dims = SIZES[size];

  return (
    <Animated.View style={{ opacity: pulse }}>
      <TextInput
        value={value}
        onChangeText={(text) => {
          const next = text.trim();
          if (next === '' || PARTIAL_GRADE.test(next)) onChange?.(next);
        }}
        keyboardType="decimal-pad"
        selectTextOnFocus
        placeholderTextColor="rgba(255,255,255,0.75)"
        textAlign="center"
        className={cn('rounded-md font-semibold text-white', themed && !pending && 'bg-primary', className)}
        style={[
          {
            width: dims.width,
            height: dims.height,
            fontSize: dims.fontSize,
            padding: 0,
            borderWidth: 2,
            borderStyle: computed ? 'dashed' : 'solid',
            borderColor: computed ? 'rgba(255,255,255,0.75)' : 'transparent',
            fontVariant: ['tabular-nums'],
          },
          !themed || pending ? { backgroundColor: pending ? '#9ca3af' : color } : null,
          style,
        ]}
        {...props}
      />
    </Animated.View>
  );
}
