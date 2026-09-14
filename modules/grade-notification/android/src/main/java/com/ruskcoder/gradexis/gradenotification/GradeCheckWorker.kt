package com.ruskcoder.gradexis.gradenotification

import android.content.Context
import android.os.Build
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import expo.modules.backgroundtask.BackgroundTaskConsumer
import expo.modules.interfaces.taskManager.TaskServiceProviderHelper
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Runs the background grade check under a WorkManager job when the server's
 * silent push arrives, instead of inside the push handler itself.
 *
 * The push path used to run the whole check straight from expo-notifications'
 * `onMessageReceived` -> TaskManager dispatch. Nothing on that path holds the
 * process up: the FCM service finishes as soon as the event is handed to JS, and
 * expo-task-manager's headless task only keeps JS *timers* ticking
 * (`TaskService.maybeStartHeadlessTask`), not the process. The app drops to a
 * cached process within seconds, and Android 14+ freezes cached processes — while
 * a grade check is a full portal login plus scrape that routinely takes longer
 * than that. Quick fetches squeezed through; slow ones froze mid-request and
 * never notified.
 *
 * A running worker is a JobScheduler job, so the process stays up, with network,
 * for as long as the check needs. The push handler now only enqueues this, which
 * takes milliseconds and always fits inside FCM's window.
 *
 * It executes the task the app already registered with expo-background-task (the
 * hourly check) rather than a second copy, so there is one definition of "the
 * check", and turning notifications off — which unregisters that task — turns
 * this off too.
 */
class GradeCheckWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    val taskService = TaskServiceProviderHelper.getTaskServiceImpl(applicationContext)
    if (taskService == null) {
      Log.w(TAG, "No task service available; nothing to run")
      return Result.success()
    }

    val consumers = taskService
      .getTaskConsumers(applicationContext.packageName)
      .filterIsInstance<BackgroundTaskConsumer>()
    if (consumers.isEmpty()) {
      // Notifications are off for this account, so the check isn't registered.
      Log.d(TAG, "No background grade task registered; skipping")
      return Result.success()
    }

    for (consumer in consumers) {
      val finished = CompletableDeferred<Unit>()
      try {
        consumer.executeTask { finished.complete(Unit) }
      } catch (e: Exception) {
        Log.e(TAG, "Could not start grade check: ${e.message}")
        continue
      }
      // Backstop only: JS gives the check its own, shorter deadline. Without one
      // here, a check that never reported back would hold the unique work slot
      // until WorkManager killed it, and KEEP (below) would drop every push that
      // arrived in the meantime.
      if (withTimeoutOrNull(RUN_TIMEOUT_MS) { finished.await() } == null) {
        Log.w(TAG, "Grade check did not report back within ${RUN_TIMEOUT_MS / 1000}s")
      }
    }

    // Always success. A failed check is retried by the next push or the hourly
    // run regardless, and a WorkManager retry on top would only burn quota.
    return Result.success()
  }

  companion object {
    private const val TAG = "GradeCheckWorker"
    private const val UNIQUE_NAME = "GRADIATE_PUSH_GRADE_CHECK"

    // Under WorkManager's 10-minute execution cap, so the worker ends on its own
    // terms rather than being stopped and rescheduled by the system.
    private const val RUN_TIMEOUT_MS = 8L * 60L * 1000L

    fun enqueue(context: Context) {
      val builder = OneTimeWorkRequestBuilder<GradeCheckWorker>()
        .setConstraints(
          Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        )
      // Expedited is what lets push-triggered work start promptly from the
      // background: expedited jobs are exempt from Doze and App Standby deferral,
      // within a quota. Below API 31 an expedited request runs as a foreground
      // service and must supply a notification through getForegroundInfo, which
      // this worker doesn't, so older devices get an ordinary request instead.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        builder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
      }
      // KEEP: pushes can arrive bunched (a deferred batch released together).
      // One check already queued or running covers all of them.
      WorkManager.getInstance(context)
        .enqueueUniqueWork(UNIQUE_NAME, ExistingWorkPolicy.KEEP, builder.build())
    }
  }
}
