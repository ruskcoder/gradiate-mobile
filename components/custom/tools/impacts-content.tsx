import { AssignmentCard } from '@/components/custom/assignment-card';
import { BarChart } from '@/components/custom/bar-chart';
import { CategoryCard } from '@/components/custom/category-card';
import { GradeRing } from '@/components/custom/grade-ring';
import { Text } from '@/components/ui/text';
import type { ClassData } from '@/lib/use-class-data';
import type { CourseHistoryEntry } from '@/lib/use-course-history';
import * as React from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

/**
 * Recomputes the category average with a single assignment removed, so
 * "impact" is the delta that assignment contributes to the current average.
 * Dropped/excluded assignments never affected the average, so their impact
 * is always 0.
 */
function recalculateGrades(categories: any, scores: any) {
  const updatedCategories = { ...categories };

  Object.keys(updatedCategories).forEach((categoryName) => {
    const categoryScores = scores.filter((s: any) => {
      if (s.category !== categoryName) return false;
      const scoreVal = parseFloat(s.score);
      const isExemptOrDropped = s.badges && (s.badges.includes('dropped') || s.badges.includes('exempt'));
      return !isNaN(scoreVal) && s.score !== '···' && s.score !== '' && !s.excluded && !isExemptOrDropped;
    });

    let totalWeightedStudentPoints = 0;
    let totalWeightedMaxPoints = 0;

    if (categoryScores.length > 0) {
      categoryScores.forEach((s: any) => {
        const weight = parseFloat(s.weight) || 1;
        const studentPoints = parseFloat(s.score) || 0;
        const maxPoints = parseFloat(s.totalPoints) || 0;

        totalWeightedStudentPoints += studentPoints * weight;
        totalWeightedMaxPoints += maxPoints * weight;
      });
    }

    const percentValue =
      totalWeightedMaxPoints > 0 ? (totalWeightedStudentPoints / totalWeightedMaxPoints) * 100 : 0;

    updatedCategories[categoryName] = {
      ...updatedCategories[categoryName],
      percent: percentValue.toFixed(3),
      studentsPoints: totalWeightedStudentPoints.toFixed(4),
      maximumPoints: totalWeightedMaxPoints.toFixed(2),
    };
  });

  let weightedSum = 0;
  let totalWeight = 0;

  Object.values(updatedCategories).forEach((cat: any) => {
    const hasAssignments = parseFloat(cat.maximumPoints) > 0;
    if (hasAssignments) {
      const weight = parseFloat(cat.categoryWeight) || 1;
      const percent = parseFloat(cat.percent) || 0;
      weightedSum += percent * weight;
      totalWeight += weight;
    }
  });

  const average = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return { categories: updatedCategories, average };
}

function chunkCategories(categories: Record<string, any>) {
  const entries = Object.entries(categories);
  const columns: [string, any][][] = [];
  for (let i = 0; i < entries.length; i += 2) columns.push(entries.slice(i, i + 2));
  return columns;
}

export function ImpactsContent({
  classData,
  history,
}: {
  classData: ClassData;
  history: CourseHistoryEntry[];
}) {
  const { width: windowWidth } = useWindowDimensions();
  const columnWidth = (windowWidth - 32 - 12) / 2;

  const gradeImpacts = React.useMemo(() => {
    const originalAverage = parseFloat(String(classData.average)) || 0;
    const originalCategories = classData.categories || {};
    const originalScores = classData.scores || [];

    return originalScores.map((score: any, idx: number) => {
      const isExemptOrDropped = score.badges && (score.badges.includes('dropped') || score.badges.includes('exempt'));
      const isExcluded = score.excluded;

      if (isExemptOrDropped || isExcluded) {
        return { ...score, impactBadge: 0 };
      }

      const scoresWithoutThis = originalScores.filter((_: any, i: number) => i !== idx);
      const { average: newAverage } = recalculateGrades(originalCategories, scoresWithoutThis);
      const impact = originalAverage - newAverage;

      return { ...score, impactBadge: impact };
    });
  }, [classData]);

  const historyData = React.useMemo(
    () =>
      history.map((entry) => ({
        label: new Date(entry.loadedAt).toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
        value: parseFloat(String(entry.average)) || 0,
      })),
    [history]
  );

  return (
    <View className="py-6 gap-4">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        <View
          style={{ width: columnWidth }}
          className="items-center justify-center rounded-lg border border-border bg-card p-1">
          <GradeRing grade={parseFloat(String(classData.average)) || 0} size={132} />
        </View>
        {chunkCategories(classData.categories ?? {}).map((column, idx) => (
          <View key={idx} style={{ width: columnWidth }} className="justify-center gap-2">
            {column.map(([name, data]) => (
              <CategoryCard key={name} name={name} data={data} />
            ))}
          </View>
        ))}
      </ScrollView>

      {historyData.length > 1 && (
        <View className="rounded-lg border border-border bg-card p-4">
          <Text className="text-base font-semibold mb-3">Grade History</Text>
          <BarChart data={historyData} color="#3b82f6" />
        </View>
      )}

      <View>
        <Text className="text-lg font-semibold mb-3">Assignment Impacts</Text>
        {gradeImpacts.length > 0 ? (
          <View className="gap-2">
            {gradeImpacts.map((score: any, idx: number) => (
              <AssignmentCard key={idx} score={score} impactBadge={score.impactBadge} />
            ))}
          </View>
        ) : (
          <Text className="text-muted-foreground text-center py-6">No assignments to display</Text>
        )}
      </View>
    </View>
  );
}
