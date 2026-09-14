/**
 * Client helpers for the API's cascading term hierarchy.
 *
 * The API returns `termTree`: a nested forest whose roots are the coarsest
 * columns (semester/year) and whose leaves are the finest (progress periods).
 * Depth is arbitrary and district-driven, so the UI renders one subtab bar per
 * level of the currently-selected path — as many as exist. A class's `averages`
 * map is keyed by every column label, so any selected node resolves to a grade.
 */

export type TermNode = { label: string; group?: boolean; children: TermNode[] };

/** One subtab bar: the parent's own roll-up plus its child columns. */
export type SubtabBar = { parent: string; showParent: boolean; options: string[]; selected: string };

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
 * The path to select when top tab `tab` is clicked. Group tabs (a letter family
 * like PR, `group: true`) have no grade of their own, so drill into a child:
 * `preferred` if it lives in the group, else the group's first column.
 */
export function pathForTab(forest: TermNode[], tab: string, preferred?: string): string[] {
  const node = (forest || []).find((n) => n.label === tab);
  if (!node || !node.group || !node.children?.length) return [tab];
  const p = pathToLabel([node], preferred ?? '');
  return p.length > 1 ? p : [tab, node.children[0].label];
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
        showParent: !node.group,
        options: node.children.map((c) => c.label),
        selected: path[i + 1] ?? (node.group ? node.children[0].label : path[i]),
      });
    }
    level = node.children || [];
  }
  return bars;
}
