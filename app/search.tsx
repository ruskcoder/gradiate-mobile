import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { formatGrade } from '@/lib/grade-display';
import { getCurrentClasses } from '@/lib/insights';
import { useCurrentUser } from '@/lib/store';
import { useAppSettings } from '@/lib/app-settings';
import { useRouter } from 'expo-router';
import { ArrowLeft, BookOpen, FileText } from 'lucide-react-native';
import * as React from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Every standalone screen worth jumping to. Tab-mode tools (What If, Impacts,
// History…) need a class picked first, so they're reached through a class.
const PAGES = [
  { title: 'Grades', href: '/grades' },
  { title: 'Dashboard', href: '/insights/overview' },
  { title: 'Missing Work', href: '/insights/missing' },
  { title: 'Attendance', href: '/academics/attendance' },
  { title: 'Schedules', href: '/academics/schedules' },
  { title: 'Bell Schedule', href: '/academics/bell-schedule' },
  { title: 'Transcripts', href: '/academics/transcripts' },
  { title: 'Report Card', href: '/academics/report-card' },
  { title: 'Progress Report', href: '/academics/progress-report' },
  { title: 'Teachers', href: '/academics/teachers' },
  { title: 'GPA Calculator', href: '/calculators/gpa' },
  { title: 'Rank Calculator', href: '/calculators/rank' },
  { title: 'Final Exam Calculator', href: '/calculators/final-exam' },
  { title: 'Tools', href: '/tools' },
  { title: 'Settings', href: '/settings' },
  { title: 'Account Details', href: '/account' },
];

type Result =
  | { kind: 'page'; key: string; title: string; href: string }
  | { kind: 'class'; key: string; title: string; subtitle: string; course: string; average: number | null };

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useCurrentUser();
  const { numberDisplay } = useAppSettings();
  const [query, setQuery] = React.useState('');
  const { term, classes } = React.useMemo(() => getCurrentClasses(user), [user]);

  const results = React.useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (...s: string[]) => !q || s.some((x) => x.toLowerCase().includes(q));
    const classResults: Result[] = classes
      .filter((c) => match(c.name, c.course))
      .map((c) => ({ kind: 'class', key: c.key, title: c.name, subtitle: c.course, course: c.course, average: c.average }));
    const pageResults: Result[] = PAGES.filter((p) => match(p.title)).map((p) => ({ kind: 'page', key: p.href, ...p }));
    return [...classResults, ...pageResults];
  }, [query, classes]);

  const open = (r: Result) => {
    if (r.kind === 'page') {
      router.replace(r.href as any);
    } else if (r.average !== null) {
      router.replace({
        pathname: '/grades/[id]',
        params: { id: r.course, name: r.title, average: String(r.average), term },
      });
    }
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-2 px-4 py-3">
        <Button variant="ghost" size="icon" className="-ml-2 rounded-full" onPress={() => router.back()}>
          <Icon as={ArrowLeft} className="size-6 text-foreground" />
        </Button>
        <Input
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Search classes and pages"
          returnKeyType="go"
          onSubmitEditing={() => results[0] && open(results[0])}
          className="flex-1"
        />
      </View>
      <FlatList
        data={results}
        keyExtractor={(r) => `${r.kind}:${r.key}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 6 }}
        ListEmptyComponent={<Text className="py-8 text-center text-muted-foreground">No matches</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => open(item)}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:bg-accent">
            <Icon as={item.kind === 'class' ? BookOpen : FileText} className="size-5 text-muted-foreground" />
            <View className="min-w-0 flex-1">
              <Text className="font-medium" numberOfLines={1}>
                {item.title}
              </Text>
              <Text className="text-xs text-muted-foreground">{item.kind === 'class' ? item.subtitle : 'Page'}</Text>
            </View>
            {item.kind === 'class' && <Text className="font-semibold">{formatGrade(item.average, numberDisplay)}</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}
