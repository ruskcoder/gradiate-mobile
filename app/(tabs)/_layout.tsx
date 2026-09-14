import { TabBar } from '@/components/custom/tab-bar';
import { accountKey, useCurrentUser } from '@/lib/store';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  const user = useCurrentUser();

  return (
    <Tabs
      // Tab screens load their data on mount; remount them all when the active
      // account changes so none keeps showing the previous account's grades.
      key={user ? accountKey(user) : 'signed-out'}
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'shift',
      }}>
      <Tabs.Screen name="grades" options={{ title: 'Grades' }} />
      <Tabs.Screen name="academics" options={{ title: 'Academics' }} />
      <Tabs.Screen name="tools" options={{ title: 'Tools' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
