import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { API_URL } from '@/lib/constants';
import { currentUser } from '@/lib/store';
import { checkGradesAndNotify } from '@/lib/grades-notifications-task';

export const PUSH_TRIGGER_TASK = 'gradexis-push-trigger';

/**
 * Handles the server's silent "go fetch" push. The API never sees the user's
 * credentials, so it can't fetch grades itself — it only sends a content-less
 * trigger. When that arrives (iOS via `_contentAvailable`, Android via a
 * high-priority data message) we run the same diff-and-notify the background
 * timer uses. This is the primary path; the timer in `grades-notifications-task`
 * is the fallback for when the OS drops the silent push.
 */
TaskManager.defineTask(PUSH_TRIGGER_TASK, async ({ error }) => {
  if (error) {
    console.error('Push trigger task error', error);
    return;
  }
  try {
    await checkGradesAndNotify();
  } catch (e) {
    console.error('Push-triggered grade check failed', e);
  }
});

async function requestPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const request = await Notifications.requestPermissionsAsync();
  return request.granted;
}

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId
  );
}

/**
 * Register this device's Expo push token with the API so the server can send
 * the periodic "go fetch" trigger. Safe to call on every app load — the API
 * upserts on the token, so repeat calls just refresh the existing row instead
 * of creating duplicates. No-ops when the account has notifications disabled.
 */
export async function subscribeForPush(): Promise<void> {
  try {
    // Background tasks and background remote notifications don't exist in Expo
    // Go — they only run in a development/production build. Bail early there so
    // we don't throw trying to bind native modules that aren't present.
    if (Constants.appOwnership === 'expo') {
      console.log('Push subscribe skipped: not supported in Expo Go (use a dev build)');
      return;
    }

    const user = currentUser();
    if (!user) {
      console.log('Push subscribe skipped: no user logged in');
      return;
    }
    if (!user.notificationsEnabled) {
      console.log('Push subscribe skipped: notifications disabled in settings');
      return;
    }

    const granted = await requestPermission();
    if (!granted) {
      console.log('Push subscribe skipped: notification permission not granted');
      return;
    }

    const projectId = getProjectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (!token) {
      console.log('Push subscribe skipped: no Expo push token returned');
      return;
    }

    // Register the background task the silent push wakes. Isolated so a native
    // config gap here still lets the token registration below succeed.
    try {
      await Notifications.registerTaskAsync(PUSH_TRIGGER_TASK);
    } catch (e) {
      console.warn('Could not register background push task', e);
    }

    const base = API_URL.replace(/\/$/, '');
    const res = await fetch(`${base}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: { token },
        platform: 'expo',
      }),
    });
    console.log(`Push subscribe -> ${base}/subscribe returned ${res.status} (token ${token})`);
  } catch (e) {
    console.warn('Push subscribe failed', e);
  }
}
