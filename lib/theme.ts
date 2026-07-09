import { DarkTheme, DefaultTheme, type Theme } from 'expo-router/react-navigation';

// Mirrors gradexis-web/src/theme.css (:root / .dark) so navigation chrome
// (status bar / stack background, etc.) matches the app's actual default
// look. Values are hex since React Navigation's Theme colors are consumed
// directly (not through Uniwind/Tailwind), so oklch() strings would be
// silently dropped on native.
export const THEME = {
  light: {
    background: '#ffffff',
    foreground: '#0a0a0a',
    card: '#ffffff',
    cardForeground: '#0a0a0a',
    popover: '#ffffff',
    popoverForeground: '#0a0a0a',
    primary: '#003078',
    primaryForeground: '#fafafa',
    secondary: '#f5f5f5',
    secondaryForeground: '#171717',
    muted: '#f5f5f5',
    mutedForeground: '#737373',
    accent: '#f5f5f5',
    accentForeground: '#171717',
    destructive: '#e7000b',
    border: '#e5e5e5',
    input: '#e5e5e5',
    ring: '#a1a1a1',
    radius: '0.625rem',
    chart1: '#91c5ff',
    chart2: '#3a81f6',
    chart3: '#2563ef',
    chart4: '#1a4eda',
    chart5: '#1f3fad',
  },
  dark: {
    background: '#0a0a0a',
    foreground: '#fafafa',
    card: '#171717',
    cardForeground: '#fafafa',
    popover: '#262626',
    popoverForeground: '#fafafa',
    primary: '#93ceff',
    primaryForeground: '#171717',
    secondary: '#262626',
    secondaryForeground: '#fafafa',
    muted: '#262626',
    mutedForeground: '#a1a1a1',
    accent: '#404040',
    accentForeground: '#fafafa',
    destructive: '#ff6467',
    border: '#282828',
    input: '#343434',
    ring: '#737373',
    radius: '0.625rem',
    chart1: '#91c5ff',
    chart2: '#3a81f6',
    chart3: '#2563ef',
    chart4: '#1a4eda',
    chart5: '#1f3fad',
  },
};

export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};
