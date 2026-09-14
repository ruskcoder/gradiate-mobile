import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * Grade notifications whose large icon is a generated image: a coloured square
 * carrying the new average in big bold type, with the signed change below it in
 * a pill — green when the grade rose, red when it fell.
 *
 * Backed by the local `grade-notification` native module. `expo-notifications`
 * resolves its Android large icon from a single manifest meta-data resource, so
 * every notification it presents carries the same static image — there is no
 * per-notification hook for a bitmap. The module draws and posts the whole
 * notification instead.
 *
 * Android only, and only in a native build. Anywhere the module isn't linked
 * (iOS, web, Expo Go, a build made before this shipped) `presentGradeImageNotification`
 * returns false and the caller falls back to a plain text notification, so no
 * call site needs a platform branch.
 */

type NativeGradeNotification = {
  present(
    title: string,
    body: string,
    grade: string,
    delta: string | null,
    color: string,
    channelId: string,
    sound: string | null
  ): Promise<void>;
};

const native = requireOptionalNativeModule<NativeGradeNotification>('GradeNotification');

/** True when a notification image can actually be drawn on this build. */
export function canRenderGradeImage(): boolean {
  return Platform.OS === 'android' && native != null;
}

/**
 * The square's fill, on the same thresholds as the in-app grade chips
 * (`gradeAndColor` in `components/custom/grades-item.tsx`) so a notification and
 * the row it's about are the same colour.
 */
export function gradeImageColor(grade: number): string {
  if (!isFinite(grade)) return '#9ca3af';
  if (grade >= 90) return '#22c55e';
  if (grade >= 80) return '#3b82f6';
  if (grade >= 70) return '#eab308';
  return '#ef4444';
}

/**
 * Trims a grade to something that fits a ~48dp icon: at most one decimal, and
 * no trailing ".0". 96.55 -> "96.6", 100 -> "100".
 */
export function formatGradeForImage(value: number | string): string {
  const numeric = typeof value === 'number' ? value : parseFloat(String(value));
  if (!isFinite(numeric)) return String(value ?? '');
  return String(Math.round(numeric * 10) / 10);
}

/** Always signed, so the second line reads as a change rather than a value.
 *  A difference too small to show at one decimal renders as "±0". */
export function formatDeltaForImage(oldValue: number | string, newValue: number | string): string {
  const previous = typeof oldValue === 'number' ? oldValue : parseFloat(String(oldValue));
  const next = typeof newValue === 'number' ? newValue : parseFloat(String(newValue));
  if (!isFinite(previous) || !isFinite(next)) return '';

  const delta = Math.round((next - previous) * 10) / 10;
  if (delta === 0) return '±0';
  return `${delta > 0 ? '+' : '-'}${Math.abs(delta)}`;
}

export interface GradeImageNotification {
  title: string;
  body: string;
  /** The new average. Drives both the big number and the square's colour. */
  newAverage: number | string;
  /** The previous average, for the signed second line. Omit to draw the grade alone. */
  oldAverage?: number | string;
  channelId: string;
  sound?: string | null;
}

/**
 * Posts the notification with its generated image. Returns false — having shown
 * nothing — when the native module isn't present or the post is refused (most
 * likely POST_NOTIFICATIONS was never granted), so the caller can fall back.
 */
export async function presentGradeImageNotification(
  options: GradeImageNotification
): Promise<boolean> {
  if (!native) return false;

  const numeric =
    typeof options.newAverage === 'number'
      ? options.newAverage
      : parseFloat(String(options.newAverage));

  try {
    await native.present(
      options.title,
      options.body,
      formatGradeForImage(options.newAverage),
      options.oldAverage === undefined
        ? null
        : formatDeltaForImage(options.oldAverage, options.newAverage),
      gradeImageColor(numeric),
      options.channelId,
      options.sound ?? null
    );
    return true;
  } catch (e) {
    console.warn('Grade image notification failed, falling back to text', e);
    return false;
  }
}
