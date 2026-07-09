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
import { getReportCard } from '@/lib/grades-api';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ReportCardRun {
  reportCardRun: string;
  report: Record<string, any>[];
}

const COLUMN_ORDER = [
  'course', 'description', 'period', 'teacher', 'room', 'att_credit', 'ern_credit',
  'first', 'second', 'third', 'exam1', 'sem1', 'fourth', 'fifth', 'sixth', 'exam2', 'sem2', 'eoy',
  'cnd1', 'cnd2', 'cnd3', 'cnd4', 'cnd5', 'cnd6', 'c1', 'c2', 'c3', 'c4', 'c5', 'exda', 'uexa', 'exdt', 'uext',
];

const COLUMN_LABELS: Record<string, string> = {
  course: 'Course', description: 'Description', period: 'Period', teacher: 'Teacher', room: 'Room',
  att_credit: 'Att Credit', ern_credit: 'Ern Credit', first: '1st', second: '2nd', third: '3rd',
  exam1: 'Exam 1', sem1: 'Sem 1', fourth: '4th', fifth: '5th', sixth: '6th', exam2: 'Exam 2', sem2: 'Sem 2',
  eoy: 'EOY', cnd1: 'Cond 1', cnd2: 'Cond 2', cnd3: 'Cond 3', cnd4: 'Cond 4', cnd5: 'Cond 5', cnd6: 'Cond 6',
  c1: 'C1', c2: 'C2', c3: 'C3', c4: 'C4', c5: 'C5', exda: 'Exda', uexa: 'Uexa', exdt: 'Exdt', uext: 'Uext',
};

const WIDE_COLUMNS = new Set(['course', 'description', 'teacher']);

function getGradeDifference(row: Record<string, any>, currentColumn: string): number | null {
  if (!['second', 'third'].includes(currentColumn)) return null;
  const currentValue = parseFloat(row[currentColumn]);
  if (isNaN(currentValue)) return null;
  const previousColumn = currentColumn === 'second' ? 'first' : 'second';
  const previousValue = parseFloat(row[previousColumn]);
  if (isNaN(previousValue)) return null;
  return currentValue - previousValue;
}

export default function ReportCardScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reportCards, setReportCards] = React.useState<ReportCardRun[]>([]);
  const [selectedRun, setSelectedRun] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getReportCard();
        if (data.success && Array.isArray(data.reportCards)) {
          setReportCards(data.reportCards);
          if (data.reportCards.length > 0) setSelectedRun(data.reportCards[0].reportCardRun);
        }
      } catch (e: any) {
        setError(e.message ?? 'Failed to fetch report card');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedReportCard = React.useMemo(
    () => reportCards.find((rc) => rc.reportCardRun === selectedRun) ?? null,
    [reportCards, selectedRun]
  );

  const displayColumns = COLUMN_ORDER.filter((col) =>
    selectedReportCard?.report?.some((row) => row[col] !== undefined && row[col] !== '')
  );

  const displayColumnsKey = displayColumns.join(',');
  const filteredRows = React.useMemo(() => {
    if (!selectedReportCard?.report?.length) return [];
    return selectedReportCard.report.filter((row) =>
      displayColumns.some((col) => row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedReportCard, displayColumnsKey]);

  const columns: SimpleTableColumn[] = displayColumns.map((col) => ({
    key: col,
    label: COLUMN_LABELS[col] || col,
    width: WIDE_COLUMNS.has(col) ? 140 : 72,
  }));

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Report Card" />
      <View className="flex-1 gap-4 px-4" style={{ paddingBottom: insets.bottom + 16 }}>
        {loading && <Spinner className="py-8" />}
        {error && <Text className="py-8 text-center text-destructive">Error loading report card: {error}</Text>}
        {!loading && !error && reportCards.length === 0 && (
          <Text className="py-8 text-center text-muted-foreground">No report card data available</Text>
        )}

        {!loading && !error && reportCards.length > 0 && (
          <>
            <View className="flex-row items-center gap-3 pt-2">
              <Text className="text-sm font-medium">Run:</Text>
              <Select
                value={selectedRun ? { value: selectedRun, label: `Report Card Run ${selectedRun}` } : undefined}
                onValueChange={(option) => option && setSelectedRun(option.value)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select run" className="text-sm text-foreground" />
                </SelectTrigger>
                <SelectContent>
                  {reportCards.map((rc) => (
                    <SelectItem
                      key={rc.reportCardRun}
                      value={rc.reportCardRun}
                      label={`Report Card Run ${rc.reportCardRun}`}
                    />
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
                    const isComparisonColumn = ['second', 'third'].includes(col.key);
                    const difference = isComparisonColumn ? getGradeDifference(row, col.key) : null;
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
                  No data available for this report card
                </Text>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}
