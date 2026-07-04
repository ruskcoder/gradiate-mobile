import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { ListItem, ListItemsList } from '@/components/custom/list-item';
import { ScreenHeader } from '@/components/custom/screen-header';
import { Spinner } from '@/components/custom/spinner';
import { getSchedule } from '@/lib/grades-api';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScheduleCourse {
  Course: string;
  Description: string;
  Periods: string;
  Teacher: string;
  Room: string;
  Days: string;
  Building: string;
  'Marking Periods': string;
  Status: string;
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <View className="flex-row justify-between gap-4 py-1">
      <Text className="text-sm font-medium text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right text-sm" numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

export default function SchedulesScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [schedule, setSchedule] = React.useState<ScheduleCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = React.useState<ScheduleCourse | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getSchedule();
        if (data.success && data.schedule) setSchedule(data.schedule);
      } catch (e: any) {
        setError(e.message ?? 'Failed to fetch schedule');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Schedule" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 24 }}
        className="flex-1">
        {/* Class schedule */}
        <View className="gap-2">
          <Text className="text-lg font-semibold">Class Schedule</Text>
          {loading && <Spinner className="py-4" />}
          {error && <Text className="text-destructive">Error loading schedule: {error}</Text>}
          {!loading && !error && schedule.length === 0 && (
            <Text className="py-2 text-muted-foreground">No schedule available.</Text>
          )}
          <ListItemsList>
            {schedule.map((course, idx) => (
              <ListItem
                key={idx}
                squareColor="var(--primary)"
                squareText={course.Periods}
                title={course.Description}
                desc={course.Course}
                onPress={() => setSelectedCourse(course)}
              />
            ))}
          </ListItemsList>
        </View>
      </ScrollView>

      <AlertDialog open={!!selectedCourse} onOpenChange={(open) => !open && setSelectedCourse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedCourse?.Description}</AlertDialogTitle>
          </AlertDialogHeader>
          {selectedCourse && (
            <View className="gap-0.5">
              <DetailRow label="Course" value={selectedCourse.Course} />
              <DetailRow label="Period" value={selectedCourse.Periods} />
              <DetailRow label="Teacher" value={selectedCourse.Teacher} />
              <DetailRow label="Room" value={selectedCourse.Room} />
              <DetailRow label="Days" value={selectedCourse.Days} />
              <DetailRow label="Building" value={selectedCourse.Building} />
              <DetailRow label="Marking Periods" value={selectedCourse['Marking Periods']} />
              <View className="flex-row items-center justify-between py-1">
                <Text className="text-sm font-medium text-muted-foreground">Status</Text>
                <Badge variant={selectedCourse.Status === 'Active' ? 'default' : 'secondary'}>
                  <Text>{selectedCourse.Status}</Text>
                </Badge>
              </View>
            </View>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
