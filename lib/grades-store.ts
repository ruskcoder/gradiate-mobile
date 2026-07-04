import { useStore } from './store';

export interface GradesLoad {
  loadedAt: number;
  classes: any[];
}

export interface GradesStore {
  initialTerm: string;
  termList: string[];
  history: Record<
    string,
    Record<string, Array<{ loadedAt: number; average: any; categories: any; scores: any[] }>>
  >;
}

export function initializeGradesStore(
  initialTerm: string,
  termList: string[],
  term: string,
  classes: any[]
): void {
  useStore.getState().addGradesStore(initialTerm, termList, term, classes);
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

export function getGradesStore(): GradesStore {
  return useStore.getState().getGradesStore() as unknown as GradesStore;
}

export function clearGradesStore(): void {
  useStore.getState().clearGradesStore();
}

export function updateLatestGradesLoadTime(term: string): void {
  useStore.getState().updateLatestGradesLoadTime(term);
}
