/**
 * App entry.
 *
 * The background tasks are imported here, for their side effects, BEFORE
 * expo-router boots.
 *
 * Their `TaskManager.defineTask` calls previously ran only via modules imported
 * by `app/_layout.tsx` — a React component module, which is evaluated as part of
 * rendering the UI. When Android wakes the app headlessly for a push there is no
 * UI to render, so those modules never ran: the native side restored the task
 * registration, dispatched the event, and JS answered
 *
 *     W/ReactNativeJS: No task registered for key expo-task-manager
 *
 * and did nothing. That is why a grade change only ever notified once the app
 * had been opened — the exact opposite of what the push trigger is for.
 *
 * Importing them at the entry runs the registrations at bundle evaluation in
 * every context, headless or not. Keep these above `expo-router/entry`.
 */
import './lib/grades-notifications-task';
import './lib/push-subscribe';

import 'expo-router/entry';
