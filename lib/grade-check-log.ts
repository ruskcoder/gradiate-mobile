import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A short, persisted record of background grade-check activity: when a push
 * arrived, and what each check concluded.
 *
 * The check runs headless and leaves no trace when it decides not to notify, so
 * "notifications are intermittent" was impossible to tell apart from "no grade
 * changed". `console.log` only reaches `adb logcat`, and only with a cable
 * plugged in. This keeps the last few runs on the device for Settings to show.
 */

/** `push`: started by the server's silent push. `hourly`: the WorkManager fallback. */
export type GradeCheckTrigger = 'push' | 'hourly';

export type GradeCheckLogEntry =
  | { at: number; kind: 'push' }
  | { at: number; kind: 'check'; trigger: GradeCheckTrigger; durationMs: number; outcome: string };

const LOG_KEY = 'grade-check-log';
const MAX_ENTRIES = 30;

const PUSH_MARKER_KEY = 'grade-check-push-pending';
/** A queued check that starts within this long of a push is attributed to it. */
const PUSH_ATTRIBUTION_MS = 15 * 60 * 1000;

export async function readGradeCheckLog(): Promise<GradeCheckLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as GradeCheckLogEntry[]) : [];
  } catch {
    return [];
  }
}

// Writes are chained so a push entry and a check entry landing together in the
// same JS context can't read-modify-write over each other.
let pendingWrite: Promise<void> = Promise.resolve();

function append(entry: GradeCheckLogEntry): Promise<void> {
  pendingWrite = pendingWrite.then(async () => {
    try {
      const entries = await readGradeCheckLog();
      entries.unshift(entry);
      await AsyncStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch {
      // Diagnostics only; logging must never break a check.
    }
  });
  return pendingWrite;
}

export function logPushReceived(): Promise<void> {
  return append({ at: Date.now(), kind: 'push' });
}

export function logCheck(trigger: GradeCheckTrigger, startedAt: number, outcome: string): Promise<void> {
  return append({
    at: startedAt,
    kind: 'check',
    trigger,
    durationMs: Date.now() - startedAt,
    outcome,
  });
}

/**
 * The push handler queues the check as a background job, and that job runs the
 * same task the hourly fallback does, so the task alone can't tell which woke
 * it. The handler leaves this marker for the next run to pick up.
 */
export async function markPushPending(): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_MARKER_KEY, String(Date.now()));
  } catch {
    // Only affects the log's label.
  }
}

/** Reads and clears the marker. True when a push queued the run now starting. */
export async function consumePushTrigger(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_MARKER_KEY);
    if (!raw) return false;
    await AsyncStorage.removeItem(PUSH_MARKER_KEY);
    return Date.now() - Number(raw) < PUSH_ATTRIBUTION_MS;
  } catch {
    return false;
  }
}

// Formatted by hand rather than through Intl, whose output varies with the
// device's locale data under Hermes.
function formatWhen(at: number): string {
  const d = new Date(at);
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hours % 12 || 12}:${minutes}${hours < 12 ? 'am' : 'pm'}`;
}

/** One line per entry, newest first, for display in an alert. */
export function describeGradeCheckLog(entries: GradeCheckLogEntry[]): string {
  return [...entries]
    .sort((a, b) => b.at - a.at)
    .map((e) =>
      e.kind === 'push'
        ? `${formatWhen(e.at)}  push received`
        : `${formatWhen(e.at)}  ${e.trigger}: ${e.outcome} (${Math.round(e.durationMs / 1000)}s)`
    )
    .join('\n');
}
