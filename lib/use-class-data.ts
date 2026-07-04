import * as React from 'react';
import { getSingleClass } from '@/lib/grades-api';
import { getLatestGradesLoad } from '@/lib/grades-store';
import { transformGroupsToCategories } from '@/lib/utils';

export interface ClassData {
  course: string;
  name: string;
  average: string | number;
  categories?: Record<string, any>;
  scores?: any[];
}

/**
 * Loads a single class's full detail (categories + scores), preferring the
 * already-fetched snapshot from the last `getClasses` call over the network
 * — falling back to `getSingleClass` only when that snapshot doesn't have
 * categories yet (e.g. deep-linked straight into a detail screen).
 */
export function useClassData(id?: string, name?: string, average?: string, term?: string) {
  const [classData, setClassData] = React.useState<ClassData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id || !term) return;

    const stored = getLatestGradesLoad(term)?.classes.find((c: any) => c.course === id);
    if (stored?.categories) {
      setClassData({
        course: id,
        name: stored.name ?? name ?? '',
        average: stored.average ?? average ?? 0,
        categories: stored.categories,
        scores: stored.scores ?? [],
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await getSingleClass(term, id);
        if (cancelled) return;
        if (result.success && result.class) {
          const transformed = transformGroupsToCategories(result.class);
          setClassData({
            course: id,
            name: transformed.name ?? name ?? '',
            average: transformed.average ?? average ?? 0,
            categories: transformed.categories ?? {},
            scores: transformed.scores ?? [],
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load class details');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, name, average, term]);

  return { classData, loading, error };
}
