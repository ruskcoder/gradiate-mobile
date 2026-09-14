// ===========================================================================
// DISABLED: silent background-fetch progress notification.
//
// Whole-file line comments rather than a /* */ wrapper, because the doc blocks
// below would close it early. See the note at the bottom of
// `lib/grades-notifications-task.ts` for the full re-enable checklist.
// ===========================================================================
// import { requireOptionalNativeModule } from 'expo';
//
// /**
//  * The silent progress notification shown while a background grade check is
//  * streaming, plus the cancel signal its "Cancel" button produces.
//  *
//  * Backed by the local `progress-notification` native module — Android only,
//  * because a progress bar in a notification is an Android concept
//  * (`NotificationCompat.setProgress`) with no iOS equivalent. Everywhere else
//  * (iOS, web, Expo Go, where the module isn't linked at all) this degrades to a
//  * no-op session that never cancels, so callers need no platform branches.
//  */
//
// type NativeProgressNotification = {
//   show(title: string, message: string, percent: number, indeterminate: boolean): Promise<void>;
//   hide(): Promise<void>;
//   addListener(event: 'onCancel', listener: () => void): { remove(): void };
// };
//
// const native = requireOptionalNativeModule<NativeProgressNotification>('ProgressNotification');
//
// /** Returned by `race` in place of the promise's value when the user cancels. */
// export const FETCH_CANCELLED = Symbol('fetch-cancelled');
//
// export type FetchProgress = {
//   /** Redraw the notification. `percent` is 0-100, matching the API's chunks. */
//   update(percent: number, message: string): void;
//   /** True once the user has tapped Cancel. */
//   isCancelled(): boolean;
//   /**
//    * Settle on `promise`, or on `FETCH_CANCELLED` if the user cancels first.
//    * Lets a stalled stream be interrupted mid-chunk instead of only at the next
//    * chunk boundary.
//    */
//   race<T>(promise: Promise<T>): Promise<T | typeof FETCH_CANCELLED>;
//   /** Dismiss the notification and release this session. Idempotent. */
//   end(): void;
// };
//
// /**
//  * One notification is shared by however many checks are in flight, because the
//  * push trigger and the hourly fallback task can overlap: two sessions would
//  * otherwise fight over the same notification slot and the first one to finish
//  * would dismiss the other's indicator. Refcounted, so the notification stays up
//  * until the last check finishes and Cancel stops all of them at once.
//  */
// type Session = {
//   refs: number;
//   cancelled: boolean;
//   subscription: { remove(): void } | null;
//   cancelPromise: Promise<typeof FETCH_CANCELLED>;
//   resolveCancel: () => void;
// };
//
// let session: Session | null = null;
//
// function endSession() {
//   if (!session) return;
//   session.subscription?.remove();
//   session = null;
//   native?.hide();
// }
//
// function startSession(): Session {
//   let resolveCancel!: () => void;
//   const cancelPromise = new Promise<typeof FETCH_CANCELLED>((resolve) => {
//     resolveCancel = () => resolve(FETCH_CANCELLED);
//   });
//
//   const created: Session = {
//     refs: 0,
//     cancelled: false,
//     subscription: null,
//     cancelPromise,
//     resolveCancel,
//   };
//
//   created.subscription =
//     native?.addListener('onCancel', () => {
//       // The native side has already pulled the notification down; all that is
//       // left is to let every in-flight check unwind.
//       created.cancelled = true;
//       created.resolveCancel();
//       created.subscription?.remove();
//       // Retire the session immediately instead of waiting for the last `end()`.
//       // A trigger that arrives while the cancelled checks are still unwinding
//       // then starts a clean session rather than inheriting a stale cancel; the
//       // outstanding handles still see their own session as cancelled, and their
//       // `end()` no-ops because it is no longer the current one.
//       if (session === created) session = null;
//     }) ?? null;
//
//   return created;
// }
//
// /**
//  * Put up the progress notification (or join the one already up) and hand back a
//  * handle for driving it. Every call must be paired with `end()`, normally from
//  * a `finally`.
//  */
// export function beginFetchProgress(title = 'Checking grades'): FetchProgress {
//   if (!session) {
//     session = startSession();
//     native?.show(title, 'Starting…', 0, true);
//   }
//   const owned = session;
//   owned.refs += 1;
//
//   let ended = false;
//
//   return {
//     update(percent: number, message: string) {
//       if (ended || session !== owned || owned.cancelled) return;
//       native?.show(title, message, percent, false);
//     },
//     isCancelled() {
//       return owned.cancelled;
//     },
//     race<T>(promise: Promise<T>) {
//       if (owned.cancelled) return Promise.resolve(FETCH_CANCELLED);
//       return Promise.race([promise, owned.cancelPromise]);
//     },
//     end() {
//       if (ended) return;
//       ended = true;
//       owned.refs -= 1;
//       if (owned.refs <= 0 && session === owned) endSession();
//     },
//   };
// }
