import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { District } from './constants';
import { PLATFORMS } from './constants';
import type { ToolType } from './tool-types';
import {
  deletePassword,
  loadClMFA,
  loadPassword,
  saveClMFA,
  savePassword,
} from './secure-credentials';

type Platform = (typeof PLATFORMS)[number];

export interface BellSchedule {
  name: string;
  periods: Array<{
    period?: number | string;
    startTime: string;
    endTime: string;
    name?: string;
  }>;
}

export interface TodoItem {
  id: string;
  title: string;
  dueDate: Date | null;
  completed: boolean;
}

export interface Shortcut {
  id: string;
  title: string;
  url: string;
  image: string;
}

export interface User {
  loginType: '' | 'credentials' | 'classlink' | 'classlinkCredentials' | 'microsoftSession';
  username: string;
  password: string;
  platform: Platform;
  link: string;
  clsession: string;
  // Portal cookies captured from the Microsoft-SSO WebView handoff
  // (loginType 'microsoftSession'). Sent with each request so the API can ride
  // the same session; refreshed by re-running the WebView when they expire.
  psCookies?: string;
  // Multi-student portals (e.g. a PowerSchool parent account): the chosen
  // student's id, threaded into every data request; `students` is the full
  // roster the login picker surfaced.
  studentId?: string;
  students?: { id: string; name: string }[];
  // ClassLink district code (the trailing segment of a launchpad link), sent as
  // `code` for `classlinkCredentials` logins. Empty for other login types.
  code: string;
  // The stored answer to this account's ClassLink 2FA challenge — a fixed PIN
  // string or the chosen icon filename — so re-auth on app open is silent. Kept
  // in the OS keystore like the password (see secure-credentials.ts), never in
  // the plaintext AsyncStorage blob. Empty when the account has no 2FA.
  clMFA: string;
  // Which kind of 2FA this account uses ('pin' | 'image' | ''), so the login
  // popover knows what to render on a forced re-verify.
  mfaType: '' | 'pin' | 'image';
  name: string;
  avatar: string;
  district: string;
  school: string;
  colorTheme: string;
  // Web's stored value is 'light' | 'dark'; mobile additionally supports
  // 'system' (follow the OS) — a superset kept per the app's own preference.
  theme: 'light' | 'dark' | 'system';
  color: string;
  gradesView: 'card' | 'list';
  showPageTitles?: boolean;
  matchThemeWithLogo?: boolean;
  hideColors?: boolean;
  // Mobile-only (no web equivalent): play the staggered fade-up reveal when
  // grades render, and other list entrance animations.
  animationsEnabled?: boolean;
  // Mobile-only (no web equivalent): show the sliding pill behind the active
  // tab. Lives on the user so it's saved/restored per account like the rest.
  tabBarIndicatorEnabled: boolean;
  // Mobile-only (no web equivalent): when true, an hourly background task
  // checks the current term's grades and notifies on any change.
  notificationsEnabled?: boolean;
  // How to display numeric grades: decimal (88.5), rounded (89), letter (B), or letter+ (A-)
  numberDisplay?: 'decimal' | 'rounded' | 'letter' | 'letter+';
  bellSchedules: BellSchedule[];
  premium: boolean;
  lastLogin: Date | null;
  courseTypesByCourseName: Record<string, string>;
  deletedTranscriptCourses: string[];
  customCourses: Array<{ courseName: string; grade: string; type: string }>;
  rankDataPoints: Array<{ gpa: number | null; rank: number | null }>;
  todos: TodoItem[];
  shortcuts: Shortcut[];
  gradesStore: {
    initialTerm: string;
    termList: string[];
    // The cascading term hierarchy, persisted so "Load from Storage" can rebuild
    // the same nested subtabs offline instead of collapsing to a flat term row.
    termTree: any[];
    currentTerms: string[];
    hasSubterms: boolean;
    history: Record<
      string,
      Record<string, Array<{ loadedAt: number; average: any; categories: any; scores: any[] }>>
    >;
  };
}

/** Metadata describing the term hierarchy for a grades payload. */
export interface GradesTermMeta {
  termTree?: any[];
  currentTerms?: string[];
  hasSubterms?: boolean;
}

type GradesHistory = User['gradesStore']['history'];

/**
 * Append this load's per-course snapshots into the term history, immutably.
 * If a course's latest snapshot is byte-identical to the incoming one, its
 * timestamp is refreshed in place instead of pushing a duplicate. Shared by
 * `addGradesStore` (which also resets initialTerm/termList) and
 * `addGradesStoreLoad` (which preserves them).
 */
function pushSnapshot(
  termBucket: Record<string, Array<{ loadedAt: number; average: any; categories: any; scores: any[] }>>,
  courseKey: string,
  snapshot: { loadedAt: number; average: any; categories: any; scores: any[] }
): void {
  const courseHistory = termBucket[courseKey] ? [...termBucket[courseKey]] : [];
  termBucket[courseKey] = courseHistory;
  const latest = courseHistory[courseHistory.length - 1];
  const unchanged =
    latest &&
    JSON.stringify(latest.average) === JSON.stringify(snapshot.average) &&
    JSON.stringify(latest.categories) === JSON.stringify(snapshot.categories) &&
    JSON.stringify(latest.scores) === JSON.stringify(snapshot.scores);
  if (unchanged) courseHistory[courseHistory.length - 1] = snapshot;
  else courseHistory.push(snapshot);
}

/**
 * Append this load's per-course snapshots into the term history, immutably —
 * platform-agnostic so one storage model serves every portal:
 *
 *  - Inline single-term data (HAC's /classes, or any /single-class detail):
 *    the class carries average/categories/scores for ONE term -> stored under `term`.
 *  - Averages-only data (Skyward's /classes): the class carries an `averages`
 *    dict keyed by every term/subterm label and no scores -> a numeric-average
 *    snapshot is recorded under EACH label at once, so history, timeline and
 *    "Load from Storage" have every term without extra fetches.
 */
function mergeClassesIntoHistory(
  history: GradesHistory,
  term: string,
  classes: any[]
): GradesHistory {
  const newHistory = { ...history };
  const ensureTerm = (t: string) => {
    newHistory[t] = newHistory[t] ? { ...newHistory[t] } : {};
    return newHistory[t];
  };

  for (const classData of classes) {
    const courseKey = `${classData.course}|${classData.name}`;
    const hasDetail =
      (Array.isArray(classData.scores) && classData.scores.length > 0) ||
      (classData.categories && Object.keys(classData.categories).length > 0);
    const averagesDict =
      classData.averages && typeof classData.averages === 'object' ? classData.averages : null;

    if (!hasDetail && averagesDict) {
      for (const label of Object.keys(averagesDict)) {
        const avg = averagesDict[label];
        if (avg === undefined || avg === null || avg === '' || isNaN(parseFloat(avg))) continue;
        pushSnapshot(ensureTerm(label), courseKey, {
          loadedAt: Date.now(),
          average: avg,
          categories: undefined,
          scores: undefined as any,
        });
      }
    } else {
      const average = classData.average ?? (averagesDict ? averagesDict[term] : undefined);
      pushSnapshot(ensureTerm(term), courseKey, {
        loadedAt: Date.now(),
        average,
        categories: classData.categories,
        scores: classData.scores,
      });
    }
  }

  return newHistory;
}

const DEFAULT_USER: User = {
  loginType: '',
  username: '',
  password: '',
  platform: 'hac',
  link: '',
  clsession: '',
  psCookies: '',
  studentId: '',
  students: [],
  code: '',
  clMFA: '',
  mfaType: '',
  name: '',
  avatar: '',
  district: '',
  school: '',
  colorTheme: 'default',
  theme: 'system',
  color: 'blue',
  gradesView: 'list',
  showPageTitles: true,
  matchThemeWithLogo: false,
  hideColors: false,
  animationsEnabled: true,
  tabBarIndicatorEnabled: true,
  notificationsEnabled: true,
  numberDisplay: 'decimal',
  bellSchedules: [],
  premium: false,
  lastLogin: null,
  courseTypesByCourseName: {},
  deletedTranscriptCourses: [],
  customCourses: [],
  rankDataPoints: [
    { gpa: null, rank: null },
    { gpa: null, rank: null },
  ],
  todos: [],
  shortcuts: [],
  gradesStore: {
    initialTerm: '',
    termList: [],
    termTree: [],
    currentTerms: [],
    hasSubterms: false,
    history: {},
  },
};

interface Session {
  loginTime?: number;
  lastActivity?: number;
  [key: string]: any;
}

interface UserStore {
  users: User[];
  currentUserIndex: number;
  session: Session;
  cache: Record<string, any>;
  cacheTimestamp?: number | null;

  currentUser: () => User | null;

  setUsers: (users: User[]) => void;
  setCurrentUserIndex: (index: number) => void;
  addUser: (user?: Partial<User>) => void;
  removeUser: (index: number) => void;
  changeUserData: (key: keyof User, value: any) => void;
  setSession: (session: Partial<Session>) => void;
  getCacheValue: (key: string) => any;
  setCacheValue: (key: string, value: any) => void;
  clearCache: () => void;
  addTodo: (todo: Omit<TodoItem, 'id'>) => void;
  updateTodo: (id: string, updates: Partial<TodoItem>) => void;
  removeTodo: (id: string) => void;
  toggleTodoComplete: (id: string) => void;
  addShortcut: (shortcut: Omit<Shortcut, 'id'>) => void;
  updateShortcut: (id: string, updates: Partial<Shortcut>) => void;
  removeShortcut: (id: string) => void;
  addGradesStore: (initialTerm: string, termList: string[], term: string, classes: any[], meta?: GradesTermMeta) => void;
  addGradesStoreLoad: (term: string, classes: any[]) => void;
  updateLatestGradesLoadTime: (term: string) => void;
  getGradesStore: () => {
    initialTerm: string;
    termList: string[];
    termTree: any[];
    currentTerms: string[];
    hasSubterms: boolean;
    history: Record<string, Array<{ loadedAt: number; classes: any[] }>>;
  };
  clearGradesStore: () => void;

  /** Session-only (not persisted) — when set, the Grades tab is showing this
   *  tool's course list instead of the plain grades list (same screen
   *  instance, just a different title + tap behavior). Set by the Tools tab,
   *  cleared by the exit button next to the title. */
  toolMode: ToolType | null;
  setToolMode: (mode: ToolType | null) => void;

  /** Session-only (not persisted) — set when an API call discovers the
   *  current user's session/password is no longer valid (see
   *  `handleAuthError` in grades-api.ts). `login.tsx` reads this to jump
   *  straight to the credentials page with the username locked, instead of
   *  the normal add-account picker flow. Cleared on a successful re-login or
   *  if the user backs out of that page. */
  reauthUsername: string | null;
  reauthDistrict: District | null;
  setReauthRequired: (info: { username: string; district: District } | null) => void;
}

export const useStore = create<UserStore>()(
  persist(
    (set, get) => ({
      users: [],
      currentUserIndex: -1,
      session: {},
      cache: {},
      cacheTimestamp: null,
      toolMode: null,
      setToolMode: (mode: ToolType | null) => set({ toolMode: mode }),

      reauthUsername: null,
      reauthDistrict: null,
      setReauthRequired: (info) =>
        set({
          reauthUsername: info?.username ?? null,
          reauthDistrict: info?.district ?? null,
        }),

      currentUser: (): User | null => {
        const { users, currentUserIndex } = get();
        if (users.length === 0 || currentUserIndex < 0 || currentUserIndex >= users.length) {
          return null;
        }
        return users[currentUserIndex]!;
      },

      setUsers: (users: User[]) => {
        set({ users });
      },

      setCurrentUserIndex: (index: number) => {
        set({ currentUserIndex: index });
      },

      addUser: (user?: Partial<User>) => {
        set((state) => ({
          users: [...state.users, { ...DEFAULT_USER, ...user }],
        }));
      },

      removeUser: (index: number) => {
        set((state) => {
          const removed = state.users[index];
          if (removed) void deletePassword(removed);
          const newUsers = state.users.filter((_, i) => i !== index);
          let newIndex = state.currentUserIndex;

          if (newIndex >= newUsers.length) {
            newIndex = newUsers.length - 1;
          }

          return {
            users: newUsers,
            currentUserIndex: newIndex,
            // The API session cookies and the response cache are global, not
            // per-user. Drop them on sign-out so a subsequent sign-in (into a
            // different account, without an app restart) can't ride the previous
            // account's session or read its cached grades.
            session: {},
            cache: {},
            cacheTimestamp: null,
          };
        });
      },

      changeUserData: (key: keyof User, value: any) => {
        set((state) => {
          const newUsers = [...state.users];
          if (newUsers[state.currentUserIndex]) {
            newUsers[state.currentUserIndex] = {
              ...newUsers[state.currentUserIndex],
              [key]: value,
            } as User;
          }
          return { users: newUsers };
        });
      },

      setSession: (session: Partial<Session>) => {
        set((state) => ({
          session: { ...state.session, ...session },
        }));
      },

      getCacheValue: (key: string) => {
        return get().cache[key];
      },

      setCacheValue: (key: string, value: any) => {
        set((state) => ({
          cache: { ...state.cache, [key]: value },
          cacheTimestamp: Date.now(),
        }));
      },

      clearCache: () => {
        set({ cache: {}, cacheTimestamp: null });
      },

      addTodo: (todo: Omit<TodoItem, 'id'>) => {
        set((state) => {
          const newUsers = [...state.users];
          if (newUsers[state.currentUserIndex]) {
            const id = Math.random().toString(36).substr(2, 9);
            const currentUser = newUsers[state.currentUserIndex]!;
            newUsers[state.currentUserIndex] = {
              ...currentUser,
              todos: [...(currentUser.todos || []), { ...todo, id }],
            } as User;
          }
          return { users: newUsers };
        });
      },

      updateTodo: (id: string, updates: Partial<TodoItem>) => {
        set((state) => {
          const newUsers = [...state.users];
          if (newUsers[state.currentUserIndex]) {
            const currentUser = newUsers[state.currentUserIndex]!;
            newUsers[state.currentUserIndex] = {
              ...currentUser,
              todos: (currentUser.todos || []).map((todo) =>
                todo.id === id ? { ...todo, ...updates } : todo
              ),
            } as User;
          }
          return { users: newUsers };
        });
      },

      removeTodo: (id: string) => {
        set((state) => {
          const newUsers = [...state.users];
          if (newUsers[state.currentUserIndex]) {
            const currentUser = newUsers[state.currentUserIndex]!;
            newUsers[state.currentUserIndex] = {
              ...currentUser,
              todos: (currentUser.todos || []).filter((todo) => todo.id !== id),
            } as User;
          }
          return { users: newUsers };
        });
      },

      toggleTodoComplete: (id: string) => {
        set((state) => {
          const newUsers = [...state.users];
          if (newUsers[state.currentUserIndex]) {
            const currentUser = newUsers[state.currentUserIndex]!;
            newUsers[state.currentUserIndex] = {
              ...currentUser,
              todos: (currentUser.todos || []).map((todo) =>
                todo.id === id ? { ...todo, completed: !todo.completed } : todo
              ),
            } as User;
          }
          return { users: newUsers };
        });
      },

      addShortcut: (shortcut: Omit<Shortcut, 'id'>) => {
        set((state) => {
          const newUsers = [...state.users];
          if (newUsers[state.currentUserIndex]) {
            const id = Math.random().toString(36).substr(2, 9);
            const currentUser = newUsers[state.currentUserIndex]!;
            newUsers[state.currentUserIndex] = {
              ...currentUser,
              shortcuts: [...(currentUser.shortcuts || []), { ...shortcut, id }],
            } as User;
          }
          return { users: newUsers };
        });
      },

      updateShortcut: (id: string, updates: Partial<Shortcut>) => {
        set((state) => {
          const newUsers = [...state.users];
          if (newUsers[state.currentUserIndex]) {
            const currentUser = newUsers[state.currentUserIndex]!;
            newUsers[state.currentUserIndex] = {
              ...currentUser,
              shortcuts: (currentUser.shortcuts || []).map((shortcut) =>
                shortcut.id === id ? { ...shortcut, ...updates } : shortcut
              ),
            } as User;
          }
          return { users: newUsers };
        });
      },

      removeShortcut: (id: string) => {
        set((state) => {
          const newUsers = [...state.users];
          if (newUsers[state.currentUserIndex]) {
            const currentUser = newUsers[state.currentUserIndex]!;
            newUsers[state.currentUserIndex] = {
              ...currentUser,
              shortcuts: (currentUser.shortcuts || []).filter(
                (shortcut) => shortcut.id !== id
              ),
            } as User;
          }
          return { users: newUsers };
        });
      },

      addGradesStore: (
        initialTerm: string,
        termList: string[],
        term: string,
        classes: any[],
        meta?: GradesTermMeta
      ) => {
        set((state) => {
          const newUsers = [...state.users];
          const currentUser = newUsers[state.currentUserIndex];
          if (currentUser) {
            const prev = currentUser.gradesStore;
            newUsers[state.currentUserIndex] = {
              ...currentUser,
              gradesStore: {
                initialTerm,
                termList,
                // Persist the cascade (fall back to previous values when a payload
                // omits them) so storage keeps the nested subtabs.
                termTree: meta?.termTree ?? prev.termTree ?? [],
                currentTerms: meta?.currentTerms ?? prev.currentTerms ?? [],
                hasSubterms: meta?.hasSubterms ?? prev.hasSubterms ?? false,
                history: mergeClassesIntoHistory(prev.history, term, classes),
              },
            } as User;
          }
          return { users: newUsers };
        });
      },

      addGradesStoreLoad: (term: string, classes: any[]) => {
        set((state) => {
          const newUsers = [...state.users];
          const currentUser = newUsers[state.currentUserIndex];
          if (currentUser) {
            newUsers[state.currentUserIndex] = {
              ...currentUser,
              gradesStore: {
                ...currentUser.gradesStore,
                history: mergeClassesIntoHistory(currentUser.gradesStore.history, term, classes),
              },
            } as User;
          }
          return { users: newUsers };
        });
      },

      updateLatestGradesLoadTime: (term: string) => {
        set((state) => {
          const newUsers = [...state.users];
          if (newUsers[state.currentUserIndex]) {
            const currentUser = newUsers[state.currentUserIndex]!;
            const newHistory = { ...currentUser.gradesStore.history };
            if (newHistory[term]) {
              newHistory[term] = { ...newHistory[term] };

              for (const courseKey in newHistory[term]) {
                const courseHistory = newHistory[term][courseKey];
                if (courseHistory && courseHistory.length > 0) {
                  const latestEntry = courseHistory[courseHistory.length - 1];
                  if (latestEntry) {
                    courseHistory[courseHistory.length - 1] = {
                      loadedAt: Date.now(),
                      average: latestEntry.average,
                      categories: latestEntry.categories,
                      scores: latestEntry.scores,
                    };
                  }
                }
              }
              newUsers[state.currentUserIndex] = {
                ...currentUser,
                gradesStore: {
                  ...currentUser.gradesStore,
                  history: newHistory,
                },
              } as User;
            }
          }
          return { users: newUsers };
        });
      },

      getGradesStore: () => {
        const empty = {
          initialTerm: '',
          termList: [] as string[],
          termTree: [] as any[],
          currentTerms: [] as string[],
          hasSubterms: false,
          history: {} as Record<string, Array<{ loadedAt: number; classes: any[] }>>,
        };
        const { users, currentUserIndex } = get();
        if (users.length === 0 || currentUserIndex < 0 || currentUserIndex >= users.length) {
          return empty;
        }
        const store = users[currentUserIndex]?.gradesStore;
        if (!store) {
          return empty;
        }
        return {
          initialTerm: store.initialTerm,
          termList: store.termList,
          termTree: store.termTree ?? [],
          currentTerms: store.currentTerms ?? [],
          hasSubterms: store.hasSubterms ?? false,
          history: store.history as unknown as Record<
            string,
            Array<{ loadedAt: number; classes: any[] }>
          >,
        };
      },

      clearGradesStore: () => {
        set((state) => {
          const newUsers = [...state.users];
          if (newUsers[state.currentUserIndex]) {
            const currentUser = newUsers[state.currentUserIndex]!;
            newUsers[state.currentUserIndex] = {
              ...currentUser,
              gradesStore: {
                initialTerm: '',
                termList: [],
                termTree: [],
                currentTerms: [],
                hasSubterms: false,
                history: {},
              },
            } as User;
          }
          return { users: newUsers };
        });
      },
    }),
    {
      name: 'user-store',
      storage: createJSONStorage(() => AsyncStorage),
      // The password and the ClassLink 2FA answer are deliberately stripped from
      // the persisted (plaintext) AsyncStorage blob — they live in the OS
      // keystore instead (see secure-credentials.ts) and are rehydrated by
      // hydrateSecureCredentials().
      partialize: (state) => ({
        users: state.users.map(({ password, clMFA, ...rest }) => rest),
        currentUserIndex: state.currentUserIndex,
      }),
      onRehydrateStorage: () => (persistedState) => {
        try {
          if (!persistedState || !Array.isArray(persistedState.users)) return;

          const mergedUsers = persistedState.users.map((u: Partial<User>) => {
            return {
              ...DEFAULT_USER,
              ...u,
            } as User;
          });

          let idx = -1;
          const rawIdx: any = (persistedState as any).currentUserIndex;
          if (typeof rawIdx === 'number') {
            idx = rawIdx;
          } else if (typeof rawIdx === 'string' && rawIdx.trim() !== '') {
            const parsed = parseInt(rawIdx, 10);
            if (!isNaN(parsed)) idx = parsed;
          }

          if (idx >= mergedUsers.length) {
            idx = mergedUsers.length - 1;
          }
          if (idx < -1) {
            idx = -1;
          }

          (persistedState as any).users = mergedUsers;
          (persistedState as any).currentUserIndex = idx;
        } catch (e) {
          console.error(e);
        }
        // Pull passwords back out of the keystore into memory once the rest of
        // the state has rehydrated.
        void hydrateSecureCredentials();
      },
    }
  )
);

// --- Secure credential mirroring -------------------------------------------
// Keep the OS keystore in sync with the in-memory passwords, and load them back
// on launch. Passwords never touch the persisted AsyncStorage blob.

function passwordSnapshot(users: User[]): string {
  return users
    .map((u) => `${u.platform}:${u.username}:${u.link}=${u.password || ''}/${u.clMFA || ''}`)
    .join('|');
}

let lastPasswordSnapshot = '';
useStore.subscribe((state) => {
  const snapshot = passwordSnapshot(state.users);
  if (snapshot === lastPasswordSnapshot) return;
  lastPasswordSnapshot = snapshot;
  for (const user of state.users) {
    if (user.password) void savePassword(user, user.password);
    if (user.clMFA) void saveClMFA(user, user.clMFA);
  }
});

/**
 * Populate in-memory passwords from the keystore after rehydration. For any
 * account that still carries a legacy plaintext password (from a pre-migration
 * install's AsyncStorage blob) it migrates that into the keystore instead.
 * Worst case if a password is missing everywhere: the user is asked to log in
 * again — never a hard lockout.
 */
// The in-flight keystore read, so callers can wait for it. Store rehydration
// (`useStore.persist.hasHydrated()`) completes as soon as the AsyncStorage blob
// is merged, but passwords live in the OS keystore and arrive strictly later —
// see whenSecureCredentialsReady().
let secureHydration: Promise<void> | null = null;

/**
 * Resolves once the keystore read started at rehydration has finished.
 *
 * `hasHydrated()` is NOT sufficient to know a password is in memory: it fires
 * after the plaintext blob merges, while `hydrateSecureCredentials()` is still
 * awaiting the keystore. Screens that mounted in that window fired a request
 * with `password: undefined`, the API answered 400 "username and password are
 * required for credentials login", and the app read that as a dead password and
 * bounced the user to re-login — intermittently, because it's a race.
 */
export function whenSecureCredentialsReady(): Promise<void> {
  return secureHydration ?? Promise.resolve();
}

export function hydrateSecureCredentials(): Promise<void> {
  secureHydration = doHydrateSecureCredentials();
  return secureHydration;
}

async function doHydrateSecureCredentials(): Promise<void> {
  const users = useStore.getState().users;
  if (users.length === 0) return;

  const resolved = await Promise.all(
    users.map(async (user) => {
      let next = user;
      if (user.password) {
        // Legacy plaintext survived rehydration — migrate it into the keystore.
        await savePassword(user, user.password);
      } else {
        const stored = await loadPassword(user);
        if (stored) next = { ...next, password: stored } as User;
      }
      // The 2FA answer lives only in the keystore, so always try to rehydrate it.
      if (user.clMFA) {
        await saveClMFA(user, user.clMFA);
      } else {
        const storedMfa = await loadClMFA(user);
        if (storedMfa) next = { ...next, clMFA: storedMfa } as User;
      }
      return next;
    })
  );

  // Only touch state if something actually changed, to avoid a redundant render.
  if (resolved.some((u, i) => u.password !== users[i]!.password || u.clMFA !== users[i]!.clMFA)) {
    lastPasswordSnapshot = passwordSnapshot(resolved);
    useStore.setState({ users: resolved });
  }
}

export const useCurrentUser = () => {
  return useStore((state) => {
    const { users, currentUserIndex } = state;
    if (users.length === 0 || currentUserIndex < 0 || currentUserIndex >= users.length)
      return null;
    return users[currentUserIndex];
  });
};

export const currentUser = () => {
  return useStore.getState().currentUser();
};

export const getSession = () => {
  return useStore.getState().session;
};

export const setSession = (session: Partial<Session>) => {
  useStore.getState().setSession(session);
};
