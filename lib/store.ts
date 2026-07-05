import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { District } from './constants';
import { PLATFORMS } from './constants';
import type { ToolType } from './tool-types';
import { deletePassword, loadPassword, savePassword } from './secure-credentials';

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
  loginType: '' | 'credentials' | 'classlink';
  username: string;
  password: string;
  platform: Platform;
  link: string;
  clsession: string;
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
    history: Record<
      string,
      Record<string, Array<{ loadedAt: number; average: any; categories: any; scores: any[] }>>
    >;
  };
}

type GradesHistory = User['gradesStore']['history'];

/**
 * Append this load's per-course snapshots into the term history, immutably.
 * If a course's latest snapshot is byte-identical to the incoming one, its
 * timestamp is refreshed in place instead of pushing a duplicate. Shared by
 * `addGradesStore` (which also resets initialTerm/termList) and
 * `addGradesStoreLoad` (which preserves them).
 */
function mergeClassesIntoHistory(
  history: GradesHistory,
  term: string,
  classes: any[]
): GradesHistory {
  const newHistory = { ...history };
  newHistory[term] = newHistory[term] ? { ...newHistory[term] } : {};

  for (const classData of classes) {
    const courseKey = `${classData.course}|${classData.name}`;
    const existing = newHistory[term][courseKey];
    const courseHistory = existing ? [...existing] : [];
    newHistory[term][courseKey] = courseHistory;

    const snapshot = {
      loadedAt: Date.now(),
      average: classData.average,
      categories: classData.categories,
      scores: classData.scores,
    };

    const latest = courseHistory[courseHistory.length - 1];
    const unchanged =
      latest &&
      JSON.stringify(latest.average) === JSON.stringify(classData.average) &&
      JSON.stringify(latest.categories) === JSON.stringify(classData.categories) &&
      JSON.stringify(latest.scores) === JSON.stringify(classData.scores);

    if (unchanged) {
      courseHistory[courseHistory.length - 1] = snapshot;
    } else {
      courseHistory.push(snapshot);
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
  addGradesStore: (initialTerm: string, termList: string[], term: string, classes: any[]) => void;
  addGradesStoreLoad: (term: string, classes: any[]) => void;
  updateLatestGradesLoadTime: (term: string) => void;
  getGradesStore: () => {
    initialTerm: string;
    termList: string[];
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
        classes: any[]
      ) => {
        set((state) => {
          const newUsers = [...state.users];
          const currentUser = newUsers[state.currentUserIndex];
          if (currentUser) {
            newUsers[state.currentUserIndex] = {
              ...currentUser,
              gradesStore: {
                initialTerm,
                termList,
                history: mergeClassesIntoHistory(currentUser.gradesStore.history, term, classes),
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
        const { users, currentUserIndex } = get();
        if (users.length === 0 || currentUserIndex < 0 || currentUserIndex >= users.length) {
          return {
            initialTerm: '',
            termList: [],
            history: {} as Record<string, Array<{ loadedAt: number; classes: any[] }>>,
          };
        }
        const store = users[currentUserIndex]?.gradesStore;
        if (!store) {
          return {
            initialTerm: '',
            termList: [],
            history: {} as Record<string, Array<{ loadedAt: number; classes: any[] }>>,
          };
        }
        return {
          initialTerm: store.initialTerm,
          termList: store.termList,
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
      // The password is deliberately stripped from the persisted (plaintext)
      // AsyncStorage blob — it lives in the OS keystore instead (see
      // secure-credentials.ts) and is rehydrated by hydrateSecureCredentials().
      partialize: (state) => ({
        users: state.users.map(({ password, ...rest }) => rest),
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
  return users.map((u) => `${u.platform}:${u.username}:${u.link}=${u.password || ''}`).join('|');
}

let lastPasswordSnapshot = '';
useStore.subscribe((state) => {
  const snapshot = passwordSnapshot(state.users);
  if (snapshot === lastPasswordSnapshot) return;
  lastPasswordSnapshot = snapshot;
  for (const user of state.users) {
    if (user.password) void savePassword(user, user.password);
  }
});

/**
 * Populate in-memory passwords from the keystore after rehydration. For any
 * account that still carries a legacy plaintext password (from a pre-migration
 * install's AsyncStorage blob) it migrates that into the keystore instead.
 * Worst case if a password is missing everywhere: the user is asked to log in
 * again — never a hard lockout.
 */
export async function hydrateSecureCredentials(): Promise<void> {
  const users = useStore.getState().users;
  if (users.length === 0) return;

  const resolved = await Promise.all(
    users.map(async (user) => {
      if (user.password) {
        // Legacy plaintext survived rehydration — migrate it into the keystore.
        await savePassword(user, user.password);
        return user;
      }
      const stored = await loadPassword(user);
      return stored ? ({ ...user, password: stored } as User) : user;
    })
  );

  // Only touch state if something actually changed, to avoid a redundant render.
  if (resolved.some((u, i) => u.password !== users[i]!.password)) {
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
