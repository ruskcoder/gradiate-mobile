package com.ruskcoder.gradexis.progressnotification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * A single ongoing, silent progress notification for the background grade check.
 *
 * `expo-notifications` can't do this: its Android builder exposes no
 * `setProgress`, so a notification posted through it can only ever carry text.
 * This module owns one notification slot and rebuilds it in place on every
 * `show` call, which is what makes the bar move instead of stacking rows.
 *
 * The "Cancel" action fires a PendingIntent broadcast back into this process.
 * The receiver is registered at runtime, so it exists only while the JS context
 * running the fetch does — there is no manifest receiver that could be woken up
 * with no JS around to answer it. A cancel arriving after teardown matches
 * nothing, and `OnDestroy` has already pulled the notification down by then.
 */
class ProgressNotificationModule : Module() {
  private var cancelReceiver: BroadcastReceiver? = null
  private var cachedContext: Context? = null

  /**
   * The process-wide application context, cached on first use.
   *
   * Deliberately not `appContext.reactContext` at every call site: the receiver
   * must be unregistered against the same context it was registered on, and
   * `OnDestroy` runs exactly when the react context is being torn down — so
   * reading it there would throw and leak the receiver.
   */
  private fun context(): Context {
    cachedContext?.let { return it }
    val resolved = (appContext.reactContext ?: throw Exceptions.ReactContextLost()).applicationContext
    cachedContext = resolved
    return resolved
  }

  override fun definition() = ModuleDefinition {
    Name("ProgressNotification")

    Events(CANCEL_EVENT)

    OnDestroy {
      unregisterCancelReceiver()
      // The JS that would have taken this down is going away. An ongoing
      // notification with nothing left to update it would sit in the shade
      // forever, so drop it here too.
      hide()
    }

    AsyncFunction("show") { title: String, message: String, percent: Int, indeterminate: Boolean ->
      show(title, message, percent, indeterminate)
    }

    AsyncFunction("hide") {
      hide()
    }
  }

  private fun cancelAction(): String = "${context().packageName}.PROGRESS_NOTIFICATION_CANCEL"

  private fun registerCancelReceiver() {
    if (cancelReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(receiverContext: Context?, intent: Intent?) {
        // Take the notification down here rather than waiting for JS to unwind
        // the fetch — the tap should feel like it did something.
        hide()
        runCatching { sendEvent(CANCEL_EVENT) }
      }
    }
    // NOT_EXPORTED because the only sender is our own PendingIntent, which the
    // system dispatches under this app's identity. Required from API 34.
    ContextCompat.registerReceiver(
      context(),
      receiver,
      IntentFilter(cancelAction()),
      ContextCompat.RECEIVER_NOT_EXPORTED
    )
    cancelReceiver = receiver
  }

  private fun unregisterCancelReceiver() {
    val receiver = cancelReceiver ?: return
    cancelReceiver = null
    runCatching { context().unregisterReceiver(receiver) }
  }

  private fun show(title: String, message: String, percent: Int, indeterminate: Boolean) {
    // Registered on first show rather than in `OnCreate` so it happens on a call
    // from JS, where the react context is certainly present — and so a module
    // that is never used never registers anything at all.
    registerCancelReceiver()
    ensureChannel()

    val builder = NotificationCompat.Builder(context(), CHANNEL_ID)
      .setSmallIcon(smallIconRes())
      .setContentTitle(title)
      .setContentText(message)
      .setProgress(100, percent.coerceIn(0, 100), indeterminate)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_SECRET)
      // Ongoing so a stray swipe doesn't orphan a running fetch; silent and
      // alert-once so the ~20 updates of a single fetch never buzz or re-peek.
      .setOngoing(true)
      .setSilent(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setLocalOnly(true)
      .addAction(0, "Cancel", cancelPendingIntent())

    accentColor()?.let { builder.setColor(it) }

    // `notify` needs POST_NOTIFICATIONS on API 33+ and throws without it. A
    // failed indicator must never take the fetch it is reporting on down with it.
    runCatching {
      NotificationManagerCompat.from(context()).notify(NOTIFICATION_ID, builder.build())
    }
  }

  private fun hide() {
    runCatching { NotificationManagerCompat.from(context()).cancel(NOTIFICATION_ID) }
  }

  private fun cancelPendingIntent(): PendingIntent {
    val ctx = context()
    val intent = Intent(cancelAction()).setPackage(ctx.packageName)
    return PendingIntent.getBroadcast(
      ctx,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context().getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    // IMPORTANCE_LOW: visible in the shade and the status bar, but never a
    // heads-up banner, a sound or a vibration. This is a progress readout — the
    // grade notifications it precedes are the alert.
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Background refresh",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Silent progress shown while grades are being checked in the background."
      setShowBadge(false)
      enableLights(false)
      enableVibration(false)
      setSound(null, null)
      lockscreenVisibility = Notification.VISIBILITY_SECRET
    }
    manager.createNotificationChannel(channel)
  }

  private fun appMetaData(): Bundle? = runCatching {
    context().packageManager
      .getApplicationInfo(context().packageName, PackageManager.GET_META_DATA)
      .metaData
  }.getOrNull()

  /** Reuse the icon and colour `expo-notifications` was configured with, so the
   *  progress row is visually of a piece with the grade notifications. */
  private fun smallIconRes(): Int {
    val configured = appMetaData()?.getInt(EXPO_ICON_META_DATA, 0) ?: 0
    if (configured != 0) return configured
    return runCatching { context().applicationInfo.icon }.getOrDefault(0)
  }

  private fun accentColor(): Int? {
    val colorRes = appMetaData()?.getInt(EXPO_COLOR_META_DATA, 0) ?: 0
    if (colorRes == 0) return null
    return runCatching { ContextCompat.getColor(context(), colorRes) }.getOrNull()
  }

  companion object {
    private const val CHANNEL_ID = "fetch-progress"
    private const val NOTIFICATION_ID = 90210
    private const val CANCEL_EVENT = "onCancel"
    private const val EXPO_ICON_META_DATA = "expo.modules.notifications.default_notification_icon"
    private const val EXPO_COLOR_META_DATA = "expo.modules.notifications.default_notification_color"
  }
}
