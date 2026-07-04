import { ScreenHeader } from '@/components/custom/screen-header';
import { SimpleTable } from '@/components/custom/simple-table';
import { Spinner } from '@/components/custom/spinner';
import { Text } from '@/components/ui/text';
import { getTranscript } from '@/lib/grades-api';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TranscriptEntry {
  year: string;
  semester: string;
  grade: string;
  school: string;
  credits: string;
  data: string[][];
}

function StatCard({
  label,
  value,
  bg,
  fg,
}: {
  label: string;
  value: string;
  bg: string;
  fg: string;
}) {
  return (
    <View className="min-w-[46%] flex-1 rounded-lg border p-3" style={{ backgroundColor: bg, borderColor: fg + '55' }}>
      <Text className="mb-1 text-xs font-medium" style={{ color: fg }}>
        {label}
      </Text>
      <Text className="text-xl font-bold" style={{ color: fg }}>
        {value}
      </Text>
    </View>
  );
}

export default function TranscriptsScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [transcriptData, setTranscriptData] = React.useState<Record<string, any>>({});

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getTranscript();
        if (data.success && data.transcriptData) setTranscriptData(data.transcriptData);
      } catch (e: any) {
        setError(e.message ?? 'Failed to fetch transcript');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groupedByYear = React.useMemo(() => {
    const groups: Record<string, (TranscriptEntry & { key: string })[]> = {};
    Object.entries(transcriptData).forEach(([key, entry]: [string, any]) => {
      if (typeof entry !== 'object' || !entry?.year || !entry?.semester || !entry?.data) return;
      if (!groups[entry.year]) groups[entry.year] = [];
      groups[entry.year].push({ key, ...entry });
    });
    return groups;
  }, [transcriptData]);

  const summaryStats = {
    rank: transcriptData.rank || 'N/A',
    quartile: transcriptData.quartile || 'N/A',
    weightedGPA: transcriptData['Weighted GPA*'] || 'N/A',
    unweightedGPA: transcriptData['Unweighted GPA*'] || 'N/A',
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Transcripts" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 20 }}
        className="flex-1">
        {loading && <Spinner className="py-8" />}
        {error && <Text className="py-8 text-center text-destructive">Error loading transcript: {error}</Text>}
        {!loading && !error && Object.keys(groupedByYear).length === 0 && (
          <Text className="py-8 text-center text-muted-foreground">No transcript data available</Text>
        )}

        {!loading && !error && Object.keys(groupedByYear).length > 0 && (
          <>
            <View className="flex-row flex-wrap gap-3">
              <StatCard label="Rank" value={String(summaryStats.rank)} bg="#dbeafe" fg="#1e3a8a" />
              <StatCard label="Quartile" value={String(summaryStats.quartile)} bg="#ede9fe" fg="#4c1d95" />
              <StatCard label="Weighted GPA" value={String(summaryStats.weightedGPA)} bg="#dcfce7" fg="#14532d" />
              <StatCard label="Unweighted GPA" value={String(summaryStats.unweightedGPA)} bg="#ffedd5" fg="#7c2d12" />
            </View>

            {Object.entries(groupedByYear).map(([year, entries]) => (
              <View key={year} className="gap-2">
                <Text className="text-xl font-semibold">{year}</Text>
                {entries.map((entry) => (
                  <View key={entry.key} className="gap-2 rounded-lg border border-border p-3">
                    <Text className="text-sm font-medium">
                      Semester {entry.semester}
                      <Text className="font-normal text-muted-foreground">
                        {'  •  Grade '}
                        {entry.grade} • {entry.school}
                      </Text>
                    </Text>
                    <Text className="text-sm font-medium">Credits: {entry.credits}</Text>
                    {entry.data?.length > 0 ? (
                      <SimpleTable
                        columns={entry.data[0].map((h, i) => ({ key: String(i), label: h, width: 90 }))}
                        rows={entry.data.slice(1).map((row) =>
                          Object.fromEntries(row.map((cell, i) => [String(i), cell]))
                        )}
                      />
                    ) : (
                      <Text className="text-sm text-muted-foreground">No course data available</Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
