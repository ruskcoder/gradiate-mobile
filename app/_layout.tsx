import '@/global.css';
import { applyColorTheme } from '@/lib/apply-color-theme';
import { AppSettingsProvider } from '@/lib/app-settings';
import { DEFAULT_COLOR_THEME_ID, getColorThemeById } from '@/lib/color-themes';
import { setGradesNotificationsEnabled } from '@/lib/grades-notifications-task';
import { subscribeForPush } from '@/lib/push-subscribe';
import { useCurrentUser, useStore } from '@/lib/store';
import { NAV_THEME } from '@/lib/theme';
import { useColorScheme } from '@/lib/useColorScheme';
import { ThemeProvider } from 'expo-router/react-navigation';
import { PortalHost } from '@rn-primitives/portal';
import * as SystemUI from 'expo-system-ui';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { useUniwind } from 'uniwind';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppSettingsProvider>
          <AppContent />
        </AppSettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const { theme } = useUniwind();
  const currentTheme = NAV_THEME[theme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { setColorScheme } = useColorScheme();
  const pathname = usePathname();
  const router = useRouter();
  // The login screen wants a true edge-to-edge background (its wallpaper
  // extends behind the status bar). Reserving top padding here — necessary
  // for every other screen — would paint an opaque band over that area
  // first, and react-native-screens clips each screen to its own bounds so
  // login's own negative-offset trick can't escape it. Skip the padding for
  // just that route instead.
  const isFullBleed = pathname === '/login';

  const user = useCurrentUser();
  const notificationsEnabled = !!user && user.notificationsEnabled !== false;
  const notificationAccountKey = user
    ? `${user.platform}|${user.username}|${user.link}`
    : '';

  // Apply the current account's color theme (or "default" when logged out /
  // unset). This has to run even for the default theme — global.css's raw
  // `oklch(...)` custom properties are only ever resolved to real colors for
  // React Native by `applyColorTheme`'s hex conversion; left untouched, native
  // views (e.g. Select's border/background) can fail to pick up those CSS vars
  // at all. Re-runs when the account (or its choice) changes, so a fresh login
  // immediately paints that user's theme.
  React.useEffect(() => {
    const colorTheme = getColorThemeById(user?.colorTheme ?? DEFAULT_COLOR_THEME_ID);
    if (colorTheme) {
      applyColorTheme(colorTheme.json);
    }
  }, [user?.colorTheme]);

  // Restore the current account's light/dark/system mode.
  React.useEffect(() => {
    setColorScheme(user?.theme ?? 'light');
  }, [user?.theme, setColorScheme]);

  // Keep the hourly background grades-check task in sync with the current
  // account's notification setting (also re-registers it on cold start so it
  // survives app restarts, since the OS can clear task registrations).
  React.useEffect(() => {
    setGradesNotificationsEnabled(notificationsEnabled);
    // Register this device's Expo push token with the API so the server's
    // periodic trigger can wake us to fetch. Primary path; the background task
    // above is the fallback. Safe to call on every load (API upserts).
    subscribeForPush();
  }, [
    notificationAccountKey,
    notificationsEnabled,
  ]);

  // A background API call found the current session/password invalid (see
  // `handleAuthError` in lib/grades-api.ts). Bounce to /login from wherever
  // the user currently is — login.tsx itself reads the store's reauth fields
  // to jump straight to the locked-username credentials page.
  const reauthUsername = useStore((s) => s.reauthUsername);
  React.useEffect(() => {
    if (reauthUsername && pathname !== '/login') {
      router.replace('/login');
    }
  }, [reauthUsername, pathname, router]);

  // Keep the native root window background in sync with the theme so there's
  // no white/black flash behind the status bar or during screen transitions.
  React.useEffect(() => {
    SystemUI.setBackgroundColorAsync(currentTheme.colors.background);
  }, [currentTheme.colors.background]);

  return (
    <ThemeProvider value={currentTheme}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <View
        style={{
          paddingTop: isFullBleed ? 0 : insets.top,
          backgroundColor: currentTheme.colors.background,
        }}
        className="flex-1"
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: currentTheme.colors.background },
            // react-native-screens freezes/detaches inactive screens to save
            // memory. The screen revealed by a back-navigation had been
            // frozen, so it needs a frame to re-attach/repaint — that gap is
            // the black flash on pop (forward pushes never hit this because
            // the new screen mounts fresh with contentStyle already applied).
            freezeOnBlur: false,
          }}
        />
      </View>
      <PortalHost />
    </ThemeProvider>
  );
}
