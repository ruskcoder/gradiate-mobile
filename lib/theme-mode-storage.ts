import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'gradexis.themeMode';

export async function getStoredThemeMode(): Promise<ThemeMode | null> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : null;
  } catch {
    return null;
  }
}

export async function setStoredThemeMode(mode: ThemeMode): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore persistence failures
  }
}
