import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { formatGrade } from '@/lib/grade-display';
import * as React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useUniwind } from 'uniwind';
import type { NumberDisplay } from '@/lib/app-settings';
import { Icon } from '@/components/ui/icon';
import { changeBadge } from '@/lib/insights';
import { useStore } from '@/lib/store';
import { Star } from 'lucide-react-native';

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

/** Inline pill after the course ID showing how far the average moved since the
 *  class was last opened. Fixed 18px height so it never grows the text line. */
function DeltaBadge({ delta }: { delta: number | null | undefined }) {
  if (delta === null || delta === undefined) return null;
  const up = delta > 0;
  return (
    <View className={cn('ml-1.5 h-[18px] justify-center rounded-full px-1.5', up ? 'bg-green-600' : 'bg-red-600')}>
      <Text className="text-[12px] font-semibold leading-none text-white">
        {up ? '+' : ''}
        {delta.toFixed(2)}%
      </Text>
    </View>
  );
}

/** Course ID with the change pill after it, on one fixed-height line. */
function IdLine({ id, delta }: { id: string; delta: number | null | undefined }) {
  return (
    <View className="h-5 min-w-0 flex-row items-center">
      <Text className="shrink text-sm text-muted-foreground" numberOfLines={1}>
        {id}
      </Text>
      <DeltaBadge delta={delta} />
    </View>
  );
}

/** Star centered on the item's top-left corner when new assignments were posted. */
function NewAssignmentsBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <View
      pointerEvents="none"
      className="absolute -left-2.5 -top-2.5 z-10 h-5 w-5 items-center justify-center rounded-full bg-amber-400">
      <Icon as={Star} className="size-3 text-amber-950" fill="#451a03" />
    </View>
  );
}

/** This class's pending change, if any (session-only, set by grade-alerts). */
function useChange(courseName: string, id: string) {
  const change = useStore((s) => s.gradeChanges.find((c) => c.key === `${id}|${courseName}`));
  return changeBadge(change);
}

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
  const change = useChange(courseName, id);
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
      <View className="relative w-full">
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
          <IdLine id={id} delta={change?.delta} />
        </View>
      </Pressable>
      <NewAssignmentsBadge count={change?.newCount} />
      </View>
    );
  }

  return (
    <View className="relative w-full">
    <Pressable
      onPress={onPress}
      className="w-full flex-row items-center justify-between rounded-xl border border-border bg-card p-3 py-2 active:bg-accent">
      <View className="mr-3 min-w-0 flex-1 gap-0.5">
        <Text className="truncate text-base font-semibold" numberOfLines={1}>
          {courseName}
        </Text>
        <IdLine id={id} delta={change?.delta} />
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
    <NewAssignmentsBadge count={change?.newCount} />
    </View>
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
