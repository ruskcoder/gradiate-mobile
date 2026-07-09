import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { formatGrade } from '@/lib/grade-display';
import * as React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useUniwind } from 'uniwind';
import type { NumberDisplay } from '@/lib/app-settings';

interface GradeColorInfo {
  grade: string;
  numericGrade: number | null;
  gradeColor: string;
  textColor: string;
  bgColor: string;
}

export function gradeAndColor(
  gradeInput: number | string | null | undefined,
  badges: string[] | null = null,
  hideColors = false
): GradeColorInfo {
  let grade: string;
  let numericGrade: number | null = null;

  if (gradeInput === null || typeof gradeInput === 'undefined' || gradeInput === '') {
    grade = '···';
  } else {
    numericGrade = parseFloat(String(gradeInput));
    grade = numericGrade.toPrecision(4);
  }

  if (grade === '···') {
    return { grade, numericGrade, gradeColor: 'bg-gray-400', textColor: 'text-white', bgColor: '#9ca3af' };
  }

  if (badges?.includes('exempt')) {
    return { grade: 'X', numericGrade, gradeColor: 'bg-sky-500', textColor: 'text-white', bgColor: '#0ea5e9' };
  }

  if (badges?.includes('dropped') || badges?.includes('excluded')) {
    return { grade, numericGrade, gradeColor: 'bg-gray-400', textColor: 'text-white', bgColor: '#9ca3af' };
  }

  if (badges?.includes('missing')) {
    return { grade, numericGrade, gradeColor: 'bg-red-500', textColor: 'text-white', bgColor: '#ef4444' };
  }

  if (hideColors) {
    return {
      grade,
      numericGrade,
      gradeColor: 'bg-primary',
      textColor: 'text-white',
      bgColor: 'var(--primary)',
    };
  }

  const numericVal = parseFloat(grade);
  if (numericVal >= 90)
    return { grade, numericGrade, gradeColor: 'bg-green-500', textColor: 'text-white', bgColor: '#22c55e' };
  if (numericVal >= 80)
    return { grade, numericGrade, gradeColor: 'bg-blue-500', textColor: 'text-white', bgColor: '#3b82f6' };
  if (numericVal >= 70)
    return { grade, numericGrade, gradeColor: 'bg-yellow-500', textColor: 'text-white', bgColor: '#eab308' };
  return { grade, numericGrade, gradeColor: 'bg-red-500', textColor: 'text-white', bgColor: '#ef4444' };
}

export type GradesVariant = 'list' | 'card';

interface GradesItemProps {
  courseName: string;
  id: string;
  grade: number | string | null | undefined;
  hideColors?: boolean;
  variant?: GradesVariant;
  onPress?: () => void;
  numberDisplay?: NumberDisplay;
}

export function GradesItem({
  courseName,
  id,
  grade,
  hideColors,
  variant = 'list',
  onPress,
  numberDisplay = 'decimal',
}: GradesItemProps) {
  const { theme } = useUniwind();
  const { grade: gradeValue, numericGrade, gradeColor, textColor, bgColor } = gradeAndColor(
    grade,
    null,
    hideColors
  );

  const displayGrade = numericGrade !== null && numericGrade !== undefined && gradeValue !== '···' && gradeValue !== 'X'
    ? formatGrade(numericGrade, numberDisplay)
    : gradeValue;

  // Mirror the web card: a black scrim over the grade color (30% light / 60%
  // dark) so the colored chip reads as a rich, muted tone rather than a flat
  // vivid block. Use an explicit absolute-fill + rgba so it renders reliably.
  const scrim = theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)';

  if (variant === 'card') {
    // The bar fills to the numeric grade (clamped 0–100). "···" grades read as 0.
    const numeric = Math.min(Math.max(numericGrade || 0, 0), 100);
    // gradeAndColor returns a CSS var for the hide-colors case, which RN can't
    // use inline — fall back to the `bg-primary` class for the header instead.
    const useThemeColor = bgColor.startsWith('var');

    return (
      <Pressable
        onPress={onPress}
        className="w-full overflow-hidden rounded-xl border border-border bg-card active:bg-accent">
        <View
          className={cn(
            'relative items-center justify-center gap-2 px-4 py-4',
            useThemeColor && 'bg-primary'
          )}
          style={useThemeColor ? undefined : { backgroundColor: bgColor }}>
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]}
          />
          <Text className={cn('text-[2.5rem] font-semibold leading-10', textColor)}>
            {displayGrade}
          </Text>
          <View className="w-full flex-row items-center gap-2">
            <Text className={cn('text-xs', textColor)}>0%</Text>
            <View className="h-2 flex-1 overflow-hidden rounded-full border border-white/80 bg-white/20">
              <View className="h-full bg-white" style={{ width: `${numeric}%` }} />
            </View>
            <Text className={cn('text-xs', textColor)}>100%</Text>
          </View>
        </View>
        <View className="px-3 py-2">
          <Text className="text-base font-semibold" numberOfLines={1}>
            {courseName}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {id}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      className="w-full flex-row items-center justify-between rounded-xl border border-border bg-card p-3 py-2 active:bg-accent">
      <View className="mr-3 min-w-0 flex-1 gap-0.5">
        <Text className="truncate text-base font-semibold" numberOfLines={1}>
          {courseName}
        </Text>
        <Text className="truncate text-sm text-muted-foreground" numberOfLines={1}>
          {id}
        </Text>
      </View>
      <View
        className={cn('relative min-w-[86px] items-center overflow-hidden rounded-sm px-2 py-1', gradeColor)}>
        {hideColors && (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]}
          />
        )}
        <Text className={cn('text-center text-[1.5rem] font-semibold tracking-wide', textColor)}>
          {displayGrade}
        </Text>
      </View>
    </Pressable>
  );
}

export function GradesList({
  children,
  variant = 'list',
}: {
  children: React.ReactNode;
  variant?: GradesVariant;
}) {
  if (variant === 'card') {
    // Two-column grid: 48%-wide cards with justify-between leaving the gutter.
    return <View className="w-full flex-row flex-wrap justify-between gap-y-3">{children}</View>;
  }
  return <View className="w-full gap-2">{children}</View>;
}
