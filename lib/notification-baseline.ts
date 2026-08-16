import AsyncStorage from '@react-native-async-storage/async-storage';
import { currentUser } from '@/lib/store';

/**
 * The last averages we've seen, persisted so a grade change can still be
 * detected after the app process dies.
 *
 * The notification check used to diff against `gradesStore.history`, which the
 * store's `partialize` deliberately does not persist — it holds every
 * assignment of every load and grows without bound. So when Android woke the app
 * headlessly for a push, `history` was empty, every previous average read as
 * blank, and the diff skipped every class: a grade change could only ever
 * notify while the app happened to already be running.
 *
 * This keeps just `term -> "course|name" -> average`, which is a few hundred
 * bytes and safe to write on every fetch.
 */
export type Baseline = Record<string, Record<string, string>>;

const KEY_PREFIX = 'grade-notify-baseline:';

/** Scoped per account so a second student's grades can't look like a change. */
function storageKey(): string {
  const u = currentUser();
  if (!u) return `${KEY_PREFIX}anon`;
  return `${KEY_PREFIX}${u.platform}|${u.link}|${u.username}|${u.studentId || ''}`;
}

export async function loadBaseline(): Promise<Baseline> {
  try {
    const raw = await AsyncStorage.getItem(storageKey());
    return raw ? (JSON.parse(raw) as Baseline) : {};
  } catch {
    return {};
  }
}

/**
 * Fold a freshly-fetched classes payload into the stored baseline.
 *
 * Merged rather than replaced: a term-scoped fetch only carries that one term,
 * and must not erase what we know about the others.
 */
export async function mergeBaseline(chunk: any): Promise<void> {
  const fresh = baselineFromClasses(chunk);
  if (Object.keys(fresh).length === 0) return;
  try {
    const current = await loadBaseline();
    for (const [term, row] of Object.entries(fresh)) {
      current[term] = { ...(current[term] || {}), ...row };
    }
    await AsyncStorage.setItem(storageKey(), JSON.stringify(current));
  } catch {
    // A baseline we couldn't save just means the next check re-baselines; never
    // worth failing the fetch the user actually asked for.
  }
}

/**
 * Reduce a classes payload to `term -> courseKey -> average`, using the same
 * term resolution as the notification check: all-in-one portals carry a per-term
 * `averages` map, single-term ones a flat `average` for `chunk.term`.
 */
export function baselineFromClasses(chunk: any): Baseline {
  const terms: string[] =
    Array.isArray(chunk?.currentTerms) && chunk.currentTerms.length
      ? chunk.currentTerms
      : chunk?.term
        ? [chunk.term]
        : [];
  if (terms.length === 0 || !Array.isArray(chunk?.classes)) return {};

  const out: Baseline = {};
  for (const term of terms) {
    const row: Record<string, string> = {};
    for (const course of chunk.classes) {
      const value =
        course?.averages && typeof course.averages === 'object'
          ? course.averages[term]
          : term === chunk.term
            ? course?.average
            : undefined;
      if (value === undefined || value === null || value === '') continue;
      row[`${course.course}|${course.name}`] = String(value);
    }
    if (Object.keys(row).length > 0) out[term] = row;
  }
  return out;
}
