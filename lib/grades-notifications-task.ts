import { currentUser } from '@/lib/store';
import { getClasses } from '@/lib/grades-api';
import { getInitialTerm, getLatestGradesLoad } from '@/lib/grades-store';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

export const GRADES_NOTIFICATIONS_TASK = 'gradexis-grades-notifications-check';

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

/**
 * Fetches the current term's classes, diffs each class's average against the
 * last stored snapshot for that term, and fires one notification per class
 * whose grade changed. `getClasses` already writes the fresh data back into
 * the grades store as a side effect, so no separate persistence step is
 * needed here.
 */
export async function checkGradesAndNotify(): Promise<boolean> {
  const user = currentUser();
  if (!user || !user.notificationsEnabled) {
    return false;
  }

  const term = getInitialTerm();
  if (!term) {
    return false;
  }

  const previousLoad = getLatestGradesLoad(term);
  const previousAverages = new Map<string, any>();
  for (const course of previousLoad?.classes ?? []) {
    previousAverages.set(courseKey(course.course, course.name), course.average);
  }

  let newClasses: Array<{ course: string; name: string; average?: any }> | null = null;
  for await (const chunk of getClasses(term)) {
    if (chunk?.success === true) {
      newClasses = chunk.classes;
    }
  }

  if (!newClasses) {
    return false;
  }

  let changed = false;
  for (const course of newClasses) {
    const key = courseKey(course.course, course.name);
    if (!previousAverages.has(key)) continue;

    const oldAverage = previousAverages.get(key);
    if (JSON.stringify(oldAverage) === JSON.stringify(course.average)) continue;
    if (oldAverage === undefined || oldAverage === null) continue;

    changed = true;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Grade updated',
        body: `Your grade for ${course.name} changed from a ${oldAverage} to ${course.average}.`,
      },
      trigger: null,
    });
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
