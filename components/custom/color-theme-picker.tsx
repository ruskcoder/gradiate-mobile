import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { applyColorTheme } from '@/lib/apply-color-theme';
import { COLOR_THEMES, DEFAULT_COLOR_THEME_ID, getColorThemeById } from '@/lib/color-themes';
import { toHex } from '@/lib/resolve-theme-color';
import { useCurrentUser, useStore } from '@/lib/store';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';

function ThemeSwatchDots({ id }: { id: string }) {
  const { theme: mode } = useUniwind();
  const theme = getColorThemeById(id);
  if (!theme) return null;
  const vars = mode === 'dark' ? theme.json.cssVars.dark : theme.json.cssVars.light;

  return (
    <View className="flex-row" style={{ borderRadius: 999, overflow: 'hidden' }}>
      <View className="h-4 w-4" style={{ backgroundColor: toHex(vars.primary) }} />
      <View className="h-4 w-4" style={{ backgroundColor: toHex(vars.secondary) }} />
      <View className="h-4 w-4" style={{ backgroundColor: toHex(vars.accent) }} />
    </View>
  );
}

export function ColorThemePicker() {
  const user = useCurrentUser();
  const changeUserData = useStore((s) => s.changeUserData);
  const selectedId = user?.colorTheme ?? DEFAULT_COLOR_THEME_ID;

  function handleSelect(id: string) {
    const theme = getColorThemeById(id);
    if (!theme) return;
    // Mirrors web: persist the choice on the user, then apply it live.
    changeUserData('colorTheme', id);
    applyColorTheme(theme.json);
  }

  const selectedTheme = getColorThemeById(selectedId);

  return (
    <Select
      value={selectedTheme ? { value: selectedTheme.id, label: selectedTheme.name } : undefined}
      onValueChange={(option) => option && handleSelect(option.value)}>
      <SelectTrigger className="w-full">
        <View className="flex-1 flex-row items-center gap-2">
          {selectedTheme && <ThemeSwatchDots id={selectedTheme.id} />}
          <SelectValue placeholder="Select a theme" className="text-sm text-foreground" />
        </View>
      </SelectTrigger>
      <SelectContent className="w-72">
        {COLOR_THEMES.map((theme) => (
          <SelectItem key={theme.id} value={theme.id} label={theme.name}>
            <ThemeSwatchDots id={theme.id} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
