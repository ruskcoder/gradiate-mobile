import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ListItem, ListItemsList } from '@/components/custom/list-item';
import { ScreenHeader } from '@/components/custom/screen-header';
import { useStore } from '@/lib/store';
import { Plus, School } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function BellScheduleListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const currentUserIndex = useStore((s) => s.currentUserIndex);
  const users = useStore((s) => s.users);
  const currentUser = users[currentUserIndex];
  const bellSchedules = currentUser?.bellSchedules || [];

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Bell Schedule"
        right={
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onPress={() =>
              router.push({ pathname: '/academics/bell-schedule/edit/[index]', params: { index: 'new' } })
            }>
            <Icon as={Plus} className="size-4" />
          </Button>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 24 }}
        className="flex-1">
        <ListItemsList>
          {bellSchedules.map((sched, idx) => (
            <ListItem
              key={idx}
              squareColor="var(--primary)"
              squareText={<Icon as={School} className="size-5" color="white" />}
              title={sched.name}
              desc={`${sched.periods.length} periods`}
              onPress={() =>
                router.push({
                  pathname: '/academics/bell-schedule/[index]',
                  params: { index: String(idx) },
                })
              }
            />
          ))}
          {bellSchedules.length === 0 && (
            <Text className="py-2 text-muted-foreground">No bell schedules yet.</Text>
          )}
        </ListItemsList>
      </ScrollView>
    </View>
  );
}
