import { GradeDiffBadge } from '@/components/custom/grade-diff-badge';
import { ScreenHeader } from '@/components/custom/screen-header';
import { SimpleTable, type SimpleTableColumn } from '@/components/custom/simple-table';
import { Spinner } from '@/components/custom/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import { getProgressReport } from '@/lib/grades-api';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ProgressReportEntry {
  date: string;
  report: Record<string, any>[];
}

const COLUMN_ORDER = ['course', 'description', 'period', 'teacher', 'room', 'grade', 'com1', 'com2', 'com3', 'com4', 'com5'];

const COLUMN_LABELS: Record<string, string> = {
  course: 'Course', description: 'Description', period: 'Period', teacher: 'Teacher', room: 'Room',
  grade: 'Grade', com1: 'Comment 1', com2: 'Comment 2', com3: 'Comment 3', com4: 'Comment 4', com5: 'Comment 5',
};

const WIDE_COLUMNS = new Set(['course', 'description', 'teacher', 'com1', 'com2', 'com3', 'com4', 'com5']);

export default function ProgressReportScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [progressReports, setProgressReports] = React.useState<ProgressReportEntry[]>([]);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getProgressReport();
        if (data.success && Array.isArray(data.progressReports)) {
          const sorted = [...data.progressReports].sort(
            (a: ProgressReportEntry, b: ProgressReportEntry) =>
              new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          setProgressReports(sorted);
          if (sorted.length > 0) setSelectedDate(sorted[sorted.length - 1].date);
        }
      } catch (e: any) {
        setError(e.message ?? 'Failed to fetch progress report');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentReportIndex = React.useMemo(
    () => progressReports.findIndex((pr) => pr.date === selectedDate),
    [progressReports, selectedDate]
  );

  const selectedReport = currentReportIndex >= 0 ? progressReports[currentReportIndex] : null;
  const previousReport = currentReportIndex > 0 ? progressReports[currentReportIndex - 1] : null;

  const previousGradesMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    previousReport?.report?.forEach((row) => {
      if (row.course && row.grade !== undefined && row.grade !== '') {
        map[row.course] = parseFloat(row.grade);
      }
    });
    return map;
  }, [previousReport]);

  const getGradeDifference = (course: string, currentGrade: any): number | null => {
    if (!previousGradesMap[course] || !currentGrade || currentReportIndex <= 0) return null;
    const current = parseFloat(currentGrade);
    if (isNaN(current)) return null;
    return current - previousGradesMap[course];
  };

  const displayColumns = COLUMN_ORDER.filter((col) =>
    selectedReport?.report?.some((row) => row[col] !== undefined && row[col] !== '')
  );

  const filteredRows =
    selectedReport?.report?.filter((row) =>
      displayColumns.some((col) => row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '')
    ) ?? [];

  const columns: SimpleTableColumn[] = displayColumns.map((col) => ({
    key: col,
    label: COLUMN_LABELS[col] || col,
    width: WIDE_COLUMNS.has(col) ? 130 : 72,
  }));

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Progress Report" />
      <View className="flex-1 gap-4 px-4" style={{ paddingBottom: insets.bottom + 16 }}>
        {loading && <Spinner className="py-8" />}
        {error && <Text className="py-8 text-center text-destructive">Error loading progress report: {error}</Text>}
        {!loading && !error && progressReports.length === 0 && (
          <Text className="py-8 text-center text-muted-foreground">No progress report data available</Text>
        )}

        {!loading && !error && progressReports.length > 0 && (
          <>
            <View className="flex-row items-center gap-3 pt-2">
              <Text className="text-sm font-medium">Date:</Text>
              <Select
                value={selectedDate ? { value: selectedDate, label: selectedDate } : undefined}
                onValueChange={(option) => option && setSelectedDate(option.value)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select date" className="text-sm text-foreground" />
                </SelectTrigger>
                <SelectContent>
                  {progressReports.map((pr) => (
                    <SelectItem key={pr.date} value={pr.date} label={pr.date} />
                  ))}
                </SelectContent>
              </Select>
            </View>

            <ScrollView className="flex-1">
              {filteredRows.length > 0 ? (
                <SimpleTable
                  columns={columns}
                  rows={filteredRows}
                  renderCell={(row, col) => {
                    const cellValue = row[col.key] || '';
                    const isGradeColumn = col.key === 'grade';
                    const difference = isGradeColumn ? getGradeDifference(row.course, cellValue) : null;
                    return (
                      <View className="flex-row items-center gap-1">
                        <Text className="text-xs" numberOfLines={1}>
                          {cellValue}
                        </Text>
                        {difference !== null && <GradeDiffBadge difference={difference} />}
                      </View>
                    );
                  }}
                />
              ) : (
                <Text className="py-8 text-center text-muted-foreground">
                  No data available for this progress report
                </Text>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}
