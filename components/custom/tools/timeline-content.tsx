import { AssignmentCard } from '@/components/custom/assignment-card';
import { gradeAndColor } from '@/components/custom/grades-item';
import { GradeDiffBadge } from '@/components/custom/grade-diff-badge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { categoryColor } from '@/lib/grade-category-color';
import type { CourseHistoryEntry } from '@/lib/use-course-history';
import { cn } from '@/lib/utils';
import { SquareArrowOutUpRight } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

interface CategoryChange {
  name: string;
  percent: number;
  change?: number;
}

interface TimelineEvent {
  date: Date;
  title: string;
  average: { curr: number; change?: number };
  categories: CategoryChange[];
  newAssignments: any[];
}

function buildEvents(history: CourseHistoryEntry[]): TimelineEvent[] {
  if (history.length === 0) return [];

  const events: TimelineEvent[] = [];
  const first = history[0];
  const firstNames = new Set((first.scores ?? []).map((s: any) => s.name));

  events.push({
    date: new Date(first.loadedAt),
    title: 'Initial Load',
    average: { curr: parseFloat(String(first.average)) || 0 },
    categories: Object.entries(first.categories ?? {}).map(([name, data]: any) => ({
      name,
      percent: parseFloat(data.percent) || 0,
    })),
    newAssignments: first.scores ?? [],
  });

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];

    const prevAvg = parseFloat(String(prev.average)) || 0;
    const currAvg = parseFloat(String(curr.average)) || 0;

    const prevCategories = prev.categories ?? {};
    const currCategories = curr.categories ?? {};
    const categoryChanges: CategoryChange[] = [];
    Object.entries(currCategories).forEach(([name, data]: any) => {
      const currPercent = parseFloat(data.percent) || 0;
      const prevPercent = prevCategories[name] ? parseFloat(prevCategories[name].percent) || 0 : undefined;
      if (prevPercent === undefined || prevPercent !== currPercent) {
        categoryChanges.push({
          name,
          percent: currPercent,
          change: prevPercent !== undefined ? currPercent - prevPercent : undefined,
        });
      }
    });

    const prevNames = new Set((prev.scores ?? []).map((s: any) => s.name));
    const newAssignments = (curr.scores ?? []).filter((s: any) => !prevNames.has(s.name));

    const hasChanges = prevAvg !== currAvg || categoryChanges.length > 0 || newAssignments.length > 0;
    if (!hasChanges) continue;

    events.push({
      date: new Date(curr.loadedAt),
      title: 'Grade Updated',
      average: { curr: currAvg, change: currAvg - prevAvg },
      categories: categoryChanges,
      newAssignments,
    });
  }

  return events;
}

function TimelineEventRow({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const { grade, gradeColor, textColor } = gradeAndColor(event.average.curr);

  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        <View className="z-10 size-8 items-center justify-center rounded-full border-4 border-background bg-primary">
          <Icon as={SquareArrowOutUpRight} className="size-3.5" color="white" />
        </View>
        {!isLast && <View className="mt-1 w-0.5 flex-1 bg-border" />}
      </View>

      <View className="flex-1 pb-6">
        <Text className="text-xs font-medium text-muted-foreground">
          {event.date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })}
        </Text>
        <Text className="mb-2 text-base font-semibold">{event.title}</Text>

        <View className="flex-row items-center gap-2 mb-2">
          <View className={cn('min-w-[76px] items-center rounded-sm px-2 py-1', gradeColor)}>
            <Text className={cn('text-center text-xl font-semibold tracking-wide', textColor)}>{grade}</Text>
          </View>
          {event.average.change !== undefined && <GradeDiffBadge difference={event.average.change} />}
        </View>

        {event.categories.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mb-2">
            {event.categories.map((cat) => (
              <View
                key={cat.name}
                className="flex-row items-center gap-2 rounded-lg border border-border bg-card p-2">
                <View className="h-9 w-4 rounded-sm" style={{ backgroundColor: categoryColor(cat.name) }} />
                <View>
                  <Text className="text-xs font-medium">{cat.name}</Text>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-base font-semibold">{cat.percent.toFixed(1)}</Text>
                    {cat.change !== undefined && <GradeDiffBadge difference={cat.change} />}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {event.newAssignments.length > 0 && (
          <View>
            <Text className="mb-2 text-xs text-muted-foreground">Updated Assignments:</Text>
            <View className="gap-2">
              {event.newAssignments.map((score: any, idx: number) => (
                <AssignmentCard key={idx} score={score} />
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

export function TimelineContent({ history }: { history: CourseHistoryEntry[] }) {
  const events = React.useMemo(() => buildEvents(history), [history]);

  if (events.length === 0) {
    return (
      <Text className="text-muted-foreground text-center py-6">
        No timeline events available for this course
      </Text>
    );
  }

  const reversed = [...events].reverse();

  return (
    <View className="py-6">
      <Text className="text-lg font-semibold mb-4">Grade Timeline</Text>
      {reversed.map((event, idx) => (
        <TimelineEventRow key={idx} event={event} isLast={idx === reversed.length - 1} />
      ))}
    </View>
  );
}
