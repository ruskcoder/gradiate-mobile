import { DEFAULT_COLOR_THEME_ID, getColorThemeById } from '@/lib/color-themes';
import { toHex } from '@/lib/resolve-theme-color';
import { useCurrentUser } from '@/lib/store';
import { useUniwind } from 'uniwind';

/** Resolves the app's current primary color as a hex string, for the rare
 *  spots (e.g. SVG strokes) that can't be styled with a `text-primary`/
 *  `bg-primary` className directly. Sourced from the current account's
 *  `colorTheme` so it tracks the picker live. */
export function usePrimaryColor(): string {
  const { theme: mode } = useUniwind();
  const user = useCurrentUser();
  const colorTheme = getColorThemeById(user?.colorTheme ?? DEFAULT_COLOR_THEME_ID);
  const vars = mode === 'dark' ? colorTheme?.json.cssVars.dark : colorTheme?.json.cssVars.light;
  return vars?.primary ? toHex(vars.primary) : '#2563eb';
}
