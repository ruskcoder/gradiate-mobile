import AsyncStorage from '@react-native-async-storage/async-storage';

function key(term: string) {
  return `gradexis.courseOrder.${term}`;
}

export async function getCourseOrder(term: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key(term));
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

export async function setCourseOrder(term: string, order: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key(term), JSON.stringify(order));
  } catch {
    // ignore persistence failures
  }
}

/** Sorts `courses` (each with an `id`-ish key) by a previously-saved order, appending any new/unseen items at the end. */
export function applyCourseOrder<T>(items: T[], order: string[] | null, getId: (item: T) => string): T[] {
  if (!order || order.length === 0) return items;
  const byId = new Map(items.map((item) => [getId(item), item]));
  const ordered: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  }
  return [...ordered, ...byId.values()];
}
