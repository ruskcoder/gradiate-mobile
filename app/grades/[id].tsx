import { AssignmentCard, type AssignmentScore } from '@/components/custom/assignment-card';
import { CategoryCard, type CategoryCardData } from '@/components/custom/category-card';
import { GradeRing } from '@/components/custom/grade-ring';
import { Spinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { getSingleClass } from '@/lib/grades-api';
import { getLatestGradesLoad } from '@/lib/grades-store';
import { transformGroupsToCategories } from '@/lib/utils';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calculator } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ClassDetail {
  courseName: string;
  id: string;
  grade: number;
  categories: Record<string, CategoryCardData>;
  scores: AssignmentScore[];
}

/** Chunks category entries into columns of up to 2, stacked vertically within
 *  each column. */
function chunkCategories(
  categories: Record<string, CategoryCardData>
): [string, CategoryCardData][][] {
  const entries = Object.entries(categories);
  const columns: [string, CategoryCardData][][] = [];
  for (let i = 0; i < entries.length; i += 2) {
    columns.push(entries.slice(i, i + 2));
  }
  return columns;
}

export default function GradesDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    average?: string;
    term?: string;
    subterm?: string;
    dataFormat?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [detail, setDetail] = React.useState<ClassDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // The grade ring and each category column are sized to half the content
  // width so the ring + first column exactly fill the screen; the whole row
  // then scrolls horizontally as one unit to reveal further columns.
  const { width: windowWidth } = useWindowDimensions();
  const H_PADDING = 16;
  const ROW_GAP = 12;
  const columnWidth = (windowWidth - H_PADDING * 2 - ROW_GAP) / 2;

  React.useEffect(() => {
    const { id, name, average, term, subterm } = params;
    if (!id || !term) return;

    // Prefer whatever's already in the persisted grades store (populated by
    // getClasses) — "scores"-format schools already include categories/scores
    // there, so no extra request is needed.
    const stored = getLatestGradesLoad(term)?.classes.find((c: any) => c.course === id);
    if (stored?.categories) {
      setDetail({
        courseName: stored.name ?? name ?? '',
        id,
        grade: parseFloat(String(stored.average ?? average ?? 0)),
        categories: stored.categories,
        scores: stored.scores ?? [],
      });
      return;
    }

    // Otherwise ("terms" format), fetch full detail for this course.
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const subtermOption = subterm && subterm !== 'All' ? subterm : undefined;
        const result = await getSingleClass(term, id, { subterm: subtermOption });
        if (cancelled) return;
        if (result.success && result.class) {
          const transformed = transformGroupsToCategories(result.class);
          setDetail({
            courseName: transformed.name ?? name ?? '',
            id,
            grade: parseFloat(String(transformed.average ?? average ?? 0)),
            categories: transformed.categories ?? {},
            scores: transformed.scores ?? [],
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load class details');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.id, params.term, params.subterm]);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Button variant="ghost" size="icon" className="-ml-2 rounded-full" onPress={() => router.back()}>
          <Icon as={ArrowLeft} className="size-6 text-foreground" />
        </Button>
        <View className="flex-1 min-w-0">
          <Text className="text-xl font-bold" numberOfLines={1}>
            {detail?.courseName ?? params.name ?? ''}
          </Text>
          <Text className="text-sm text-muted-foreground">{params.id}</Text>
        </View>
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/tools',
              params: {
                courseId: params.id,
                courseName: detail?.courseName ?? params.name ?? '',
                average: String(detail?.grade ?? params.average ?? ''),
                term: params.term ?? '',
              },
            })
          }
          className="items-center justify-center gap-1 px-1 active:opacity-70">
          <Icon as={Calculator} className="size-5 text-muted-foreground" />
          <Text className="text-[11px] font-medium text-muted-foreground">Tools</Text>
        </Pressable>
      </View>

      {loading && (
        <View className="flex-1 items-center justify-center gap-3">
          <Spinner size="large" />
          <Text className="text-muted-foreground">Loading class details...</Text>
        </View>
      )}

      {!loading && error && (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-destructive">{error}</Text>
        </View>
      )}

      {!loading && !error && detail && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16, gap: 20 }}
          className="flex-1">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: ROW_GAP }}>
            <View
              style={{ width: columnWidth }}
              className="items-center justify-center rounded-lg border border-border bg-card p-1">
              <GradeRing grade={detail.grade} size={132} />
            </View>
            {chunkCategories(detail.categories).map((column, idx) => (
              <View key={idx} style={{ width: columnWidth }} className="justify-center gap-2">
                {column.map(([name, data]) => (
                  <CategoryCard key={name} name={name} data={data} />
                ))}
              </View>
            ))}
          </ScrollView>

          <View className="gap-2">
            <Text className="text-lg font-semibold">Assignments</Text>
            <View className="gap-2">
              {detail.scores.map((score, i) => (
                <AssignmentCard key={i} score={score} />
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
