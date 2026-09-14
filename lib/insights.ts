// Derived views over the persisted grades history — the Overview, goals,
// missing-work tracker, GPA projection and change alerts all read from here so
// they work offline and never trigger extra network calls. Mirrors
// gradexis-web's src/lib/insights.js.

import { GPA_CONFIGS } from '@/lib/gpa-configs';
import type { BellSchedule, GradeChange, User } from '@/lib/store';

type Snapshot = { loadedAt: number; average: any; categories: any; scores: any[] };

export interface InsightClass {
  key: string;
  course: string;
  name: string;
  average: number | null;
  prevAverage: number | null;
  delta: number | null;
  categories: Record<string, any>;
  scores: any[];
}

export const courseKeyOf = (c: { course: string; name: string }) => `${c.course}|${c.name}`;

export function parseNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * The current term's classes rebuilt from storage, each with its latest average
 * and the previous *different* average so the UI can show an up/down trend.
 */
export function getCurrentClasses(user: User | null | undefined): {
  term: string;
  loadedAt: number | null;
  classes: InsightClass[];
} {
  const store = user?.gradesStore;
  const term = store?.initialTerm || '';
  const termHistory: Record<string, Snapshot[]> | undefined = term ? store?.history?.[term] : undefined;
  if (!termHistory) return { term, loadedAt: null, classes: [] };

  let loadedAt = 0;
  const classes: InsightClass[] = [];
  for (const key of Object.keys(termHistory)) {
    const entries = termHistory[key] || [];
    const latest = entries[entries.length - 1];
    if (!latest) continue;
    loadedAt = Math.max(loadedAt, latest.loadedAt || 0);
    const average = parseNum(latest.average);
    let prevAverage: number | null = null;
    for (let i = entries.length - 2; i >= 0; i--) {
      const p = parseNum(entries[i].average);
      if (p !== null && p !== average) {
        prevAverage = p;
        break;
      }
    }
    const [course, name] = key.split('|');
    classes.push({
      key,
      course,
      name,
      average,
      prevAverage,
      delta: average !== null && prevAverage !== null ? average - prevAverage : null,
      categories: latest.categories || {},
      scores: latest.scores || [],
    });
  }
  classes.sort((a, b) => a.name.localeCompare(b.name));
  return { term, loadedAt: loadedAt || null, classes };
}

const usableScore = (s: any) => {
  const v = parseFloat(s.score);
  const dropped = s.badges && s.badges.includes('dropped');
  return !isNaN(v) && s.score !== '···' && s.score !== '' && !s.excluded && !dropped;
};

/** Category-weighted average — same math as the What-If calculator. */
export function recalculateAverage(categories: Record<string, any>, scores: any[]): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [name, cat] of Object.entries(categories || {})) {
    let pts = 0;
    let max = 0;
    for (const s of scores || []) {
      if (s.category !== name || !usableScore(s)) continue;
      const w = parseFloat(s.weight) || 1;
      pts += (parseFloat(s.score) || 0) * w;
      max += (parseFloat(s.totalPoints) || 0) * w;
    }
    if (max > 0) {
      const w = parseFloat(cat.categoryWeight) || 1;
      weightedSum += (pts / max) * 100 * w;
      totalWeight += w;
    }
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/**
 * Percentage needed on one new assignment (100 pts × weight) in `category` for
 * the class to reach `target`. Mirrors What-If's Target math.
 */
export function neededOnNext(
  categories: Record<string, any>,
  target: number,
  category: string,
  weight = 1
): number | null {
  const cats = categories || {};
  if (!cats[category]) return null;
  let totalWeight = 0;
  let other = 0;
  for (const [name, c] of Object.entries<any>(cats)) {
    const w = parseFloat(c.categoryWeight) || 1;
    totalWeight += w;
    if (name !== category) other += (parseFloat(c.percent) || 0) * w;
  }
  const cat = cats[category];
  const catWeight = parseFloat(cat.categoryWeight) || 1;
  const requiredCatPercent = (target * totalWeight - other) / catWeight;
  const maxPts = parseFloat(cat.maximumPoints) || 0;
  const stuPts = parseFloat(cat.studentsPoints) || 0;
  const score = ((requiredCatPercent / 100) * (maxPts + 100 * weight) - stuPts) / weight;
  return Number.isFinite(score) ? score : null;
}

/** For a goal, the need on the next assignment in each category (heaviest first). */
export function goalPlan(categories: Record<string, any> | undefined, target: number) {
  const cats = categories || {};
  return Object.entries<any>(cats)
    .map(([name, c]) => ({
      category: name,
      weight: parseFloat(c.categoryWeight) || 0,
      needed: neededOnNext(cats, target, name),
    }))
    .filter((p): p is { category: string; weight: number; needed: number } => p.needed !== null)
    .sort((a, b) => b.weight - a.weight);
}

export interface MissingAssignment {
  id: string;
  classKey: string;
  className: string;
  name: string;
  category: string;
  dateDue: string;
  reason: 'Missing' | 'Zero';
  gain: number | null;
}

/** Every missing / zero assignment across classes, with the gain if turned in at 100%. */
export function getMissingAssignments(classes: InsightClass[]): MissingAssignment[] {
  const out: MissingAssignment[] = [];
  for (const cls of classes || []) {
    const scores = cls.scores || [];
    const hasCategories = cls.categories && Object.keys(cls.categories).length > 0;
    scores.forEach((s, idx) => {
      const badges: string[] = s.badges || [];
      const total = parseNum(s.totalPoints);
      const isMissing = badges.includes('missing');
      const isZero = parseNum(s.score) === 0 && total !== null && total > 0;
      if (!isMissing && !isZero) return;
      if (badges.includes('exempt') || badges.includes('dropped') || s.excluded) return;
      let gain: number | null = null;
      if (hasCategories) {
        const pts = total || 100;
        const patch = (score: number) =>
          scores.map((x, i) => (i === idx ? { ...x, score, totalPoints: pts } : x));
        const after = recalculateAverage(cls.categories, patch(pts));
        const before = recalculateAverage(cls.categories, patch(0));
        if (after !== null && before !== null) gain = after - before;
      }
      out.push({
        id: `${cls.key}|${s.name}|${s.dateDue || ''}`,
        classKey: cls.key,
        className: cls.name,
        name: s.name,
        category: s.category,
        dateDue: s.dateDue,
        reason: isMissing ? 'Missing' : 'Zero',
        gain,
      });
    });
  }
  return out.sort((a, b) => (b.gain ?? -1) - (a.gain ?? -1));
}

/** Pick the district's GPA scale the same way the GPA calculator does. */
export function defaultGpaType(user: User | null | undefined) {
  return user?.district?.toLowerCase().includes('cypress') ? 'cyFairWeighted' : 'katyWeighted';
}

function letterFor(grade: number, labels: Record<string, string>) {
  const n = Math.round(grade);
  for (const [letter, range] of Object.entries(labels)) {
    const [min, max] = range.split('-').map(Number);
    if (n >= min && n <= max) return letter;
  }
  return null;
}

function guessType(name: string, types: string[]) {
  const n = name.toLowerCase();
  const has = (t: string) => types.includes(t);
  if (has('AP') && /\bap\b/.test(n)) return 'AP';
  if (has('KAP') && /(kap|honors|\bpap\b|\bgt\b)/.test(n)) return 'KAP';
  if (has('K') && /(\bk\b|kap|honors|\bpap\b)/.test(n)) return 'K';
  if (has('DC') && /(dual|college)/.test(n)) return 'DC';
  if (has('ACA')) return 'ACA';
  if (has('On Level')) return 'On Level';
  return types[0];
}

/**
 * GPA if every current class ended at its current average. Uses the course types
 * the user set in the GPA calculator when available.
 */
export function projectGpa(
  user: User | null | undefined,
  classes: InsightClass[],
  gpaType: string = defaultGpaType(user)
): { gpa: number; count: number } | null {
  const config = GPA_CONFIGS[gpaType];
  if (!config) return null;
  const types = Object.keys(config.classes).filter((t) => t !== '*');
  let sum = 0;
  let count = 0;
  for (const cls of classes || []) {
    if (cls.average === null) continue;
    const letter = letterFor(cls.average, config.labels);
    if (!letter) continue;
    const type = user?.courseTypesByCourseName?.[cls.name] || guessType(cls.name, types);
    const scale = config.classes[type] || config.classes['*'];
    const pts = scale?.[letter];
    if (pts === undefined) continue;
    sum += pts;
    count++;
  }
  return count ? { gpa: sum / count, count } : null;
}

/** Merge a projected term GPA into a transcript GPA weighted by course count. */
export function combineWithTranscript(
  transcriptGpa: number | null,
  transcriptCourses: number,
  projected: { gpa: number; count: number } | null
) {
  if (transcriptGpa === null || !transcriptCourses || !projected) return null;
  return (
    (transcriptGpa * transcriptCourses + projected.gpa * projected.count) /
    (transcriptCourses + projected.count)
  );
}

/** Compare a stored term history with a freshly-loaded class list. */
export function diffGrades(
  termHistory: Record<string, Snapshot[]> | undefined,
  classes: any[],
  term: string
): GradeChange[] {
  if (!termHistory || !Array.isArray(classes)) return [];
  const changes: GradeChange[] = [];
  for (const c of classes) {
    const entries = termHistory[courseKeyOf(c)];
    const prev = entries?.[entries.length - 1];
    if (!prev) continue;
    const from = parseNum(prev.average);
    const to = parseNum(c.average ?? c.averages?.[term]);
    const prevNames = new Set((prev.scores || []).map((s: any) => `${s.name}|${s.dateDue}`));
    const newAssignments =
      Array.isArray(c.scores) && prev.scores?.length
        ? c.scores.filter((s: any) => !prevNames.has(`${s.name}|${s.dateDue}`)).map((s: any) => s.name)
        : [];
    const avgChanged = from !== null && to !== null && Math.abs(from - to) >= 0.005;
    if (avgChanged || newAssignments.length) {
      changes.push({ name: c.name, from, to, newAssignments });
    }
  }
  return changes;
}

// ---- Bell schedule -------------------------------------------------------

/** Minutes since midnight from "7:25 AM" or "13:05". */
export function parseClock(str: string | undefined): number | null {
  if (!str) return null;
  const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$/i.exec(str);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

/** Current and next period for a bell schedule at `now`. */
export function periodStatus(schedule: BellSchedule | undefined, now = new Date()) {
  if (!schedule?.periods?.length) return null;
  const t = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const periods = schedule.periods
    .map((p, i) => ({
      ...p,
      name: p.name || `Period ${i + 1}`,
      start: parseClock(p.startTime),
      end: parseClock(p.endTime),
    }))
    .filter((p): p is typeof p & { start: number; end: number } => p.start !== null && p.end !== null)
    .sort((a, b) => a.start - b.start);
  const current = periods.find((p) => t >= p.start && t < p.end) || null;
  const next = periods.find((p) => p.start > t) || null;
  return {
    current,
    next,
    minutesLeft: current ? Math.ceil(current.end - t) : null,
    minutesUntilNext: next ? Math.ceil(next.start - t) : null,
    progress: current ? (t - current.start) / (current.end - current.start) : null,
  };
}

/** Plain-text grade summary for the share sheet. */
export function shareSummary(
  classes: InsightClass[],
  opts: { hideNumbers: boolean; gpa?: number | null }
): string {
  const letter = (n: number) => (n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 70 ? 'C' : n >= 60 ? 'D' : 'F');
  const lines = classes
    .filter((c) => c.average !== null)
    .map((c) => `${c.name}: ${opts.hideNumbers ? letter(c.average!) : c.average!.toFixed(2)}`);
  if (opts.gpa != null && !opts.hideNumbers) lines.push('', `Projected GPA: ${opts.gpa.toFixed(3)}`);
  return ['My grades', '', ...lines].join('\n');
}
