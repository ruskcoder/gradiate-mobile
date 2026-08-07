import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'gradiate.colorThemeId';

export async function getStoredColorThemeId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setStoredColorThemeId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore persistence failures
  }
}
