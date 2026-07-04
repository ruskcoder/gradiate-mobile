import { AssignmentDetailDialog } from '@/components/custom/assignment-detail-dialog';
import { gradeAndColor } from '@/components/custom/grades-item';
import { AlertDialog, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Text } from '@/components/ui/text';
import { useAppSettings } from '@/lib/app-settings';
import { categoryColor } from '@/lib/grade-category-color';
import { formatGrade } from '@/lib/grade-display';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useUniwind } from 'uniwind';

export interface AssignmentScore {
  name: string;
  score: number | null;
  percentage: number | null;
  category: string;
  dateDue: string;
  badges: string[];
  dateAssigned?: string;
  totalPoints?: number;
  weight?: number;
  excluded?: boolean;
}

const BADGE_COLORS: Record<string, string> = {
  missing: 'bg-red-500',
  exempt: 'bg-sky-500',
  dropped: 'bg-gray-400',
};

const BADGE_LABELS: Record<string, string> = {
  missing: 'M',
  exempt: 'X',
  dropped: 'D',
};

export const AssignmentCard = React.memo(function AssignmentCard({
  score,
  impactBadge,
  onRemove,
  onToggleExcluded,
  onEditPercentage,
}: {
  score: AssignmentScore;
  /** When set, renders a green/red/gray delta badge showing how much this
   *  assignment shifts the course average (see Impacts). */
  impactBadge?: number;
  /** When set, the detail popup shows a Delete button (What If editing). */
  onRemove?: () => void;
  /** When set, the detail popup shows a Disable toggle (What If editing). */
  onToggleExcluded?: () => void;
  /** When set, the detail popup lets the percentage be edited in place
   *  (What If editing). */
  onEditPercentage?: (newPercentage: number | '') => void;
}) {
  const { hideColors, numberDisplay } = useAppSettings();
  const { theme } = useUniwind();
  // Mirror GradesItem: a black scrim over the grade color (30% light / 60%
  // dark) so hide-colors mode reads as a rich, muted tone instead of a flat
  // primary block. Only applies when colors are hidden.
  const scrim = theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)';
  const displayGrade =
    score.percentage !== undefined && score.percentage !== null ? score.percentage : score.score;
  const { grade, numericGrade, gradeColor, textColor } = gradeAndColor(displayGrade, score.badges, hideColors);
  const formattedGrade = numericGrade !== null && numericGrade !== undefined && grade !== '···' && grade !== 'X'
    ? formatGrade(numericGrade, numberDisplay)
    : grade;
  const color = categoryColor(score.category);
  const isDisabled = !!score.excluded;
  const isStruck = isDisabled || score.badges.includes('dropped');

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Pressable className="rounded-lg border border-border bg-card p-2 active:bg-accent">
          {/* Mirrors web ClassGradesItem: floating rounded bar (h-[44px] w-5) on the left,
              ItemContent (name + badges/date) in the middle, grade chip on the right. */}
          <View className="w-full flex-row items-center justify-between">
            <View className="mr-1 h-[44px] w-5 rounded-sm" style={{ backgroundColor: color }} />
            <View className="ml-1 mr-3 min-w-0 flex-1 gap-0">
              <Text className="text-base font-semibold" numberOfLines={1}>
                {score.name}
              </Text>
              <View className="flex-row items-center">
                {score.badges.map((badge) => (
                  <View
                    key={badge}
                    className={cn('mr-1 rounded-md px-1', BADGE_COLORS[badge] ?? 'bg-gray-400')}>
                    <Text className="text-xs font-medium text-white">
                      {BADGE_LABELS[badge] ?? badge}
                    </Text>
                  </View>
                ))}
                <Text className="text-sm text-muted-foreground">{score.dateDue}</Text>
              </View>
            </View>
            {impactBadge !== undefined && (
              <View
                className={cn(
                  'mr-2 rounded-sm px-2 py-1',
                  impactBadge > 0 ? 'bg-green-600' : impactBadge < 0 ? 'bg-red-600' : 'bg-gray-600'
                )}>
                <Text className="text-md font-semibold text-white">
                  {impactBadge > 0 ? '+' : ''}
                  {impactBadge.toFixed(2)}
                </Text>
              </View>
            )}
            <View className={cn('relative mr-[4px] min-w-[76px] overflow-hidden rounded-sm px-2 py-[2px]', gradeColor)}>
              {hideColors && (
                <View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFillObject, { backgroundColor: scrim }]}
                />
              )}
              <Text
                className={cn(
                  'text-center text-[1.35rem] font-semibold tracking-wide',
                  isDisabled ? 'text-white/50' : textColor,
                  isStruck && 'line-through'
                )}>
                {formattedGrade}
              </Text>
            </View>
          </View>
        </Pressable>
      </AlertDialogTrigger>
      <AssignmentDetailDialog
        score={score}
        onRemove={onRemove}
        onToggleExcluded={onToggleExcluded}
        onEditPercentage={onEditPercentage}
      />
    </AlertDialog>
  );
});
