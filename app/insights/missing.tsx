import { ScreenHeader } from '@/components/custom/screen-header';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { syncMissingTodos } from '@/lib/grade-alerts';
import { getCurrentClasses, getMissingAssignments } from '@/lib/insights';
import { useCurrentUser, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Check, ListPlus } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MissingWorkScreen() {
  const insets = useSafeAreaInsets();
  const user = useCurrentUser();
  const changeUserData = useStore((s) => s.changeUserData);
  const addTodo = useStore((s) => s.addTodo);

  const { classes, loadedAt } = React.useMemo(() => getCurrentClasses(user), [user]);
  const missing = React.useMemo(() => getMissingAssignments(classes), [classes]);
  const todoSources = new Set((user?.todos || []).map((t) => t.source).filter(Boolean));
  const totalGain = missing.reduce((s, m) => s + (m.gain || 0), 0);
  const classesWithoutDetail = classes.filter((c) => !c.scores.length).length;
  const autoTodo = !!user?.autoTodoFromMissing;

  const setAutoTodo = (v: boolean) => {
    changeUserData('autoTodoFromMissing', v);
    if (v) syncMissingTodos();
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Missing Work" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <View className="flex-row gap-3">
          <View className="flex-1 rounded-xl border border-border bg-card p-3">
            <Text className="text-xs text-muted-foreground">Assignments</Text>
            <Text className="text-3xl font-bold">{missing.length}</Text>
          </View>
          <View className="flex-1 rounded-xl border border-border bg-card p-3">
            <Text className="text-xs text-muted-foreground">Points to gain</Text>
            <Text className="text-3xl font-bold text-green-600">+{totalGain.toFixed(2)}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => setAutoTodo(!autoTodo)}
          className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
          <Text className="flex-1 text-sm font-medium">Automatically add missing work to my to-dos</Text>
          <View pointerEvents="none">
            <Switch checked={autoTodo} onCheckedChange={setAutoTodo} />
          </View>
        </Pressable>

        {missing.length === 0 ? (
          <Text className="py-8 text-center text-muted-foreground">Nothing missing in your stored grades.</Text>
        ) : (
          <View className="gap-2">
            {missing.map((m) => {
              const source = `missing:${m.id}`;
              const added = todoSources.has(source);
              return (
                <View key={m.id} className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="font-semibold" numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                      {m.className} · {m.category}
                      {m.dateDue ? ` · ${m.dateDue}` : ''}
                    </Text>
                    <View className="flex-row">
                      <View className={cn('rounded-md px-1.5', m.reason === 'Missing' ? 'bg-red-500' : 'bg-gray-500')}>
                        <Text className="text-xs font-medium text-white">{m.reason}</Text>
                      </View>
                    </View>
                  </View>
                  <Text className="font-semibold text-green-600">
                    {m.gain !== null ? `+${m.gain.toFixed(2)}` : '—'}
                  </Text>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    disabled={added}
                    onPress={() =>
                      addTodo({ title: `${m.className}: ${m.name}`, dueDate: null, completed: false, source })
                    }>
                    <Icon as={added ? Check : ListPlus} className="size-4 text-foreground" />
                  </Button>
                </View>
              );
            })}
          </View>
        )}

        <Text className="text-xs text-muted-foreground">
          Based on grades stored {loadedAt ? `on ${new Date(loadedAt).toLocaleString()}` : 'on this device'}. The gain
          is how much the class average rises if you turn it in for full credit.
          {classesWithoutDetail > 0
            ? ` ${classesWithoutDetail} class(es) have no assignments stored yet. Open them from the Grades tab to include them.`
            : ''}
        </Text>
      </ScrollView>
    </View>
  );
}
