import { ScreenHeader } from '@/components/custom/screen-header';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import { useAppSettings } from '@/lib/app-settings';
import { formatGrade } from '@/lib/grade-display';
import { getTranscript } from '@/lib/grades-api';
import {
  combineWithTranscript,
  defaultGpaType,
  getCurrentClasses,
  getMissingAssignments,
  periodStatus,
  projectGpa,
  shareSummary,
  type InsightClass,
} from '@/lib/insights';
import { useCurrentUser, useStore } from '@/lib/store';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  GraduationCap,
  ListTodo,
  Plus,
  Share2,
  Target,
  Trash2,
} from 'lucide-react-native';
import * as React from 'react';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function Widget({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: any;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <Icon as={icon} className="size-5 text-muted-foreground" />
          <Text className="text-lg font-semibold">{title}</Text>
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Text className="text-sm text-muted-foreground">{children}</Text>;
}

function GpaWidget({ classes }: { classes: InsightClass[] }) {
  const user = useCurrentUser();
  const [transcript, setTranscript] = React.useState<{ weighted: number | null; courses: number } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const weighted = React.useMemo(() => projectGpa(user, classes, defaultGpaType(user)), [user, classes]);
  const unweighted = React.useMemo(() => projectGpa(user, classes, 'unweighted'), [user, classes]);

  const loadTranscript = async () => {
    setLoading(true);
    try {
      const data = await getTranscript();
      const t = data?.transcriptData || {};
      let courses = 0;
      for (const [k, sem] of Object.entries<any>(t)) {
        if (['rank', 'quartile', 'Weighted GPA*', 'Unweighted GPA*'].includes(k)) continue;
        courses += Math.max(0, (sem?.data?.length || 1) - 1);
      }
      setTranscript({ weighted: parseFloat(t['Weighted GPA*']) || null, courses });
    } catch (e: any) {
      Alert.alert('Could not load transcript', e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const cumulative = transcript ? combineWithTranscript(transcript.weighted, transcript.courses, weighted) : null;

  return (
    <Widget title="GPA Projection" icon={GraduationCap}>
      {!weighted ? (
        <Empty>Load your grades once to see a projection.</Empty>
      ) : (
        <>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs text-muted-foreground">This term (weighted)</Text>
              <Text className="text-3xl font-bold">{weighted.gpa.toFixed(3)}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-muted-foreground">This term (unweighted)</Text>
              <Text className="text-3xl font-bold">{unweighted ? unweighted.gpa.toFixed(3) : '—'}</Text>
            </View>
          </View>
          {cumulative !== null ? (
            <Text className="text-sm">
              Cumulative if grades hold: <Text className="text-sm font-semibold">{cumulative.toFixed(4)}</Text>
              <Text className="text-sm text-muted-foreground"> (transcript {transcript?.weighted?.toFixed(4)})</Text>
            </Text>
          ) : (
            <Button variant="outline" size="sm" onPress={loadTranscript} disabled={loading}>
              <Text>{loading ? 'Loading transcript…' : 'Include transcript for cumulative GPA'}</Text>
            </Button>
          )}
          <Text className="text-xs text-muted-foreground">
            Based on {weighted.count} classes. Course types come from the GPA calculator.
          </Text>
        </>
      )}
    </Widget>
  );
}

function BellWidget() {
  const user = useCurrentUser();
  const router = useRouter();
  const changeUserData = useStore((s) => s.changeUserData);
  const [now, setNow] = React.useState(() => new Date());
  const schedules = user?.bellSchedules || [];
  const active = schedules.find((s) => s.name === user?.activeBellSchedule) || schedules[0];

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const status = active ? periodStatus(active, now) : null;

  return (
    <Widget title="Bell Schedule" icon={Bell}>
      {schedules.length === 0 ? (
        <>
          <Empty>No bell schedules yet.</Empty>
          <Button variant="outline" size="sm" onPress={() => router.push('/academics/bell-schedule' as any)}>
            <Text>Add a bell schedule</Text>
          </Button>
        </>
      ) : (
        <>
          {schedules.length > 1 && (
            <Select
              value={active ? { value: active.name, label: active.name } : undefined}
              onValueChange={(o) => o && changeUserData('activeBellSchedule', o.value)}>
              <SelectTrigger>
                <SelectValue placeholder="Schedule" className="text-sm text-foreground" />
              </SelectTrigger>
              <SelectContent>
                {schedules.map((s) => (
                  <SelectItem key={s.name} value={s.name} label={s.name} />
                ))}
              </SelectContent>
            </Select>
          )}
          {status?.current ? (
            <View className="gap-2">
              <Text className="text-2xl font-bold">{status.current.name}</Text>
              <Progress value={Math.round((status.progress || 0) * 100)} indicatorClassName="bg-primary" />
              <Text className="text-sm text-muted-foreground">
                {status.minutesLeft} min left
                {status.next ? ` · next: ${status.next.name} at ${status.next.startTime}` : ''}
              </Text>
            </View>
          ) : status?.next ? (
            <Text className="text-sm">
              <Text className="text-sm font-semibold">{status.next.name}</Text> starts in{' '}
              {status.minutesUntilNext} min ({status.next.startTime})
            </Text>
          ) : (
            <Empty>No more periods today.</Empty>
          )}
        </>
      )}
    </Widget>
  );
}

function ClassesWidget({ classes, term }: { classes: InsightClass[]; term: string }) {
  const user = useCurrentUser();
  const router = useRouter();
  const { numberDisplay } = useAppSettings();
  const goals = user?.goals || {};

  return (
    <Widget title="Classes" icon={Target}>
      {classes.length === 0 ? (
        <Empty>No stored grades yet. Open the Grades tab first.</Empty>
      ) : (
        <View>
          {classes.map((cls) => {
            const goal = goals[cls.key];
            const belowGoal = goal !== undefined && cls.average !== null && cls.average < goal;
            const atRisk = cls.average !== null && cls.average < 70;
            return (
              <Pressable
                key={cls.key}
                className="flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
                onPress={() =>
                  cls.average !== null &&
                  router.push({
                    pathname: '/grades/[id]',
                    params: { id: cls.course, name: cls.name, average: String(cls.average), term },
                  })
                }>
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-1">
                    {(atRisk || belowGoal) && <Icon as={AlertTriangle} className="size-4 text-red-500" />}
                    <Text className="flex-1 font-medium" numberOfLines={1}>
                      {cls.name}
                    </Text>
                  </View>
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {goal !== undefined ? `Goal ${goal}` : cls.course}
                  </Text>
                </View>
                {cls.delta !== null && (
                  <View className="flex-row items-center">
                    <Icon
                      as={cls.delta > 0 ? ArrowUp : ArrowDown}
                      className={`size-3 ${cls.delta > 0 ? 'text-green-600' : 'text-red-600'}`}
                    />
                    <Text className={`text-xs ${cls.delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(cls.delta).toFixed(2)}
                    </Text>
                  </View>
                )}
                <Text className="w-14 text-right font-semibold">{formatGrade(cls.average, numberDisplay)}</Text>
              </Pressable>
            );
          })}
          <Text className="pt-2 text-xs text-muted-foreground">Tap a class to set a goal or add notes.</Text>
        </View>
      )}
    </Widget>
  );
}

function MissingWidget({ classes }: { classes: InsightClass[] }) {
  const router = useRouter();
  const missing = React.useMemo(() => getMissingAssignments(classes), [classes]);
  return (
    <Widget
      title="Missing Work"
      icon={AlertTriangle}
      action={
        <Pressable onPress={() => router.push('/insights/missing' as any)}>
          <Text className="text-sm text-muted-foreground">View all</Text>
        </Pressable>
      }>
      {missing.length === 0 ? (
        <Empty>Nothing missing in stored grades.</Empty>
      ) : (
        <View className="gap-2">
          {missing.slice(0, 5).map((m) => (
            <View key={m.id} className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-medium" numberOfLines={1}>
                  {m.name}
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {m.className} · {m.reason}
                </Text>
              </View>
              {m.gain !== null && <Text className="text-xs font-semibold text-green-600">+{m.gain.toFixed(2)}</Text>}
            </View>
          ))}
          {missing.length > 5 && <Text className="text-xs text-muted-foreground">+{missing.length - 5} more</Text>}
        </View>
      )}
    </Widget>
  );
}

function TodosWidget() {
  const user = useCurrentUser();
  const addTodo = useStore((s) => s.addTodo);
  const toggleTodoComplete = useStore((s) => s.toggleTodoComplete);
  const removeTodo = useStore((s) => s.removeTodo);
  const [title, setTitle] = React.useState('');
  const todos = [...(user?.todos || [])].sort((a, b) => Number(a.completed) - Number(b.completed));

  const add = () => {
    if (!title.trim()) return;
    addTodo({ title: title.trim(), dueDate: null, completed: false });
    setTitle('');
  };

  return (
    <Widget title="To-Dos" icon={ListTodo}>
      <View className="flex-row gap-2">
        <Input value={title} onChangeText={setTitle} onSubmitEditing={add} placeholder="Add a to-do" className="h-9 flex-1" />
        <Button size="icon" className="h-9 w-9" onPress={add}>
          <Icon as={Plus} className="size-4 text-primary-foreground" />
        </Button>
      </View>
      {todos.length === 0 ? (
        <Empty>Nothing to do.</Empty>
      ) : (
        <View className="gap-1">
          {todos.map((t) => (
            <View key={t.id} className="flex-row items-center gap-2">
              <Pressable
                onPress={() => toggleTodoComplete(t.id)}
                className={`h-5 w-5 items-center justify-center rounded border ${t.completed ? 'border-primary bg-primary' : 'border-border'}`}>
                {t.completed && <Icon as={Check} className="size-3 text-primary-foreground" />}
              </Pressable>
              <Text
                className={`flex-1 text-sm ${t.completed ? 'text-muted-foreground line-through' : ''}`}
                numberOfLines={2}>
                {t.title}
              </Text>
              <Button size="icon" variant="ghost" className="h-8 w-8" onPress={() => removeTodo(t.id)}>
                <Icon as={Trash2} className="size-4 text-muted-foreground" />
              </Button>
            </View>
          ))}
        </View>
      )}
    </Widget>
  );
}

export default function OverviewScreen() {
  const insets = useSafeAreaInsets();
  const user = useCurrentUser();
  const { term, loadedAt, classes } = React.useMemo(() => getCurrentClasses(user), [user]);

  const share = (hideNumbers: boolean) => {
    const gpa = projectGpa(user, classes)?.gpa ?? null;
    Share.share({ message: shareSummary(classes, { hideNumbers, gpa }) }).catch(() => {});
  };

  const promptShare = () =>
    Alert.alert('Share grades', 'Include exact numbers, or letter grades only?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Letters only', onPress: () => share(true) },
      { text: 'Numbers', onPress: () => share(false) },
    ]);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Overview"
        right={
          classes.length > 0 ? (
            <Button variant="ghost" size="icon" className="rounded-full" onPress={promptShare}>
              <Icon as={Share2} className="size-5 text-foreground" />
            </Button>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: insets.bottom + 24, gap: 12 }}>
        {loadedAt && (
          <Text className="text-xs text-muted-foreground">
            {term} · last updated {new Date(loadedAt).toLocaleString()}
          </Text>
        )}
        <GpaWidget classes={classes} />
        <BellWidget />
        <ClassesWidget classes={classes} term={term} />
        <MissingWidget classes={classes} />
        <TodosWidget />
      </ScrollView>
    </View>
  );
}
