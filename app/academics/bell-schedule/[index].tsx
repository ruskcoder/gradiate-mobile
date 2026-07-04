import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '@/components/custom/screen-header';
import { useStore } from '@/lib/store';
import { Pen } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function BellScheduleViewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { index } = useLocalSearchParams<{ index: string }>();
  const idx = Number(index);
  const currentUserIndex = useStore((s) => s.currentUserIndex);
  const users = useStore((s) => s.users);
  const currentUser = users[currentUserIndex];
  const schedule = currentUser?.bellSchedules?.[idx];

  if (!schedule) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Bell Schedule" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={schedule.name}
        right={
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onPress={() =>
              router.push({
                pathname: '/academics/bell-schedule/edit/[index]',
                params: { index: String(idx) },
              })
            }>
            <Icon as={Pen} className="size-4" />
          </Button>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 8 }}
        className="flex-1">
        <View className="gap-2">
          {schedule.periods.map((period, idx) => (
            <View key={idx} className="rounded-md border border-border bg-muted/50 p-3">
              <Text className="font-medium">{period.name}</Text>
              <Text className="text-sm text-muted-foreground">
                {period.startTime} - {period.endTime}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
