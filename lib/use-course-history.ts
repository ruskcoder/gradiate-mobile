import * as React from 'react';
import { useCurrentUser } from '@/lib/store';

export interface CourseHistoryEntry {
  loadedAt: number;
  average: string | number;
  categories?: Record<string, any>;
  scores?: any[];
}

/** Reads a course's snapshot history from the current user's `gradesStore`. */
export function useCourseHistory(id?: string, name?: string, term?: string) {
  const currentUser = useCurrentUser();
  const [history, setHistory] = React.useState<CourseHistoryEntry[]>([]);

  React.useEffect(() => {
    if (!id || !term || !currentUser) return;

    const gradesStore = currentUser.gradesStore || {};
    const termHistory = gradesStore.history?.[term] || {};
    const courseKey = `${id}|${name}`;
    const courseHistory = termHistory[courseKey] || [];

    setHistory(courseHistory);
  }, [id, name, term, currentUser]);

  return history;
}
