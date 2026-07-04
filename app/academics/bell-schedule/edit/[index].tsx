import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { TimePicker } from '@/components/ui/time-picker';
import { ScreenHeader } from '@/components/custom/screen-header';
import { useStore } from '@/lib/store';
import { ChevronRight, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

interface Period {
  name: string;
  startTime: string;
  endTime: string;
}

export default function BellScheduleEditScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { index } = useLocalSearchParams<{ index: string }>();
  const isNew = index === 'new';
  const idx = isNew ? null : Number(index);
  const currentUserIndex = useStore((s) => s.currentUserIndex);
  const users = useStore((s) => s.users);
  const changeUserData = useStore((s) => s.changeUserData);
  const currentUser = users[currentUserIndex];
  const bellSchedules = currentUser?.bellSchedules || [];
  const existing = idx !== null ? bellSchedules[idx] : null;

  const [editName, setEditName] = React.useState(existing?.name ?? '');
  const [editPeriods, setEditPeriods] = React.useState<Period[]>(
    existing?.periods.map((p) => ({ ...p, name: p.name || '' })) ?? [
      { name: '', startTime: '', endTime: '' },
    ]
  );
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const setBellSchedules = (schedules: typeof bellSchedules) => {
    changeUserData('bellSchedules', schedules);
  };

  const backToList = () => {
    router.dismissTo('/academics/bell-schedule');
  };

  const saveEdit = () => {
    const periodsWithNames = editPeriods.map((p, i) => ({
      ...p,
      name: p.name.trim() || `Period ${i + 1}`,
    }));
    if (idx !== null) {
      const next = [...bellSchedules];
      next[idx] = { ...bellSchedules[idx], periods: periodsWithNames };
      setBellSchedules(next);
    } else {
      const scheduleName = editName.trim() || 'Untitled Schedule';
      setBellSchedules([...bellSchedules, { name: scheduleName, periods: periodsWithNames }]);
    }
    backToList();
  };

  const confirmDelete = () => {
    if (idx === null) return;
    setBellSchedules(bellSchedules.filter((_, i) => i !== idx));
    setConfirmingDelete(false);
    backToList();
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title={isNew ? 'New Schedule' : 'Edit Schedule'} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
        className="flex-1">
        <View className="flex-row items-center gap-2">
          <Input
            value={editName}
            onChangeText={setEditName}
            placeholder="Schedule name..."
            className="flex-1"
          />
          {idx !== null && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onPress={() => setConfirmingDelete(true)}>
              <Icon as={Trash2} className="size-4 text-destructive" />
            </Button>
          )}
        </View>

        <View className="gap-2">
          {editPeriods.map((period, i) => (
            <View key={i} className="gap-1.5 rounded-md border border-border p-2">
              <View className="flex-row items-center gap-2">
                <Input
                  placeholder={`Period ${i + 1}`}
                  value={period.name}
                  onChangeText={(v) => {
                    const next = [...editPeriods];
                    next[i] = { ...next[i], name: v };
                    setEditPeriods(next);
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onPress={() => setEditPeriods(editPeriods.filter((_, i2) => i2 !== i))}>
                  <Icon as={Trash2} className="size-4 text-destructive" />
                </Button>
              </View>
              <View className="flex-row items-center gap-2">
                <TimePicker
                  placeholder="Start time"
                  value={period.startTime}
                  onChange={(v) => {
                    const next = [...editPeriods];
                    next[i] = { ...next[i], startTime: v };
                    setEditPeriods(next);
                  }}
                  className="flex-1"
                />
                <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
                <TimePicker
                  placeholder="End time"
                  value={period.endTime}
                  onChange={(v) => {
                    const next = [...editPeriods];
                    next[i] = { ...next[i], endTime: v };
                    setEditPeriods(next);
                  }}
                  className="flex-1"
                />
              </View>
            </View>
          ))}
        </View>

        <Button
          variant="outline"
          onPress={() => setEditPeriods([...editPeriods, { name: '', startTime: '', endTime: '' }])}>
          <Text>Add Period</Text>
        </Button>
        <Button onPress={saveEdit}>
          <Text>Save</Text>
        </Button>
      </ScrollView>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{existing?.name ?? ''}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={confirmDelete}>
              <Text>Continue</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
