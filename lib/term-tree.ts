/**
 * Client helpers for the API's cascading term hierarchy.
 *
 * The API returns `termTree`: a nested forest whose roots are the coarsest
 * columns (semester/year) and whose leaves are the finest (progress periods).
 * Depth is arbitrary and district-driven, so the UI renders one subtab bar per
 * level of the currently-selected path — as many as exist. A class's `averages`
 * map is keyed by every column label, so any selected node resolves to a grade.
 */

export type TermNode = { label: string; children: TermNode[] };

/** One subtab bar: the parent's own roll-up plus its child columns. */
export type SubtabBar = { parent: string; options: string[]; selected: string };

/** Wrap a flat label list as a depth-1 forest (portals with no subterms). */
export function flatForest(labels: string[] | undefined): TermNode[] {
  return (labels || []).map((label) => ({ label, children: [] }));
}

/** Root→node label path for `label`, or [] if absent. */
export function pathToLabel(forest: TermNode[], label: string): string[] {
  const find = (n: TermNode, trail: string[]): string[] | null => {
    const next = [...trail, n.label];
    if (n.label === label) return next;
    for (const c of n.children || []) {
      const r = find(c, next);
      if (r) return r;
    }
    return null;
  };
  for (const r of forest || []) {
    const p = find(r, []);
    if (p) return p;
  }
  return [];
}

/**
 * The stack of subtab bars for a selected path — one per level whose node has
 * children. Each bar offers the parent itself (its own roll-up grade) plus its
 * child columns, with the currently-selected child (or the parent) marked.
 */
export function barsForPath(forest: TermNode[], path: string[]): SubtabBar[] {
  const bars: SubtabBar[] = [];
  let level = forest || [];
  for (let i = 0; i < path.length; i++) {
    const node = level.find((n) => n.label === path[i]);
    if (!node) break;
    if (node.children && node.children.length) {
      bars.push({
        parent: path[i],
        options: node.children.map((c) => c.label),
        selected: path[i + 1] ?? path[i],
      });
    }
    level = node.children || [];
  }
  return bars;
}
