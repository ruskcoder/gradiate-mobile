import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type NativeGradeCheck = {
  enqueueGradeCheck?: () => Promise<void>;
};

const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<NativeGradeCheck>('GradeNotification') : null;

/**
 * Hands the background grade check to a WorkManager job (`GradeCheckWorker.kt`)
 * instead of running it inline in the push handler, where Android freezes the
 * process long before a portal fetch finishes.
 *
 * Returns false when that isn't possible — iOS, or an Android build from before
 * the worker existed — so the caller runs the check inline as it always did.
 */
export async function enqueueGradeCheck(): Promise<boolean> {
  if (!native?.enqueueGradeCheck) return false;
  try {
    await native.enqueueGradeCheck();
    return true;
  } catch (e) {
    console.warn('Could not queue background grade check; running it inline', e);
    return false;
  }
}
