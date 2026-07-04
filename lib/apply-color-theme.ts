import { Uniwind } from 'uniwind';
import type { ColorThemeVars } from '@/lib/color-themes';

// Keys present in global.css as `--color-*` custom properties. Anything else
// in the theme JSON (fonts, shadows, tracking, spacing) isn't wired up to a
// Tailwind var in this app, so it's intentionally skipped.
const COLOR_KEYS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
];

function mapVars(vars: ColorThemeVars): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const key of COLOR_KEYS) {
    const value = vars[key];
    if (value) {
      mapped[`--color-${key}`] = value;
    }
  }
  return mapped;
}

// Uniwind compiles `calc(var(--radius) - 4px)` (used by rounded-sm/md/xl in
// global.css) into a runtime expression that does plain arithmetic on the
// `--radius` variable, e.g. `vars["--radius"]?.(vars) + -4`. That only works
// if `--radius` resolves to a bare number — the same way Uniwind strips "px"
// off length values at build time. Passing a "10px"-style string here makes
// the arithmetic produce NaN, which RN silently drops, breaking every
// rounded-* class app-wide. The theme JSON expresses radius in rem (e.g.
// "0.625rem"), so it must be converted to a unitless px number.
function remToPx(value: string): number {
  const match = /^([\d.]+)rem$/.exec(value.trim());
  if (match) return parseFloat(match[1]) * 16;
  const pxMatch = /^([\d.]+)px$/.exec(value.trim());
  if (pxMatch) return parseFloat(pxMatch[1]);
  return parseFloat(value);
}

export function applyColorTheme(json: {
  cssVars: { theme?: Record<string, string>; light: ColorThemeVars; dark: ColorThemeVars };
}) {
  Uniwind.updateCSSVariables('light', mapVars(json.cssVars.light));
  Uniwind.updateCSSVariables('dark', mapVars(json.cssVars.dark));

  const radius = json.cssVars.theme?.radius ?? json.cssVars.light.radius;
  if (radius) {
    const radiusPx = remToPx(radius);
    Uniwind.updateCSSVariables('light', { '--radius': radiusPx });
    Uniwind.updateCSSVariables('dark', { '--radius': radiusPx });
  }
}
