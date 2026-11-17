/**
 * Pure helpers behind the Final Exam calculator: grouping terms into semesters,
 * pulling one class's per-term averages out of a classes payload, and solving
 * the semester formula for whichever field is unknown.
 *
 *   semester = mean(terms) * (100 - weight)/100 + final * weight/100
 *   (exempt: semester = mean(terms))
 *
 * Mirrored in gradexis-web/src/lib/final-exam-math.js — keep the two in sync.
 */
import type { TermNode } from '@/lib/term-tree';

export type Semester = { id: string; label: string; terms: string[] };
/** { [term]: { [course]: average } } */
export type AveragesByTerm = Record<string, Record<string, unknown>>;
export type Unknown = 'final' | 'target' | number;

/** Rounded letter cutoffs: an 89.5 rounds up to an A. */
export const LETTER_TARGETS = [
  { letter: 'A', target: 89.5, color: 90 },
  { letter: 'B', target: 79.5, color: 80 },
  { letter: 'C', target: 69.5, color: 70 },
] as const;

/** "1" → "Term 1"; portal labels like "Q1" stay as they are. */
export function termLabel(term: string): string {
  return /^\d+$/.test(String(term)) ? `Term ${term}` : String(term);
}

/**
 * The semesters to offer. With a term tree the roots that have (non-group)
 * children are the semesters. A flat term list (HAC: 1–4 or 1–6) is split down
 * the middle; an odd count stays one group.
 */
export function buildSemesters(forest: TermNode[], termList: string[]): Semester[] {
  const fromTree: Semester[] = [];
  for (const root of forest || []) {
    const kids = (root.children || []).filter((c) => !c.group).map((c) => c.label);
    if (kids.length) fromTree.push({ id: root.label, label: root.label, terms: kids });
  }
  if (fromTree.length) return fromTree;

  const list = termList || [];
  if (list.length >= 2 && list.length % 2 === 0) {
    const half = list.length / 2;
    return [
      { id: 'S1', label: 'Semester 1', terms: list.slice(0, half) },
      { id: 'S2', label: 'Semester 2', terms: list.slice(half) },
    ];
  }
  return list.length ? [{ id: 'ALL', label: 'All terms', terms: list }] : [];
}

/**
 * The semester containing the current term, else the first one. `path` is the
 * root→term label path (a lone `[term]` for flat portals), so a deep leaf like
 * a progress report still lands in its semester.
 */
export function semesterFor(semesters: Semester[], path: string[]): Semester | null {
  return (
    semesters.find((s) => path.includes(s.id) || path.some((p) => s.terms.includes(p))) ??
    semesters[0] ??
    null
  );
}

/**
 * Merge a classes payload into `byTerm`. All-in-one portals carry an
 * `averages` dict with every term at once; per-term portals only answer for
 * the term that was loaded.
 */
export function mergeClassAverages(byTerm: AveragesByTerm, term: string, classes: any[]): AveragesByTerm {
  const next: AveragesByTerm = { ...byTerm };
  const put = (t: string, course: string, avg: unknown) => {
    next[t] = { ...(next[t] || {}), [course]: avg };
  };
  for (const c of classes || []) {
    if (c.averages && typeof c.averages === 'object') {
      for (const label of Object.keys(c.averages)) put(label, c.course, c.averages[label]);
    } else {
      put(term, c.course, c.average);
    }
  }
  return next;
}

/** True when a payload already holds every term (no per-term fetches needed). */
export function isAllInOne(classes: any[] | undefined): boolean {
  return !!classes?.some((c) => c.averages && typeof c.averages === 'object');
}

export function parseGrade(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Solve for `unknown`. `terms` holds a number or null per term; the unknown
 * term's own slot is ignored. Returns null when something it needs is missing.
 */
export function solve({
  terms,
  final,
  target,
  weight,
  exempt,
  unknown,
}: {
  terms: (number | null)[];
  final: number | null;
  target: number | null;
  weight: number;
  exempt: boolean;
  unknown: Unknown;
}): number | null {
  const n = terms.length;
  if (n === 0) return null;
  const w = exempt ? 0 : weight;
  if (!exempt && (!Number.isFinite(w) || w < 0 || w >= 100)) return null;

  if (typeof unknown === 'number') {
    if (target === null) return null;
    if (!exempt && final === null) return null;
    const others = terms.filter((_, i) => i !== unknown);
    if (others.some((v) => v === null)) return null;
    const neededMean = exempt ? target : (target * 100 - (final as number) * w) / (100 - w);
    return neededMean * n - (others as number[]).reduce((a, b) => a + b, 0);
  }

  if (terms.some((v) => v === null)) return null;
  const mean = (terms as number[]).reduce((a, b) => a + b, 0) / n;

  if (unknown === 'target') {
    if (exempt) return mean;
    if (final === null) return null;
    return (mean * (100 - w) + final * w) / 100;
  }

  if (exempt || target === null || w === 0) return null;
  return (target * 100 - mean * (100 - w)) / w;
}

/** Format a solved number for a pill. */
export function fmt(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '' : n.toFixed(2);
}
