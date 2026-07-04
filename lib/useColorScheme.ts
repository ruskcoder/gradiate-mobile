import { useColorScheme as useRNColorScheme } from 'react-native';
import { useCallback } from 'react';
import { Appearance } from 'react-native';

export function useColorScheme() {
  const colorScheme = useRNColorScheme();
  const isDarkColorScheme = colorScheme === 'dark';

  const setColorScheme = useCallback((scheme: 'light' | 'dark' | 'system') => {
    Appearance.setColorScheme(scheme === 'system' ? null : scheme);
  }, []);

  return { colorScheme, isDarkColorScheme, setColorScheme };
}
