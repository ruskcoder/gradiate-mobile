import { Calendar, type CalendarEvent } from '@/components/custom/calendar';
import { ListItem, ListItemsList } from '@/components/custom/list-item';
import { ScreenHeader } from '@/components/custom/screen-header';
import { Text } from '@/components/ui/text';
import { getAttendance } from '@/lib/grades-api';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MONTH_KEYS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export default function AttendanceScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [allEvents, setAllEvents] = React.useState<Record<string, CalendarEvent[]>>({});
  const [month, setMonth] = React.useState(new Date().getMonth());
  const [year, setYear] = React.useState(new Date().getFullYear());

  const fetchForMonth = React.useCallback(async (m: number, y: number) => {
    try {
      setLoading(true);
      setError(null);
      const dateString = `${MONTH_KEYS[m]}-${y}`;
      const data = await getAttendance(dateString);
      if (data.success && data.events) {
        setAllEvents((prev) => ({ ...prev, ...data.events }));
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch attendance');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchForMonth(month, year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const monthEvents = React.useMemo(() => {
    const items: { key: string; day: number; event: CalendarEvent }[] = [];
    Object.entries(allEvents).forEach(([dateStr, list]) => {
      const [m, d, y] = dateStr.split('/').map(Number);
      const eventYear = y > 100 ? y : 2000 + y;
      if (m === month + 1 && eventYear === year) {
        list.forEach((evt, idx) => items.push({ key: `${dateStr}-${idx}`, day: d, event: evt }));
      }
    });
    return items.sort((a, b) => a.day - b.day);
  }, [allEvents, month, year]);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Attendance" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }}
        className="flex-1">
        <Calendar
          month={month}
          year={year}
          events={allEvents}
          loading={loading}
          onMonthChange={(m, y) => {
            setMonth(m);
            setYear(y);
          }}
        />

        {error && (
          <Text className="py-4 text-center text-destructive">
            Error loading attendance: {error}
          </Text>
        )}

        {!loading && !error && monthEvents.length === 0 && (
          <Text className="py-4 text-center text-muted-foreground">No events this month.</Text>
        )}

        <ListItemsList>
          {monthEvents.map(({ key, day, event }) => (
            <ListItem
              key={key}
              squareColor={event.color}
              squareText={day}
              title={event.event}
              desc={event.periods.length > 0 ? event.periods.join(', ') : undefined}
            />
          ))}
        </ListItemsList>
      </ScrollView>
    </View>
  );
}
