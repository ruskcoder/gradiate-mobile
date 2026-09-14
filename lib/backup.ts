import { useStore, type User } from '@/lib/store';

const FORMAT = 'gradiate-backup';
const VERSION = 1;

// Everything a backup may carry — the same set as gradexis-web, so a backup made
// on one app restores on the other. Credentials and session data (password,
// clMFA, clsession, psCookies) and account identity are never exported and
// never overwritten on import.
const PORTABLE_KEYS: (keyof User)[] = [
  'colorTheme',
  'theme',
  'gradesView',
  'showPageTitles',
  'matchThemeWithLogo',
  'hideColors',
  'numberDisplay',
  'animationsEnabled',
  'bellSchedules',
  'courseTypesByCourseName',
  'deletedTranscriptCourses',
  'customCourses',
  'rankDataPoints',
  'todos',
  'shortcuts',
  'goals',
  'classNotes',
  'autoTodoFromMissing',
  'activeBellSchedule',
  'changeAlerts',
  'defaultPage',
  'gradesStore',
];

export function buildBackup(user: User): string {
  const data: Record<string, any> = {};
  for (const k of PORTABLE_KEYS) if (user[k] !== undefined) data[k] = user[k];
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    app: 'Gradiate',
    exportedAt: new Date().toISOString(),
    account: { username: user.username, platform: user.platform, district: user.district },
    data,
  });
}

type History = User['gradesStore']['history'];

/** Union two per-course snapshot histories, deduped by timestamp. */
function mergeHistory(current: History = {}, incoming: History = {}): History {
  const out: History = { ...current };
  for (const term of Object.keys(incoming)) {
    out[term] = { ...(out[term] || {}) };
    for (const course of Object.keys(incoming[term] || {})) {
      const byTime = new Map<number, any>();
      for (const e of [...(out[term][course] || []), ...(incoming[term][course] || [])]) {
        byTime.set(e.loadedAt, e);
      }
      out[term][course] = [...byTime.values()].sort((a, b) => a.loadedAt - b.loadedAt);
    }
  }
  return out;
}

/** Restore backup JSON into the current account. Returns a summary string. */
export function restoreBackup(text: string): string {
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('That text is not a valid backup.');
  }
  if (payload?.format !== FORMAT || typeof payload.data !== 'object') {
    throw new Error('That text is not a valid backup.');
  }
  const { changeUserData, currentUser } = useStore.getState();
  const user = currentUser();
  if (!user) throw new Error('No account selected.');

  let restored = 0;
  for (const k of PORTABLE_KEYS) {
    const value = payload.data[k];
    if (value === undefined) continue;
    if (k === 'gradesStore') {
      const cur = user.gradesStore;
      changeUserData('gradesStore', {
        ...cur,
        ...value,
        initialTerm: cur.initialTerm || value.initialTerm,
        termList: cur.termList?.length ? cur.termList : value.termList,
        history: mergeHistory(cur.history, value.history),
      });
    } else {
      changeUserData(k, value);
    }
    restored++;
  }
  const other = payload.account?.username && payload.account.username !== user.username;
  return `Restored ${restored} sections${other ? ` (from account ${payload.account.username})` : ''}.`;
}
