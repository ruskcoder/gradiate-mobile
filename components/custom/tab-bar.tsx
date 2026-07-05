import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppSettings } from '@/lib/app-settings';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import type { LucideIcon } from 'lucide-react-native';
import { Calculator, GraduationCap, LibraryBig, Settings as SettingsIcon } from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

const TAB_ICONS: Record<string, LucideIcon> = {
  grades: GraduationCap,
  academics: LibraryBig,
  tools: Calculator,
  settings: SettingsIcon,
};

const TAB_LABELS: Record<string, string> = {
  grades: 'Grades',
  academics: 'Academics',
  tools: 'Tools',
  settings: 'Settings',
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { tabBarIndicatorEnabled } = useAppSettings();
  const toolMode = useStore((s) => s.toolMode);
  const { theme } = useUniwind();
  const { width: windowWidth } = useWindowDimensions();
  const [barWidth, setBarWidth] = React.useState(windowWidth - 24);

  // The bar has a 1px border and react-native measures layout as border-box,
  // so the flex tabs actually lay out inside a content area that's 2px
  // narrower than the measured width. Using the raw width here makes the
  // indicator's per-tab step slightly too wide, drifting ~0.5px/tab to the
  // right and leaving the last tab visibly off-center — subtract the border.
  const borderWidth = 1;
  const tabWidth = (barWidth - borderWidth * 2) / state.routes.length;
  const indicatorInset = 4;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: withTiming(state.index * tabWidth + indicatorInset, { duration: 220 }) },
    ],
  }));

  // While the Grades tab is showing a Tools mode (What If / Impacts / etc.),
  // or the Tools tab was reached directly from a course page (courseId
  // param — see tools.tsx's `fromCourse`), the tab bar is hidden outright —
  // no slide/fade transition. This must come after every hook above so hook
  // order stays identical across renders.
  const focusedRoute = state.routes[state.index];
  const toolsFromCourse = focusedRoute.name === 'tools' && !!(focusedRoute.params as any)?.courseId;
  if (toolMode || toolsFromCourse) return null;

  return (
    <View
      style={{
        paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
        paddingLeft: insets.left + 12,
        paddingRight: insets.right + 12,
      }}
      className="absolute inset-x-0 bottom-0"
      pointerEvents="box-none">
      <View
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        className="flex-row overflow-hidden rounded-2xl border border-border shadow-lg shadow-black/10">
        {Platform.OS === 'ios' ? (
          // iOS blur is a cheap native effect — safe to run over scrolling content.
          <BlurView
            intensity={80}
            tint={theme === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          // Android's real blur (`experimentalBlurMethod="dimezisBlurView"`)
          // re-captures and blurs everything behind it every frame, which pegged
          // the UI thread and made scrolling stutter for seconds. A near-opaque
          // themed surface reads as an intentional frosted bar and costs nothing.
          <View style={StyleSheet.absoluteFill} className="bg-card" />
        )}
        {tabBarIndicatorEnabled && (
          <Animated.View
            style={[{ width: tabWidth - indicatorInset * 2 }, indicatorStyle]}
            className="absolute inset-y-1 rounded-lg left-0 overflow-hidden"
            pointerEvents="none">
            <BlurView
              intensity={90}
              tint={theme === 'dark' ? 'dark' : 'light'}
              style={{ flex: 1 }}
            />
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)' }]}
            />
          </Animated.View>
        )}
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const IconComponent = TAB_ICONS[route.name] ?? GraduationCap;
          const label = TAB_LABELS[route.name] ?? route.name;

          function onPress() {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              className="flex-1 items-center justify-center gap-1 py-2.5 active:opacity-70">
              <Icon
                as={IconComponent}
                className={cn('size-5', isFocused ? 'text-primary' : 'text-muted-foreground')}
              />
              <Text
                className={cn(
                  'text-[11px] font-medium',
                  isFocused ? 'text-primary' : 'text-muted-foreground'
                )}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
