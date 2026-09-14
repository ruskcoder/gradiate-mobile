import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Text } from '@/components/ui/text';
import { goalPlan, parseNum } from '@/lib/insights';
import { useCurrentUser, useStore } from '@/lib/store';
import { NotebookPen, Target } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

interface ClassRef {
  course: string;
  name: string;
  average: number | string | null | undefined;
  categories: Record<string, any> | undefined;
}

function HeaderButton({ icon, label, active }: { icon: any; label: string; active: boolean }) {
  return (
    <View className="items-center justify-center gap-1 px-1">
      <View>
        <Icon as={icon} className="size-5 text-muted-foreground" />
        {active && <View className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-primary" />}
      </View>
      <Text className="text-[11px] font-medium text-muted-foreground">{label}</Text>
    </View>
  );
}

function GoalBody({ course, name, average, categories }: ClassRef) {
  const user = useCurrentUser();
  const changeUserData = useStore((s) => s.changeUserData);
  const key = `${course}|${name}`;
  const goal = user?.goals?.[key];
  const [input, setInput] = React.useState(goal !== undefined ? String(goal) : '');

  const save = (v: string) => {
    const goals = { ...(user?.goals || {}) };
    const n = parseFloat(v);
    if (Number.isFinite(n)) goals[key] = n;
    else delete goals[key];
    changeUserData('goals', goals);
    setInput(Number.isFinite(n) ? String(n) : '');
  };

  const avg = parseNum(average);
  const plan = React.useMemo(
    () => (goal !== undefined ? goalPlan(categories, goal).slice(0, 3) : []),
    [categories, goal]
  );

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Icon as={Target} className="size-4 text-foreground" />
        <Text className="text-base font-semibold">Goal</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Input
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => save(input)}
          placeholder="Target average"
          keyboardType="decimal-pad"
          className="h-9 flex-1"
        />
        <Button size="sm" onPress={() => save(input)}>
          <Text>Set</Text>
        </Button>
      </View>
      <View className="flex-row gap-2">
        <Button size="sm" variant="outline" onPress={() => save('89.5')}>
          <Text>A</Text>
        </Button>
        <Button size="sm" variant="outline" onPress={() => save('79.5')}>
          <Text>B</Text>
        </Button>
        {goal !== undefined && (
          <Button size="sm" variant="ghost" onPress={() => save('')}>
            <Text>Clear</Text>
          </Button>
        )}
      </View>
      {goal === undefined ? (
        <Text className="text-xs text-muted-foreground">Set a target to see what you need on upcoming work.</Text>
      ) : avg !== null && avg >= goal ? (
        <Text className="text-sm text-green-600">
          On track: {avg.toFixed(2)} ≥ {goal}.
        </Text>
      ) : plan.length ? (
        <View className="gap-1">
          {avg !== null && <Text className="text-sm text-red-600">{(goal - avg).toFixed(2)} below goal.</Text>}
          {plan.map((p) => (
            <Text key={p.category} className="text-sm">
              Next <Text className="text-sm font-medium">{p.category}</Text>:{' '}
              <Text className={`text-sm font-semibold ${p.needed > 100 ? 'text-red-600' : ''}`}>
                {p.needed > 100 ? `${p.needed.toFixed(1)}% (not reachable with one)` : `${Math.max(0, p.needed).toFixed(1)}%`}
              </Text>
            </Text>
          ))}
        </View>
      ) : (
        <Text className="text-xs text-muted-foreground">No category data for this class yet.</Text>
      )}
    </View>
  );
}

function NotesBody({ course, name }: Pick<ClassRef, 'course' | 'name'>) {
  const user = useCurrentUser();
  const changeUserData = useStore((s) => s.changeUserData);
  const key = `${course}|${name}`;
  const [note, setNote] = React.useState(user?.classNotes?.[key] ?? '');
  const noteRef = React.useRef(note);
  React.useEffect(() => {
    noteRef.current = note;
  }, [note]);

  const save = React.useCallback(() => {
    const u = useStore.getState().currentUser();
    const notes = { ...(u?.classNotes || {}) };
    if (noteRef.current.trim()) notes[key] = noteRef.current;
    else delete notes[key];
    changeUserData('classNotes', notes);
  }, [key, changeUserData]);

  // Also save when the popover closes without the input blurring first.
  React.useEffect(() => save, [save]);

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Icon as={NotebookPen} className="size-4 text-foreground" />
        <Text className="text-base font-semibold">Notes</Text>
      </View>
      <Input
        value={note}
        onChangeText={setNote}
        onBlur={save}
        placeholder="Test dates, teacher preferences, reminders…"
        multiline
        textAlignVertical="top"
        className="min-h-28 py-2"
      />
      <Text className="text-xs text-muted-foreground">Saved on this device.</Text>
    </View>
  );
}

/** Goal + Notes popover buttons for a course's header bar. */
export function ClassHeaderActions(props: ClassRef) {
  const user = useCurrentUser();
  const key = `${props.course}|${props.name}`;
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Pressable className="active:opacity-70">
            <HeaderButton icon={Target} label="Goal" active={user?.goals?.[key] !== undefined} />
          </Pressable>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-80">
          <GoalBody {...props} />
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Pressable className="active:opacity-70">
            <HeaderButton icon={NotebookPen} label="Notes" active={!!user?.classNotes?.[key]} />
          </Pressable>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-80">
          <NotesBody course={props.course} name={props.name} />
        </PopoverContent>
      </Popover>
    </>
  );
}
