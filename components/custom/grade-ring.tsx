import { Text } from '@/components/ui/text';
import { useAppSettings } from '@/lib/app-settings';
import { formatGrade } from '@/lib/grade-display';
import { usePrimaryColor } from '@/lib/use-primary-color';
import * as React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export function GradeRing({
  grade,
  size = 100,
  /** Secondary label under the grade — "Overall" normally, or "From" when
   *  showing a what-if projection against the original grade. */
  label = 'Overall',
  /** When set (what-if mode), renders the original grade below the label,
   *  mirroring web's RingGradeStat `whatifGrade`. */
  fromGrade,
}: {
  grade: number;
  size?: number;
  label?: string;
  fromGrade?: number;
}) {
  const { numberDisplay } = useAppSettings();
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(grade, 0), 100) / 100;
  const offset = circumference * (1 - progress);

  const displayGrade = formatGrade(grade, numberDisplay);
  const displayFromGrade = fromGrade !== undefined ? formatGrade(fromGrade, numberDisplay) : undefined;

  const strokeColor = usePrimaryColor();

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          fill="none"
          opacity={0.3}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View className="items-center">
        <Text className="text-xl font-bold">{displayGrade}</Text>
        <Text className="text-xs text-muted-foreground">{label}</Text>
        {displayFromGrade !== undefined && (
          <Text className="text-xs text-muted-foreground">
            {displayFromGrade}
          </Text>
        )}
      </View>
    </View>
  );
}
