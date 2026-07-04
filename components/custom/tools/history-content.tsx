import { BarChart } from '@/components/custom/bar-chart';
import { Text } from '@/components/ui/text';
import { categoryColor } from '@/lib/grade-category-color';
import type { CourseHistoryEntry } from '@/lib/use-course-history';
import * as React from 'react';
import { View } from 'react-native';

function formatDate(loadedAt: number) {
  return new Date(loadedAt).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function HistoryContent({ history }: { history: CourseHistoryEntry[] }) {
  const averageData = React.useMemo(
    () =>
      history.map((entry) => ({
        label: formatDate(entry.loadedAt),
        value: parseFloat(String(entry.average)) || 0,
      })),
    [history]
  );

  const categoryNames = React.useMemo(() => {
    const names = new Set<string>();
    history.forEach((entry) => Object.keys(entry.categories ?? {}).forEach((n) => names.add(n)));
    return Array.from(names);
  }, [history]);

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
        <Text className="text-base font-semibold mb-3">Grade History</Text>
        <BarChart data={averageData} color="#3b82f6" />
      </View>

      {categoryNames.map((name) => (
        <View key={name} className="rounded-lg border border-border bg-card p-4">
          <Text className="text-base font-semibold mb-3">{name}</Text>
          <BarChart
            data={history.map((entry) => ({
              label: formatDate(entry.loadedAt),
              value: parseFloat(entry.categories?.[name]?.percent ?? 0) || 0,
            }))}
            color={categoryColor(name)}
          />
        </View>
      ))}
    </View>
  );
}
