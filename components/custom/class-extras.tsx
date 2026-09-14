import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { goalPlan, parseNum } from '@/lib/insights';
import { useCurrentUser, useStore } from '@/lib/store';
import { NotebookPen, Target } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

/** Goal target + per-class notes shown at the bottom of a course's page. */
export function ClassExtras({
  course,
  name,
  average,
  categories,
}: {
  course: string;
  name: string;
  average: number | string | null | undefined;
  categories: Record<string, any> | undefined;
}) {
  const user = useCurrentUser();
  const changeUserData = useStore((s) => s.changeUserData);
  const key = `${course}|${name}`;
  const goal = user?.goals?.[key];
  const [goalInput, setGoalInput] = React.useState(goal !== undefined ? String(goal) : '');
  const [note, setNote] = React.useState(user?.classNotes?.[key] ?? '');

  const saveGoal = (v: string) => {
    const goals = { ...(user?.goals || {}) };
    const n = parseFloat(v);
    if (Number.isFinite(n)) goals[key] = n;
    else delete goals[key];
    changeUserData('goals', goals);
    setGoalInput(Number.isFinite(n) ? String(n) : '');
  };

  const saveNote = () => {
    const notes = { ...(user?.classNotes || {}) };
    if (note.trim()) notes[key] = note;
    else delete notes[key];
    changeUserData('classNotes', notes);
  };

  const avg = parseNum(average);
  const plan = React.useMemo(
    () => (goal !== undefined ? goalPlan(categories, goal).slice(0, 3) : []),
    [categories, goal]
  );

  return (
    <View className="gap-3">
      <View className="gap-2 rounded-xl border border-border bg-card p-3">
        <View className="flex-row items-center gap-2">
          <Icon as={Target} className="size-4 text-foreground" />
          <Text className="text-base font-semibold">Goal</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Input
            value={goalInput}
            onChangeText={setGoalInput}
            onSubmitEditing={() => saveGoal(goalInput)}
            placeholder="Target average"
            keyboardType="decimal-pad"
            className="h-9 flex-1"
          />
          <Button size="sm" variant="outline" onPress={() => saveGoal('89.5')}>
            <Text>A</Text>
          </Button>
          <Button size="sm" variant="outline" onPress={() => saveGoal('79.5')}>
            <Text>B</Text>
          </Button>
          <Button size="sm" onPress={() => saveGoal(goalInput)}>
            <Text>Set</Text>
          </Button>
        </View>
        {goal === undefined ? (
          <Text className="text-xs text-muted-foreground">
            Set a target to see what you need on upcoming work.
          </Text>
        ) : avg !== null && avg >= goal ? (
          <Text className="text-sm text-green-600">
            On track: {avg.toFixed(2)} ≥ {goal}.
          </Text>
        ) : plan.length ? (
          <View className="gap-1">
            {avg !== null && (
              <Text className="text-sm text-red-600">{(goal - avg).toFixed(2)} below goal.</Text>
            )}
            {plan.map((p) => (
              <Text key={p.category} className="text-sm">
                Next <Text className="text-sm font-medium">{p.category}</Text>:{' '}
                <Text className={`text-sm font-semibold ${p.needed > 100 ? 'text-red-600' : ''}`}>
                  {p.needed > 100
                    ? `${p.needed.toFixed(1)}% (not reachable with one)`
                    : `${Math.max(0, p.needed).toFixed(1)}%`}
                </Text>
              </Text>
            ))}
          </View>
        ) : (
          <Text className="text-xs text-muted-foreground">No category data for this class yet.</Text>
        )}
        {goal !== undefined && (
          <Button size="sm" variant="ghost" className="self-start px-0" onPress={() => saveGoal('')}>
            <Text>Clear goal</Text>
          </Button>
        )}
      </View>

      <View className="gap-2 rounded-xl border border-border bg-card p-3">
        <View className="flex-row items-center gap-2">
          <Icon as={NotebookPen} className="size-4 text-foreground" />
          <Text className="text-base font-semibold">Notes</Text>
        </View>
        <Input
          value={note}
          onChangeText={setNote}
          onBlur={saveNote}
          onEndEditing={saveNote}
          placeholder="Test dates, teacher preferences, reminders…"
          multiline
          textAlignVertical="top"
          className="min-h-24 py-2"
        />
        <Text className="text-xs text-muted-foreground">Saved on this device when you tap away.</Text>
      </View>
    </View>
  );
}
