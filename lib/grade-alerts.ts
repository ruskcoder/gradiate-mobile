import { diffGrades, getCurrentClasses, getMissingAssignments, mergeGradeChanges } from '@/lib/insights';
import type { GradeChange } from '@/lib/store';
import { useStore } from '@/lib/store';

const fmt = (n: number | null) => (n === null ? '···' : n.toFixed(2));

/** One-line description of a change, e.g. "AP Bio · 91.20 → 89.80 · 1 new: Quiz 4". */
export function describeGradeChange(change: GradeChange): string {
  const parts: string[] = [];
  if (change.from !== null && change.to !== null && change.from !== change.to) {
    parts.push(`${fmt(change.from)} → ${fmt(change.to)}`);
  }
  if (change.newAssignments.length) {
    const names = change.newAssignments.slice(0, 2).join(', ');
    parts.push(
      `${change.newAssignments.length} new: ${names}${change.newAssignments.length > 2 ? '…' : ''}`
    );
  }
  return `${change.name} · ${parts.join(' · ')}`;
}

/** Create todos for missing assignments that don't already have one. */
export function syncMissingTodos(): void {
  const state = useStore.getState();
  const user = state.currentUser();
  if (!user?.autoTodoFromMissing) return;
  const existing = new Set((user.todos || []).map((t) => t.source).filter(Boolean));
  const { classes } = getCurrentClasses(user);
  for (const m of getMissingAssignments(classes)) {
    const source = `missing:${m.id}`;
    if (existing.has(source)) continue;
    state.addTodo({ title: `${m.className}: ${m.name}`, dueDate: null, completed: false, source });
  }
}

/**
 * Wrap a store merge of freshly-loaded classes: diff against what was stored
 * before, run the merge, then publish the changes and sync todos. Never lets an
 * insight failure break the fetch itself.
 */
export function withGradeChangeDetection(term: string, classes: any[], merge: () => void): void {
  let changes: GradeChange[] = [];
  try {
    const before = useStore.getState().currentUser()?.gradesStore.history?.[term];
    changes = diffGrades(before, classes, term);
  } catch (e) {
    console.error(e);
  }
  merge();
  try {
    const state = useStore.getState();
    // Shown as badges on the grades list (see GradesItem), cleared per class on open.
    if (changes.length && state.currentUser()?.changeAlerts !== false) {
      state.setGradeChanges(mergeGradeChanges(state.gradeChanges, changes));
    }
    syncMissingTodos();
  } catch (e) {
    console.error(e);
  }
}
