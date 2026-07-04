import { AssignmentCard } from '@/components/custom/assignment-card';
import { CategoryCard } from '@/components/custom/category-card';
import { GradeRing } from '@/components/custom/grade-ring';
import { Slider } from '@/components/ui/slider';
import { Text } from '@/components/ui/text';
import type { CourseHistoryEntry } from '@/lib/use-course-history';
import * as React from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

function chunkCategories(categories: Record<string, any>) {
  const entries = Object.entries(categories);
  const columns: [string, any][][] = [];
  for (let i = 0; i < entries.length; i += 2) columns.push(entries.slice(i, i + 2));
  return columns;
}

export function TimeTravelContent({ history }: { history: CourseHistoryEntry[] }) {
  const { width: windowWidth } = useWindowDimensions();
  const columnWidth = (windowWidth - 32 - 12) / 2;

  const [sliderValue, setSliderValue] = React.useState(Math.max(0, history.length - 1));

  React.useEffect(() => {
    setSliderValue(Math.max(0, history.length - 1));
  }, [history]);

  const displayedGrade = history[sliderValue] ?? null;

  const displayedDate = React.useMemo(() => {
    if (!displayedGrade) return null;
    return new Date(displayedGrade.loadedAt).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }, [displayedGrade]);

  if (history.length === 0) {
    return (
      <Text className="text-muted-foreground text-center py-6">
        No history data available for this course
      </Text>
    );
  }

  return (
    <View className="py-6 gap-4">
      <View className="rounded-lg border border-border bg-card p-4">
        <Text className="text-center text-sm font-medium mb-3">
          {history.length > 1 ? displayedDate || 'Drag the slider to view a date' : `Viewing: ${displayedDate}`}
        </Text>
        <Slider
          value={[sliderValue]}
          onValueChange={(v) => setSliderValue(v[0])}
          min={0}
          max={Math.max(0, history.length - 1)}
          step={1}
          disabled={history.length <= 1}
          className="w-full"
        />
        {history.length > 1 && (
          <View className="flex-row justify-between mt-2">
            <Text className="text-xs text-muted-foreground">
              {new Date(history[0].loadedAt).toLocaleDateString()}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {new Date(history[history.length - 1].loadedAt).toLocaleDateString()}
            </Text>
          </View>
        )}
      </View>

      {displayedGrade && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            <View
              style={{ width: columnWidth }}
              className="items-center justify-center rounded-lg border border-border bg-card p-1">
              <GradeRing grade={parseFloat(String(displayedGrade.average)) || 0} size={132} />
            </View>
            {chunkCategories(displayedGrade.categories ?? {}).map((column, idx) => (
              <View key={idx} style={{ width: columnWidth }} className="justify-center gap-2">
                {column.map(([name, data]) => (
                  <CategoryCard key={name} name={name} data={data} />
                ))}
              </View>
            ))}
          </ScrollView>

          {displayedGrade.scores && displayedGrade.scores.length > 0 && (
            <View>
              <Text className="text-lg font-semibold mb-3">Assignments</Text>
              <View className="gap-2">
                {displayedGrade.scores.map((score: any, idx: number) => (
                  <AssignmentCard key={idx} score={score} />
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}
