import { useStore, type GradesTermMeta } from './store';

export interface GradesLoad {
  loadedAt: number;
  classes: any[];
}

export interface GradesStore {
  initialTerm: string;
  termList: string[];
  termTree: any[];
  currentTerms: string[];
  hasSubterms: boolean;
  history: Record<
    string,
    Record<string, Array<{ loadedAt: number; average: any; categories: any; scores: any[] }>>
  >;
}

export function initializeGradesStore(
  initialTerm: string,
  termList: string[],
  term: string,
  classes: any[],
  meta?: GradesTermMeta
): void {
  useStore.getState().addGradesStore(initialTerm, termList, term, classes, meta);
}

export function addGradesLoad(term: string, classes: any[]): void {
  useStore.getState().addGradesStoreLoad(term, classes);
}

export function reconstructClassesFromHistory(term: string): any[] {
  const gradesStore = useStore.getState().getGradesStore();
  const termHistory: any = gradesStore.history[term];

  if (!termHistory) {
    return [];
  }

  const classes: any[] = [];

  for (const courseKey in termHistory) {
    const courseHistory = termHistory[courseKey];
    if (courseHistory.length === 0) continue;

    const latestEntry = courseHistory[courseHistory.length - 1];
    const [course, name] = courseKey.split('|');

    classes.push({
      course,
      name,
      average: latestEntry.average,
      categories: latestEntry.categories,
      scores: latestEntry.scores,
    });
  }

  return classes;
}

export function getLatestGradesLoad(term: string): GradesLoad | null {
  const gradesStore = useStore.getState().getGradesStore();
  const termHistory: any = gradesStore.history[term];

  if (!termHistory) {
    return null;
  }

  let latestLoadedAt = 0;
  for (const courseKey in termHistory) {
    const courseHistory = termHistory[courseKey];
    if (courseHistory.length > 0) {
      const latestEntry = courseHistory[courseHistory.length - 1];
      if (latestEntry.loadedAt > latestLoadedAt) {
        latestLoadedAt = latestEntry.loadedAt;
      }
    }
  }

  if (latestLoadedAt === 0) {
    return null;
  }

  const classes = reconstructClassesFromHistory(term);

  return {
    loadedAt: latestLoadedAt,
    classes,
  };
}

export function getGradesLoadHistory(term: string): GradesLoad[] {
  const gradesStore = useStore.getState().getGradesStore();
  const termHistory: any = gradesStore.history[term];

  if (!termHistory) {
    return [];
  }

  const loads: GradesLoad[] = [];
  const allLoadTimestamps = new Set<number>();

  for (const courseKey in termHistory) {
    const courseHistory = termHistory[courseKey];
    for (const entry of courseHistory) {
      allLoadTimestamps.add(entry.loadedAt);
    }
  }

  const sortedTimestamps = Array.from(allLoadTimestamps).sort((a, b) => a - b);

  for (const timestamp of sortedTimestamps) {
    const classesAtTime: any[] = [];
    for (const courseKey in termHistory) {
      const courseHistory = termHistory[courseKey];
      const entryAtTime = courseHistory.find((e: any) => e.loadedAt === timestamp);
      if (entryAtTime) {
        const [course, name] = courseKey.split('|');
        classesAtTime.push({
          course,
          name,
          average: entryAtTime.average,
          categories: entryAtTime.categories,
          scores: entryAtTime.scores,
        });
      }
    }
    loads.push({
      loadedAt: timestamp,
      classes: classesAtTime,
    });
  }

  return loads;
}

export function hasStorageData(term: string): boolean {
  const gradesStore = useStore.getState().getGradesStore();
  const termHistory: any = gradesStore.history[term];
  return !!(termHistory && Object.keys(termHistory).length > 0);
}

export function getInitialTerm(): string {
  const gradesStore = useStore.getState().getGradesStore();
  return gradesStore.initialTerm;
}

export function getTermList(): string[] {
  const gradesStore = useStore.getState().getGradesStore();
  return gradesStore.termList;
}

export function getTermTree(): any[] {
  return (useStore.getState().getGradesStore() as any).termTree || [];
}

export function getCurrentTerms(): string[] {
  return (useStore.getState().getGradesStore() as any).currentTerms || [];
}

export function getHasSubterms(): boolean {
  return !!(useStore.getState().getGradesStore() as any).hasSubterms;
}

/**
 * Rebuild all-in-one (Skyward/PowerSchool) classes from the full per-term
 * history: one class per course carrying an `averages` dict keyed by every term
 * that has a stored snapshot, so the cascading subtabs resolve a grade for each
 * level offline exactly like a live payload. The finest term's stored scores /
 * categories (if any) ride along so a selected class can still show detail.
 */
export function reconstructAllInOneClassesFromHistory(): any[] {
  const { history } = getGradesStore();
  const byCourse: Record<string, any> = {};

  for (const term in history) {
    const termHistory = history[term];
    for (const courseKey in termHistory) {
      const entries = termHistory[courseKey];
      if (!entries || entries.length === 0) continue;
      const latest = entries[entries.length - 1];
      if (!latest) continue;
      const [course, name] = courseKey.split('|');
      const c = byCourse[courseKey] || { course, name, averages: {} };
      if (latest.average !== undefined && latest.average !== null && latest.average !== '') {
        c.averages[term] = latest.average;
      }
      if (
        (latest.scores && latest.scores.length) ||
        (latest.categories && Object.keys(latest.categories).length)
      ) {
        if (!c._detailAt || latest.loadedAt >= c._detailAt) {
          c._detailAt = latest.loadedAt;
          c.scores = latest.scores;
          c.categories = latest.categories;
        }
      }
      byCourse[courseKey] = c;
    }
  }

  return Object.values(byCourse).map(({ _detailAt, ...rest }) => rest);
}

/**
 * Rebuild one class's detail (average + categories + scores) for a term straight
 * from its stored history — the offline counterpart to a /single-class fetch.
 * Returns null when that course/term has no stored snapshot.
 */
export function reconstructClassDetailFromHistory(
  term: string,
  course: string,
  name: string
): { average: any; categories: any; scores: any[] } | null {
  const { history } = getGradesStore();
  const termHistory: any = history[term];
  if (!termHistory) return null;
  const courseHistory = termHistory[`${course}|${name}`];
  if (!courseHistory || courseHistory.length === 0) return null;
  const latest = courseHistory[courseHistory.length - 1];
  if (!latest) return null;
  return {
    average: latest.average,
    categories: latest.categories || {},
    scores: latest.scores || [],
  };
}

/** True if a specific course/term has a stored detail (scores or categories). */
export function hasClassDetailInStorage(term: string, course: string, name: string): boolean {
  const detail = reconstructClassDetailFromHistory(term, course, name);
  return (
    !!detail &&
    ((detail.scores && detail.scores.length > 0) ||
      (detail.categories && Object.keys(detail.categories).length > 0))
  );
}

export function getGradesStore(): GradesStore {
  return useStore.getState().getGradesStore() as unknown as GradesStore;
}

export function clearGradesStore(): void {
  useStore.getState().clearGradesStore();
}

export function updateLatestGradesLoadTime(term: string): void {
  useStore.getState().updateLatestGradesLoadTime(term);
}
