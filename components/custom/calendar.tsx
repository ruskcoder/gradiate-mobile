import { Spinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

export interface CalendarEvent {
  event: string;
  color?: string;
  periods: string[];
}

interface CalendarProps {
  month: number;
  year: number;
  events: Record<string, CalendarEvent[]>;
  loading?: boolean;
  onMonthChange: (month: number, year: number) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function getEventsForDate(
  events: Record<string, CalendarEvent[]>,
  day: number,
  month: number,
  year: number
) {
  const fullYear = `${month + 1}/${day}/${year}`;
  const twoDigitYear = `${month + 1}/${day}/${year % 100}`;
  return events[fullYear] || events[twoDigitYear] || [];
}

export function Calendar({ month, year, events, loading, onMonthChange }: CalendarProps) {
  const handlePrev = () => {
    if (month === 0) onMonthChange(11, year - 1);
    else onMonthChange(month - 1, year);
  };
  const handleNext = () => {
    if (month === 11) onMonthChange(0, year + 1);
    else onMonthChange(month + 1, year);
  };

  const cells = React.useMemo(() => {
    const firstDay = firstDayOfMonth(year, month);
    const daysCurrent = daysInMonth(year, month);
    const days: { date: number; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < firstDay; i++) days.push({ date: 0, isCurrentMonth: false });
    for (let i = 1; i <= daysCurrent; i++) days.push({ date: i, isCurrentMonth: true });
    while (days.length % 7 !== 0) days.push({ date: 0, isCurrentMonth: false });
    return days;
  }, [month, year]);

  const today = new Date();

  return (
    <View className="w-full rounded-xl border border-border bg-card">
      <View className="flex-row items-center p-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onPress={handlePrev} disabled={loading}>
          <Icon as={ChevronLeft} className="size-4" />
        </Button>
        <Text className="flex-1 text-center text-lg font-medium">
          {MONTH_NAMES[month]} {year}
        </Text>
        <Button variant="outline" size="icon" className="h-8 w-8" onPress={handleNext} disabled={loading}>
          <Icon as={ChevronRight} className="size-4" />
        </Button>
      </View>

      <View className="flex-row border-b border-border pb-1">
        {WEEKDAYS.map((d, i) => (
          <Text key={i} className="flex-1 text-center text-xs text-muted-foreground">
            {d}
          </Text>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {loading && (
          <View className="absolute inset-0 z-10 items-center justify-center rounded-b-xl bg-background/85">
            <Spinner />
          </View>
        )}
        {cells.map((cell, idx) => {
          const dayEvents = cell.isCurrentMonth
            ? getEventsForDate(events, cell.date, month, year)
            : [];
          const isToday =
            cell.isCurrentMonth &&
            cell.date === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear();
          const isLastRow = idx >= cells.length - 7;
          return (
            <View
              key={idx}
              className={cn('items-center gap-1 py-1.5', !isLastRow && 'border-b border-border')}
              style={{ width: `${100 / 7}%` }}>
              {cell.isCurrentMonth ? (
                <>
                  <Text
                    className={cn(
                      'text-sm font-medium',
                      isToday && 'text-primary underline decoration-2 underline-offset-2'
                    )}>
                    {cell.date}
                  </Text>
                  <View className="h-1.5 flex-row gap-0.5">
                    {dayEvents.slice(0, 3).map((evt, i) => {
                      // A concrete portal color goes inline; otherwise the theme
                      // primary via `bg-primary` (RN can't resolve a `var(--primary)`
                      // string inline, which left Skyward's colorless events as
                      // invisible dots).
                      const hasColor = !!evt.color && !evt.color.startsWith('var(');
                      return (
                        <View
                          key={i}
                          className={cn('h-1.5 w-1.5 rounded-full', !hasColor && 'bg-primary')}
                          style={hasColor ? { backgroundColor: evt.color } : undefined}
                        />
                      );
                    })}
                  </View>
                </>
              ) : (
                <Text className="text-sm text-transparent">.</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
