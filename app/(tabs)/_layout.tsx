import { TabBar } from '@/components/custom/tab-bar';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
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
