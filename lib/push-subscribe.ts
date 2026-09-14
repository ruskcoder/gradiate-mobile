import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { API_URL } from '@/lib/constants';
import { currentUser } from '@/lib/store';
import { checkGradesAndNotify, ensureGradesChannel } from '@/lib/grades-notifications-task';
import { enqueueGradeCheck } from '@/lib/grade-check-worker';
import { consumePushTrigger, logPushReceived, markPushPending } from '@/lib/grade-check-log';

export const PUSH_TRIGGER_TASK = 'gradiate-push-trigger';

/** When this device last posted its push token to the API. */
const LAST_SUBSCRIBED_KEY = 'push-last-subscribed-at';
/** How stale that may get before a background run re-posts it. */
const RESUBSCRIBE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Handles the server's silent "go fetch" push. The API never sees the user's
 * credentials, so it can't fetch grades itself — it only sends a content-less
 * trigger. When that arrives (iOS via `_contentAvailable`, Android via a
 * high-priority data message) we run the same diff-and-notify the background
 * timer uses. This is the primary path; the timer in `grades-notifications-task`
 * is the fallback for when the OS drops the silent push.
 *
 * On Android the check is handed to a WorkManager job instead of running here.
 * This handler executes in a process nothing holds up — FCM's service finishes
 * the moment the event is dispatched — and Android freezes such a process within
 * seconds, far sooner than a portal login and scrape completes. Enqueueing takes
 * milliseconds, so it always lands inside FCM's window, and the job keeps the
 * process alive, with network, for the real work. See `GradeCheckWorker.kt`.
 * iOS, and Android builds from before the worker existed, still run it inline.
 */
TaskManager.defineTask(PUSH_TRIGGER_TASK, async ({ error }) => {
  if (error) {
    console.error('Push trigger task error', error);
    return;
  }
  await logPushReceived();
  try {
    await markPushPending();
    if (await enqueueGradeCheck()) return;
    // No job will pick the marker up, so don't leave it to mislabel the next
    // hourly run.
    await consumePushTrigger();
    await checkGradesAndNotify('push');
  } catch (e) {
    console.error('Push-triggered grade check failed', e);
  }
});

/**
 * FCM rotates device tokens from time to time. The API only learns a device's
 * token when the app posts it, and the server prunes a token the first time Expo
 * reports it unregistered — after which that device gets no triggers at all
 * until the app happens to be opened. Re-post whenever the token changes. This
 * only fires while JS is running; `refreshPushSubscriptionIfStale` covers the
 * rest from the background task.
 */
if (Platform.OS !== 'web' && Constants.appOwnership !== 'expo') {
  Notifications.addPushTokenListener(() => {
    void subscribeForPush({ interactive: false });
  });
}

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
 *
 * `interactive: false` never prompts for notification permission — for the
 * background and token-rotation callers, where there is no UI to prompt from.
 */
export async function subscribeForPush({ interactive = true }: { interactive?: boolean } = {}): Promise<void> {
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
    // Older persisted accounts predate this setting. The UI intentionally
    // treats an absent value as enabled, so registration must do the same.
    if (user.notificationsEnabled === false) {
      console.log('Push subscribe skipped: notifications disabled in settings');
      return;
    }

    const granted = interactive
      ? await requestPermission()
      : (await Notifications.getPermissionsAsync()).granted;
    if (!granted) {
      console.log('Push subscribe skipped: notification permission not granted');
      return;
    }

    await ensureGradesChannel();

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
    if (!res.ok) {
      const message = await res.text();
      throw new Error(`Subscription API returned ${res.status}: ${message}`);
    }
    await AsyncStorage.setItem(LAST_SUBSCRIBED_KEY, String(Date.now())).catch(() => {});
    // Don't log the token itself — it's a device credential and Hermes keeps
    // console.* output in release builds.
    console.log(`Push subscribe -> ${base}/subscribe returned ${res.status}`);
  } catch (e) {
    console.warn('Push subscribe failed', e);
  }
}

/**
 * Re-posts this device's push token if the API hasn't heard it in a day. Called
 * from the background grade task, so a token that was rotated or pruned
 * server-side heals without the app being opened. Never prompts.
 */
export async function refreshPushSubscriptionIfStale(): Promise<void> {
  try {
    const last = Number(await AsyncStorage.getItem(LAST_SUBSCRIBED_KEY)) || 0;
    if (Date.now() - last < RESUBSCRIBE_INTERVAL_MS) return;
  } catch {
    // Unreadable timestamp: fall through and re-register.
  }
  await subscribeForPush({ interactive: false });
}
