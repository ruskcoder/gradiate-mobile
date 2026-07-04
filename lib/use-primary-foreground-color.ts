import { DEFAULT_COLOR_THEME_ID, getColorThemeById } from '@/lib/color-themes';
import { toHex } from '@/lib/resolve-theme-color';
import { useCurrentUser } from '@/lib/store';
import { useUniwind } from 'uniwind';

/** Resolves the app's current primary-foreground color (text color on primary background)
 *  as a hex string, for spots that need to match the button text color. */
export function usePrimaryForegroundColor(): string {
  const { theme: mode } = useUniwind();
  const user = useCurrentUser();
  const colorTheme = getColorThemeById(user?.colorTheme ?? DEFAULT_COLOR_THEME_ID);
  const vars = mode === 'dark' ? colorTheme?.json.cssVars.dark : colorTheme?.json.cssVars.light;
  return vars?.['primary-foreground'] ? toHex(vars['primary-foreground']) : '#fafafa';
}
