import { usePrimaryColor } from '@/lib/use-primary-color';
import * as React from 'react';
import { ActivityIndicator, View, type ViewProps } from 'react-native';

interface SpinnerProps extends ViewProps {
  size?: 'small' | 'large';
  /** Overrides the themed primary color — e.g. for a spinner on a colored button. */
  color?: string;
}

/** Themed loading spinner used across the app instead of a bare
 *  `ActivityIndicator` — tints to the account's primary color (rather than
 *  the platform default blue) and renders a bit larger than the native size,
 *  which `ActivityIndicator`'s `size` prop can't do on its own since iOS only
 *  supports the two fixed sizes. */
export function Spinner({ size = 'large', color, className, style, ...props }: SpinnerProps) {
  const primaryColor = usePrimaryColor();
  return (
    <View className={className} style={style} {...props}>
      <ActivityIndicator size={size} color={color ?? primaryColor} style={{ transform: [{ scale: 1.3 }] }} />
    </View>
  );
}
