import { ScreenHeader } from '@/components/custom/screen-header';
import { Spinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { getTranscript } from '@/lib/grades-api';
import { useCurrentUser, useStore } from '@/lib/store';
import { Paperclip, Plus, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface RankPoint {
  id: number;
  gpa: number | null;
  rank: number | null;
}

function DiffChip({ value }: { value: number }) {
  // Lower rank number is better, so the color logic is inverted from a plain diff.
  const bg = value < 0 ? '#dcfce7' : value > 0 ? '#fee2e2' : '#f3f4f6';
  const fg = value < 0 ? '#15803d' : value > 0 ? '#b91c1c' : '#374151';
  return (
    <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: bg }}>
      <Text className="text-xs font-semibold" style={{ color: fg }}>
        {value > 0 ? '+' : ''}
        {value}
      </Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  colorClass,
  children,
}: {
  label: string;
  value: string;
  colorClass: string;
  children?: React.ReactNode;
}) {
  return (
    <View className={`flex-1 gap-1 rounded-lg border p-3 ${colorClass}`}>
      <Text className="text-xs font-medium opacity-80">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Text className="text-xl font-bold">{value}</Text>
        {children}
      </View>
    </View>
  );
}

export default function RankCalculatorScreen() {
  const insets = useSafeAreaInsets();
  const user = useCurrentUser();
  const changeUserData = useStore((s) => s.changeUserData);

  const [loading, setLoading] = React.useState(true);
  const [currentRank, setCurrentRank] = React.useState<number | null>(null);
  const [classSize, setClassSize] = React.useState<number | null>(null);
  const [rankPoints, setRankPoints] = React.useState<RankPoint[]>([]);
  const [userRankGPA, setUserRankGPA] = React.useState('');
  const [transcriptGPA, setTranscriptGPA] = React.useState<number | null>(null);
  const nextRankId = React.useRef(1);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await getTranscript();
        if (cancelled || !data.success || !data.transcriptData) return;

        if (data.transcriptData['Weighted GPA*']) {
          setTranscriptGPA(parseFloat(data.transcriptData['Weighted GPA*']));
        }

        if (data.transcriptData['rank']) {
          const parts = String(data.transcriptData['rank']).split('/');
          if (parts.length === 2) {
            const rank = parseInt(parts[0].trim());
            const size = parseInt(parts[1].trim());
            if (!isNaN(rank) && !isNaN(size)) {
              setCurrentRank(rank);
              setClassSize(size);
            }
          }
        }

        if (user?.rankDataPoints?.length) {
          const points = user.rankDataPoints.map((p, idx) => ({ id: idx + 1, ...p }));
          setRankPoints(points);
          nextRankId.current = points.length + 1;
        } else {
          setRankPoints([
            { id: 1, gpa: null, rank: null },
            { id: 2, gpa: null, rank: null },
          ]);
          nextRankId.current = 3;
        }
      } catch (e) {
        console.error('Failed to load transcript for rank calculator', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const predictRank = (targetGPA: number) => {
    const validPoints = rankPoints
      .filter((p) => p.gpa !== null && p.rank !== null)
      .map((p) => ({ gpa: Number(p.gpa), rank: Number(p.rank) }))
      .filter((p) => !isNaN(p.gpa) && !isNaN(p.rank));

    if (validPoints.length === 0) return null;
    if (validPoints.length === 1) return validPoints[0].rank;

    const n = validPoints.length;
    const sumX = validPoints.reduce((sum, p) => sum + p.gpa, 0);
    const sumY = validPoints.reduce((sum, p) => sum + p.rank, 0);
    const sumXY = validPoints.reduce((sum, p) => sum + p.gpa * p.rank, 0);
    const sumX2 = validPoints.reduce((sum, p) => sum + p.gpa * p.gpa, 0);

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return Math.round(sumY / n);

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    const predicted = Math.round(slope * targetGPA + intercept);
    return predicted < 1 ? 1 : predicted;
  };

  const updateRankPoint = (pointId: number, field: 'gpa' | 'rank', value: string) => {
    setRankPoints((prev) => {
      const updated = prev.map((p) =>
        p.id === pointId
          ? {
              ...p,
              [field]: value === '' ? null : field === 'gpa' ? parseFloat(value) : parseInt(value),
            }
          : p
      );
      changeUserData(
        'rankDataPoints',
        updated.map(({ gpa, rank }) => ({ gpa, rank }))
      );
      return updated;
    });
  };

  const addRankPoint = () => {
    setRankPoints((prev) => {
      const updated = [...prev, { id: nextRankId.current, gpa: null, rank: null }];
      changeUserData(
        'rankDataPoints',
        updated.map(({ gpa, rank }) => ({ gpa, rank }))
      );
      return updated;
    });
    nextRankId.current += 1;
  };

  const deleteRankPoint = (pointId: number) => {
    setRankPoints((prev) => {
      const updated = prev.filter((p) => p.id !== pointId);
      changeUserData(
        'rankDataPoints',
        updated.map(({ gpa, rank }) => ({ gpa, rank }))
      );
      return updated;
    });
  };

  const userGPANum = userRankGPA ? parseFloat(userRankGPA) : null;
  const predictedRank = userGPANum ? predictRank(userGPANum) : null;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Rank Calculator" />

      {loading && (
        <View className="flex-1 items-center justify-center gap-3">
          <Spinner size="large" />
          <Text className="text-muted-foreground">Loading transcript...</Text>
        </View>
      )}

      {!loading && (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }}
          className="flex-1">
          <View className="flex-row gap-3">
            <StatCard
              label="Current Rank"
              value={currentRank && classSize ? `${currentRank} / ${classSize}` : '— / —'}
              colorClass="border-amber-300 bg-amber-100 dark:border-amber-700 dark:bg-amber-950"
            />
            <StatCard
              label="Predicted Rank"
              value={predictedRank && classSize ? `${predictedRank} / ${classSize}` : '—'}
              colorClass="border-orange-300 bg-orange-100 dark:border-orange-700 dark:bg-orange-950">
              {predictedRank && currentRank && <DiffChip value={predictedRank - currentRank} />}
            </StatCard>
          </View>

          <Text className="text-sm text-muted-foreground">
            Disclaimer: this calculator does not account for repeated ranks and is just a linear
            regression. You'll need 10+ data points for accurate results.
          </Text>

          <View className="gap-2">
            <Text className="text-sm font-medium">Known GPAs and ranks</Text>
            {rankPoints.map((point) => (
              <View key={point.id} className="flex-row items-center gap-2">
                <Input
                  value={point.gpa === null ? '' : String(point.gpa)}
                  onChangeText={(v) => updateRankPoint(point.id, 'gpa', v)}
                  placeholder="3.8"
                  keyboardType="decimal-pad"
                  className="h-9 flex-1"
                />
                <Input
                  value={point.rank === null ? '' : String(point.rank)}
                  onChangeText={(v) => updateRankPoint(point.id, 'rank', v)}
                  placeholder="15"
                  keyboardType="number-pad"
                  className="h-9 flex-1"
                />
                {rankPoints.length > 1 && (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    onPress={() => deleteRankPoint(point.id)}>
                    <Icon as={Trash2} className="size-4 text-destructive" />
                  </Button>
                )}
              </View>
            ))}
            <Button variant="outline" size="sm" onPress={addRankPoint}>
              <Icon as={Plus} className="size-4" />
              <Text>Add Data Point</Text>
            </Button>
          </View>

          <View className="gap-2 border-t border-border pt-3">
            <Text className="text-sm font-medium">Your GPA</Text>
            <View className="flex-row items-center gap-2">
              <Input
                value={userRankGPA}
                onChangeText={setUserRankGPA}
                placeholder="Enter your GPA"
                keyboardType="decimal-pad"
                className="h-9 flex-1"
              />
              {transcriptGPA !== null && (
                <Button
                  size="icon"
                  variant="outline"
                  className="h-9 w-9"
                  onPress={() => setUserRankGPA(transcriptGPA.toFixed(4))}>
                  <Icon as={Paperclip} className="size-4" />
                </Button>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
