import { currentUser, hydrateSecureCredentials, useStore } from '@/lib/store';
import { getClasses } from '@/lib/grades-api';
// Disabled — see the note above `streamClassesWithProgress` at the bottom of
// this file for what re-enabling the progress notification involves.
// import { beginFetchProgress, FETCH_CANCELLED, type FetchProgress } from '@/lib/fetch-progress';
import { loadBaseline } from '@/lib/notification-baseline';
import { presentGradeImageNotification } from '@/lib/grade-notification-image';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const GRADES_NOTIFICATIONS_TASK = 'gradiate-grades-notifications-check';

/**
 * Android bakes a channel's sound in when the channel is first created and
 * ignores every later change to it — the user owns those settings from then on.
 * So switching off the system default meant publishing a NEW channel id;
 * updating the old one in place would have been silently discarded on every
 * device that had already run the app. `LEGACY_GRADES_CHANNEL_ID` is deleted on
 * the way past so the dead channel doesn't linger in system settings.
 */
export const GRADES_CHANNEL_ID = 'grades-v2';
const LEGACY_GRADES_CHANNEL_ID = 'grades';

/** Resource name of the bundled sound. Android resolves it out of `res/raw`,
 *  iOS out of the app bundle; `app.json` -> expo-notifications -> `sounds`
 *  puts the same file in both. The `.wav` matters: iOS notification sounds
 *  only play aiff/wav/caf, never mp3. */
export const NOTIFICATION_SOUND = 'notification.wav';

/** Shared by both presentation paths so the row header reads the same whether
 *  the notification was drawn natively or scheduled through expo. */
const NOTIFICATION_TITLE = 'Grade updated';

/** Creates (or refreshes) the grades channel. Shared with `push-subscribe`, so
 *  whichever path runs first defines the channel identically. */
export async function ensureGradesChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(GRADES_CHANNEL_ID, {
    name: 'Grade updates',
    importance: Notifications.AndroidImportance.HIGH,
    sound: NOTIFICATION_SOUND,
  });
  await Notifications.deleteNotificationChannelAsync(LEGACY_GRADES_CHANNEL_ID).catch(() => {});
}

/**
 * `shouldPlaySound` must stay true. It doesn't only mute the sound: expo reads
 * it for vibration as well (`ExpoNotificationBuilder.shouldVibrate` checks
 * `shouldPlaySound`, not a vibration flag of its own), so a false here makes
 * both false, which trips `builder.setSilent(true)`. Android never shows a
 * silent notification as a heads-up banner — it lands in the shade unannounced,
 * which reads as the notification simply not firing. The channel still owns the
 * actual sound on Android; this only decides whether the notification may alert
 * at all.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function courseKey(course: string, name: string): string {
  return `${course}|${name}`;
}

/**
 * Presents one grade-change notification, preferring the generated grade image
 * and degrading to plain text.
 *
 * The image path bypasses `expo-notifications` entirely (see
 * `grade-notification-image.ts` for why it has to), so it can fail in ways the
 * text path can't — an old build without the native module, a revoked
 * POST_NOTIFICATIONS. It reports that by returning false rather than throwing,
 * and the change still gets through as text.
 */
async function notifyGradeChange(
  courseName: string,
  term: string | null,
  oldAverage: any,
  newAverage: any,
  withImage: boolean
): Promise<void> {
  // `term` is tagged on only when several terms are active at once, so a change
  // that moves a cycle and a semester is still tellable apart.
  const subject = term ? `${courseName} (${term})` : courseName;

  // With the image off the notification carries no numbers at all, not even in
  // the text. That is the whole point of the setting: the grade never leaves the
  // app, so it can't sit on a lock screen either. Keyed off the setting rather
  // than off whether the image actually rendered, so a device that falls back to
  // text still respects the choice.
  const body = withImage
    ? `Your grade for ${subject} changed from ${oldAverage} to ${newAverage}.`
    : `Your grade for ${subject} has changed.`;

  if (withImage) {
    const shown = await presentGradeImageNotification({
      title: NOTIFICATION_TITLE,
      body,
      newAverage,
      oldAverage,
      channelId: GRADES_CHANNEL_ID,
      sound: NOTIFICATION_SOUND,
    });
    if (shown) return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: NOTIFICATION_TITLE,
      body,
      // iOS plays this directly. On Android the channel's sound wins, but
      // it's set here too so both platforms name the same asset.
      sound: NOTIFICATION_SOUND,
    },
    trigger: Platform.OS === 'android' ? { channelId: GRADES_CHANNEL_ID } : null,
  });
}

/**
 * Fires a sample grade notification immediately, without touching the portal or
 * the stored baseline — the only way to see what the notification actually looks
 * like short of waiting for a real grade to move.
 *
 * Shows up as a heads-up banner even with the app in the foreground: the image
 * path posts straight to the system, and the text fallback is covered by
 * `shouldShowBanner` in the handler above.
 */
export async function sendTestGradeNotification(withImage: boolean): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) throw new Error('Notification permission was not granted.');
  await ensureGradesChannel();

  await notifyGradeChange('AP Test Course', null, 92.3, 94.6, withImage);
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
  // Same `undefined means on` convention as `notificationsEnabled` above, so
  // accounts saved before this preference existed get the image by default.
  const withImage = user.gradeImageNotifications !== false;

  // Snapshot prior per-term averages up front, from the PERSISTED baseline.
  // This used to read `gradesStore.history`, which lives only in memory — so a
  // headless background wake (the whole point of the push trigger) always saw an
  // empty history and skipped every class as "previously blank". Reading it here
  // is safe against the write inside `getClasses` below, which happens after.
  const baselineBefore = await loadBaseline();
  const prevAverage = (term: string, key: string) => baselineBefore?.[term]?.[key];

  // Don't notify off a stale cached snapshot — force a live fetch.
  useStore.getState().clearCache();

  let chunk: any = null;
  for await (const c of getClasses()) {
    if (c?.success === true) chunk = c;
  }
  // --- progress notification (disabled) -------------------------------------
  // Replaces the loop above; drives the same stream but mirrors each chunk
  // into the silent progress notification and honours its Cancel button.
  //   const progress = beginFetchProgress();
  //   try {
  //     const chunk = await streamClassesWithProgress(progress);
  //     ... everything below, up to `return changed`, indented one level ...
  //   } finally {
  //     progress.end();
  //   }
  // --------------------------------------------------------------------------
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

  // This whole check runs headless and invisibly, so when it decides NOT to
  // notify there is otherwise no way to tell why. Logged via console so it lands
  // in `adb logcat -s ReactNativeJS:V` (Hermes keeps console output in release).
  console.log(
    `[grades-check] terms=${JSON.stringify(currentTerms)} classes=${chunk.classes.length} ` +
    `baselineTerms=${JSON.stringify(Object.keys(baselineBefore))}`
  );

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

      if (isBlankGrade(oldAverage) || isBlankGrade(newAverage)) {
        console.log(`[grades-check] skip ${key} @${term}: old=${oldAverage} new=${newAverage} (blank)`);
        continue;
      }
      if (String(oldAverage) === String(newAverage)) continue;

      console.log(`[grades-check] CHANGED ${key} @${term}: ${oldAverage} -> ${newAverage}`);
      changed = true;
      await notifyGradeChange(
        course.name,
        multi ? term : null,
        oldAverage,
        newAverage,
        withImage
      );
    }
  }

  return changed;
}

/*
 * ===========================================================================
 * DISABLED: silent background-fetch progress notification.
 *
 * Shows an ongoing, silent Android notification with a real progress bar while
 * a push- or timer-triggered grade check streams, plus a Cancel button that
 * drops the fetch. To re-enable:
 *
 *   1. Rename `modules/progress-notification/expo-module.config.json.disabled`
 *      back to `expo-module.config.json` so autolinking picks the native module
 *      up (`package.json` already points `nativeModulesDir` at `./modules`).
 *      Needs a fresh `expo prebuild` + build — a new Gradle project can't ship
 *      as an OTA update.
 *   2. Uncomment the body of `lib/fetch-progress.ts`.
 *   3. Uncomment the `signal` plumbing in `streamPost` / `getClasses` in
 *      `lib/grades-api.ts` (three spots, each marked).
 *   4. Uncomment the import at the top of this file, the block marked
 *      "progress notification (disabled)" in `checkGradesAndNotify`, and the
 *      helper below.
 *
 * Drives the `getClasses` stream, mirroring every progress chunk into the
 * notification, and returns the final `success` chunk — or `null` if the user
 * cancelled.
 *
 * Walked with an explicit iterator rather than `for await` because a `for await`
 * can only be broken out of *between* chunks, and the fetch worth cancelling is
 * precisely the one that has stopped producing them. Racing each `next()`
 * against the Cancel signal lets it be dropped mid-chunk; the AbortController
 * then tears the request down so the generator can finish.
 * ===========================================================================
 *
 * async function streamClassesWithProgress(progress: FetchProgress): Promise<any | null> {
 *   const controller = new AbortController();
 *   const stream = getClasses(undefined, controller.signal);
 *   let chunk: any = null;
 *
 *   while (true) {
 *     const step = await progress.race(stream.next());
 *
 *     if (step === FETCH_CANCELLED) {
 *       console.log('[grades-check] cancelled from the progress notification');
 *       controller.abort();
 *       // Safe to await only because the abort above guarantees the pending
 *       // `next()` settles — `.return()` queues behind it.
 *       await stream.return?.(undefined);
 *       return null;
 *     }
 *
 *     if (step.done) return chunk;
 *
 *     const value = step.value;
 *     if (value?.percent !== undefined && value?.message !== undefined) {
 *       progress.update(Number(value.percent) || 0, String(value.message));
 *     }
 *     if (value?.success === true) {
 *       chunk = value;
 *       progress.update(100, 'Checking for changes…');
 *     }
 *   }
 * }
 */

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

    await ensureGradesChannel();

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
