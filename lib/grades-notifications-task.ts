import { currentUser, hydrateSecureCredentials, useStore } from '@/lib/store';
import { getClasses } from '@/lib/grades-api';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const GRADES_NOTIFICATIONS_TASK = 'gradiate-grades-notifications-check';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function courseKey(course: string, name: string): string {
  return `${course}|${name}`;
}

/** A grade cell with no real value — never notify to or from one of these
 *  (this is what produced "changed from 90 to undefined"). */
function isBlankGrade(v: any): boolean {
  return (
    v === undefined ||
    v === null ||
    v === '' ||
    (typeof v === 'number' && isNaN(v)) ||
    (typeof v === 'string' && (v.trim() === '' || isNaN(parseFloat(v))))
  );
}

/**
 * Fetches the freshest classes and diffs each class's average — for EVERY term
 * that's currently active — against the last stored snapshot of that term,
 * firing one notification per (class, term) whose grade changed.
 *
 * The API reports `currentTerms`: the set of columns whose window contains today
 * (e.g. a progress period P1, its cycle C1, and the semester S1 all at once),
 * finest last. We diff each of them so a change that only moves a semester or
 * cycle average still notifies, and we tag the term when more than one is active.
 * Blank cells are skipped on BOTH sides so a class that simply isn't graded in a
 * term never produces an "…to undefined" message.
 *
 * The previous averages are snapshotted BEFORE the fetch, because `getClasses`
 * writes the fresh data straight back into the store as a side effect.
 */
export async function checkGradesAndNotify(): Promise<boolean> {
  // This runs in the background JS context, where the store rehydrates from
  // AsyncStorage but the password + 2FA answer live in the OS keystore (stripped
  // from the persisted blob). Wait for both before fetching, or the request goes
  // out with no password ("username and password are required for credentials
  // login"). Foreground calls just no-op through here (already hydrated).
  if (!useStore.persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
      const unsub = useStore.persist.onFinishHydration(() => {
        unsub?.();
        resolve();
      });
      if (useStore.persist.hasHydrated()) resolve();
    });
  }
  await hydrateSecureCredentials();

  const user = currentUser();
  // Accounts saved before this preference existed have `undefined`; throughout
  // the UI that means enabled, so background execution must match.
  if (!user || user.notificationsEnabled === false) {
    return false;
  }
  // Nothing to fetch with if credentials never made it back from the keystore.
  if (user.loginType === 'credentials' && (!user.username || !user.password)) {
    return false;
  }

  // Snapshot prior per-term averages up front. `history` is keyed
  // term -> courseKey -> [snapshots]; the last snapshot is the previous value.
  const historyBefore: any = useStore.getState().getGradesStore().history || {};
  const prevAverage = (term: string, key: string) => {
    const snaps = historyBefore?.[term]?.[key];
    return Array.isArray(snaps) && snaps.length ? snaps[snaps.length - 1].average : undefined;
  };

  // Don't notify off a stale cached snapshot — force a live fetch.
  useStore.getState().clearCache();

  let chunk: any = null;
  for await (const c of getClasses()) {
    if (c?.success === true) chunk = c;
  }
  if (!chunk || !Array.isArray(chunk.classes)) {
    return false;
  }

  // Every currently-active term, finest last. Portals that don't send the set
  // (e.g. HAC) fall back to their single current term.
  const currentTerms: string[] =
    Array.isArray(chunk.currentTerms) && chunk.currentTerms.length
      ? chunk.currentTerms
      : chunk.term
        ? [chunk.term]
        : [];
  if (currentTerms.length === 0) {
    return false;
  }
  const multi = currentTerms.length > 1;

  let changed = false;
  for (const term of currentTerms) {
    for (const course of chunk.classes) {
      const key = courseKey(course.course, course.name);
      // "terms" format carries a per-term `averages` map; single-term formats
      // (HAC / detail) carry a flat `average` for the one term they represent.
      const newAverage =
        course.averages && typeof course.averages === 'object'
          ? course.averages[term]
          : term === chunk.term
            ? course.average
            : undefined;
      const oldAverage = prevAverage(term, key);

      if (isBlankGrade(oldAverage) || isBlankGrade(newAverage)) continue;
      if (String(oldAverage) === String(newAverage)) continue;

      changed = true;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Grade updated',
          body: multi
            ? `${course.name} (${term}) changed from ${oldAverage} to ${newAverage}.`
            : `Your grade for ${course.name} changed from ${oldAverage} to ${newAverage}.`,
          ...(Platform.OS === 'android' ? { sound: 'default' } : {}),
        },
        trigger: Platform.OS === 'android' ? { channelId: 'grades' } : null,
      });
    }
  }

  return changed;
}

TaskManager.defineTask(GRADES_NOTIFICATIONS_TASK, async () => {
  try {
    await checkGradesAndNotify();
    const BackgroundTask = await import('expo-background-task');
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.error('Grades notification background task failed', e);
    const BackgroundTask = await import('expo-background-task');
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

async function requestNotificationPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const request = await Notifications.requestPermissionsAsync();
  return request.granted;
}

/** Registers (or unregisters) the hourly background grade check. Call this
 *  whenever the "Notifications" setting is toggled, and once on app start if
 *  it's already enabled, so the task survives app restarts. */
export async function setGradesNotificationsEnabled(enabled: boolean): Promise<void> {
  const BackgroundTask = await import('expo-background-task');

  if (enabled) {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('grades', {
        name: 'Grade updates',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    await BackgroundTask.registerTaskAsync(GRADES_NOTIFICATIONS_TASK, {
      minimumInterval: 60, // minutes; OS schedules opportunistically around this.
    });
  } else {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(GRADES_NOTIFICATIONS_TASK);
    if (isRegistered) {
      await BackgroundTask.unregisterTaskAsync(GRADES_NOTIFICATIONS_TASK);
    }
  }
}
