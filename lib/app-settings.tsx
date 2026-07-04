import { useCurrentUser, useStore } from '@/lib/store';
import { setGradesNotificationsEnabled } from '@/lib/grades-notifications-task';
import * as React from 'react';

export type GradesView = 'list' | 'card';
export type NumberDisplay = 'decimal' | 'rounded' | 'letter' | 'letter+';

interface AppSettingsContextValue {
  tabBarIndicatorEnabled: boolean;
  setTabBarIndicatorEnabled: (value: boolean) => void;
  /** Grades screen layout — matches the web app's List/Cards toggle. */
  gradesView: GradesView;
  setGradesView: (value: GradesView) => void;
  /** Render every grade chip with the theme's primary color instead of the
   *  red/yellow/blue/green scale. */
  hideColors: boolean;
  setHideColors: (value: boolean) => void;
  /** Show or hide the large page titles across the app. */
  showPageTitles: boolean;
  setShowPageTitles: (value: boolean) => void;
  /** Play the staggered fade-up reveal (and other entrance animations) when
   *  grades lists/cards render. */
  animationsEnabled: boolean;
  setAnimationsEnabled: (value: boolean) => void;
  /** Hourly background check for grade changes on the current term, with a
   *  notification per class whose grade changed. */
  notificationsEnabled: boolean;
  setNotificationsEnabled: (value: boolean) => void;
  /** How to display numeric grades: decimal, rounded, letter, or letter+ */
  numberDisplay: NumberDisplay;
  setNumberDisplay: (value: NumberDisplay) => void;
}

/**
 * All of these settings live on the current `User` object (persisted through
 * the same `user-store` zustand persist as the web app), so they're saved and
 * restored per account — identical to how the web app stores them via
 * `changeUserData`. When logged out there's no user, so reads fall back to the
 * same defaults as `DEFAULT_USER`.
 */
export function useAppSettings(): AppSettingsContextValue {
  const user = useCurrentUser();
  const changeUserData = useStore((s) => s.changeUserData);

  return {
    tabBarIndicatorEnabled: user?.tabBarIndicatorEnabled ?? true,
    setTabBarIndicatorEnabled: (value) => changeUserData('tabBarIndicatorEnabled', value),
    gradesView: user?.gradesView ?? 'list',
    setGradesView: (value) => changeUserData('gradesView', value),
    hideColors: user?.hideColors ?? false,
    setHideColors: (value) => changeUserData('hideColors', value),
    showPageTitles: user?.showPageTitles ?? true,
    setShowPageTitles: (value) => changeUserData('showPageTitles', value),
    animationsEnabled: user?.animationsEnabled ?? true,
    setAnimationsEnabled: (value) => changeUserData('animationsEnabled', value),
    notificationsEnabled: user?.notificationsEnabled ?? true,
    setNotificationsEnabled: (value) => {
      changeUserData('notificationsEnabled', value);
      setGradesNotificationsEnabled(value);
    },
    numberDisplay: (user?.numberDisplay ?? 'decimal') as NumberDisplay,
    setNumberDisplay: (value) => changeUserData('numberDisplay', value),
  };
}

/**
 * Retained only so existing `<AppSettingsProvider>` mounts keep working — the
 * settings are now sourced directly from the zustand store, so no context is
 * needed.
 */
export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
