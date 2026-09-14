package com.ruskcoder.gradexis.gradenotification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicInteger

/**
 * Posts a grade-change notification whose large icon is a bitmap drawn at call
 * time from the grade itself: a solid colour square, the new average in large
 * bold type, and the signed change beneath it in a green or red pill.
 *
 * `expo-notifications` cannot do this. Its Android builder resolves the large
 * icon from a single manifest meta-data resource
 * (`ExpoNotificationBuilder.kt` -> `NotificationContent.getImage`), so every
 * notification it presents necessarily carries the same static image — there is
 * no per-notification hook to pass a bitmap through. This module therefore owns
 * the whole notification rather than decorating one of expo's, and mirrors the
 * pieces that matter: expo's configured small icon and accent colour, the
 * channel JS already created, and a content intent that opens the app.
 *
 * Android only, and only in a native build. Everywhere else the JS wrapper finds
 * no module and falls back to a plain `expo-notifications` notification.
 */
class GradeNotificationModule : Module() {
  private var cachedContext: Context? = null

  private fun context(): Context {
    cachedContext?.let { return it }
    val resolved = (appContext.reactContext ?: throw Exceptions.ReactContextLost()).applicationContext
    cachedContext = resolved
    return resolved
  }

  override fun definition() = ModuleDefinition {
    Name("GradeNotification")

    /**
     * @param grade   Preformatted new average, e.g. "96.6" — drawn as the big
     *                bold line. Formatting is JS's job so the image matches the
     *                number display the rest of the app uses.
     * @param delta   Preformatted signed change, e.g. "+2.3". Blank/null draws
     *                the grade alone, vertically centred.
     * @param color   "#rrggbb" fill for the square, picked by JS from the same
     *                thresholds as the in-app grade chips.
     * @param sound   Bundled sound resource name ("notification.wav"). Only used
     *                below API 26; from Oreo on, the channel owns the sound.
     */
    AsyncFunction("present") { title: String, body: String, grade: String, delta: String?, color: String, channelId: String, sound: String? ->
      present(title, body, grade, delta, color, channelId, sound)
    }
  }

  private fun present(
    title: String,
    body: String,
    grade: String,
    delta: String?,
    color: String,
    channelId: String,
    sound: String?
  ) {
    val fill = runCatching { Color.parseColor(color) }.getOrDefault(FALLBACK_FILL)
    ensureChannel(channelId, sound)

    val builder = NotificationCompat.Builder(context(), channelId)
      .setSmallIcon(smallIconRes())
      .setContentTitle(title)
      .setContentText(body)
      // Matches what expo-notifications does, so the row can be expanded to read
      // a body longer than one line — and BigTextStyle keeps the large icon.
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setLargeIcon(drawGradeIcon(grade, delta, fill))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setAutoCancel(true)

    accentColor()?.let { builder.color = it }
    contentIntent()?.let { builder.setContentIntent(it) }
    // Pre-Oreo has no channels, so the sound has to ride on the notification.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      soundUri(sound)?.let { builder.setSound(it) }
    }

    // `notify` throws without POST_NOTIFICATIONS on API 33+. Let it propagate:
    // the JS wrapper turns a rejection into a fall back to the plain
    // expo-notifications path, which surfaces the change either way.
    NotificationManagerCompat.from(context()).notify(nextId.getAndIncrement(), builder.build())
  }

  /**
   * Draws the square. Deliberately full-bleed rather than a rounded card inset
   * on a transparent field: Android 12+ clips notification large icons to a
   * circle, and an inset card would come back with its corners sliced off. Edge
   * to edge, the crop just turns the square into a filled circle of the same
   * colour, which reads correctly on every version.
   *
   * The change sits in a pill below the grade, filled green when it rose and red
   * when it fell, so the direction reads before any digit does. The pill is
   * drawn in the 600 shades rather than the 500s the square uses: the two most
   * common notifications of all — a good grade rising, a failing one falling —
   * put a green pill on a green square and a red pill on a red one, and the
   * shade step is the only thing separating them.
   */
  private fun drawGradeIcon(grade: String, delta: String?, fill: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(fill)

    val centerX = SIZE / 2f
    val gradePaint = textPaint(Color.WHITE, GRADE_TEXT_SIZE)
    fitToWidth(gradePaint, grade, MAX_TEXT_WIDTH)
    val gradeBounds = Rect().also { gradePaint.getTextBounds(grade, 0, grade.length, it) }

    // No change to show (a test render, or a value that moved by less than the
    // one decimal we print): the grade alone, centred on the square.
    if (delta.isNullOrBlank()) {
      canvas.drawText(grade, centerX, centeredBaseline(gradeBounds), gradePaint)
      return bitmap
    }

    val deltaPaint = textPaint(Color.WHITE, DELTA_TEXT_SIZE)
    fitToWidth(deltaPaint, delta, MAX_PILL_WIDTH - 2f * PILL_PAD_X)
    val deltaBounds = Rect().also { deltaPaint.getTextBounds(delta, 0, delta.length, it) }
    // Fixed height rather than derived from the text, so every pill comes out
    // the same size even when a wide change like "-11.8" has had its type shrunk
    // to fit. Width never drops below the height, so a short label still reads as
    // a pill instead of a slab.
    val pillHeight = PILL_HEIGHT
    val pillWidth = maxOf(deltaPaint.measureText(delta) + 2f * PILL_PAD_X, PILL_HEIGHT)

    // Grade and pill are centred as one block, so the pair sits on the square's
    // middle however tall the pill turns out to be.
    val blockTop = (SIZE - (gradeBounds.height() + LINE_GAP + pillHeight)) / 2f

    // `bounds.top` is negative (measured up from the baseline), so subtracting
    // it turns a desired top edge into a baseline.
    canvas.drawText(grade, centerX, blockTop - gradeBounds.top, gradePaint)

    val pillTop = blockTop + gradeBounds.height() + LINE_GAP
    val pill = RectF(
      centerX - pillWidth / 2f,
      pillTop,
      centerX + pillWidth / 2f,
      pillTop + pillHeight
    )
    val radius = pillHeight / 2f

    val pillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = pillColor(delta) }
    canvas.drawRoundRect(pill, radius, radius, pillPaint)

    // Centred on the pill's own middle rather than sat on a baseline, so "+2.3"
    // and "-2.3" sit at the same height despite different glyph extents.
    canvas.drawText(
      delta,
      centerX,
      pill.centerY() - (deltaBounds.top + deltaBounds.bottom) / 2f,
      deltaPaint
    )

    return bitmap
  }

  /** JS has already signed the string, so the leading character is the whole
   *  signal. "±0" (a change too small to print) stays neutral grey. */
  private fun pillColor(delta: String): Int = when (delta.firstOrNull()) {
    '+' -> PILL_POSITIVE
    '-' -> PILL_NEGATIVE
    else -> PILL_NEUTRAL
  }

  private fun centeredBaseline(bounds: Rect): Float =
    SIZE / 2f - (bounds.top + bounds.bottom) / 2f

  private fun textPaint(color: Int, size: Float): Paint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color
      textSize = size
      textAlign = Paint.Align.CENTER
      typeface = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        Typeface.create(Typeface.DEFAULT, 800, false)
      } else {
        Typeface.DEFAULT_BOLD
      }
    }

  /** Shrinks the type until the line fits, so "100.0" or "-11.8" can't run off
   *  the edge (or out of the circular crop) the way a fixed size would. */
  private fun fitToWidth(paint: Paint, text: String, maxWidth: Float) {
    while (paint.textSize > MIN_TEXT_SIZE && paint.measureText(text) > maxWidth) {
      paint.textSize -= 2f
    }
  }

  /**
   * Only creates the channel if JS somehow hasn't — `ensureGradesChannel` owns
   * its definition and normally runs first. Recreating it here would be futile
   * anyway: Android freezes a channel's sound at creation and ignores every
   * later change.
   */
  private fun ensureChannel(channelId: String, sound: String?) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context().getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(channelId) != null) return

    val channel = NotificationChannel(
      channelId,
      "Grade updates",
      NotificationManager.IMPORTANCE_HIGH
    )
    soundUri(sound)?.let {
      channel.setSound(
        it,
        android.media.AudioAttributes.Builder()
          .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
          .build()
      )
    }
    manager.createNotificationChannel(channel)
  }

  /** Resolves "notification.wav" to its `res/raw` entry — the expo-notifications
   *  config plugin is what put the file there. */
  private fun soundUri(sound: String?): Uri? {
    if (sound.isNullOrBlank()) return null
    val ctx = context()
    val name = sound.substringBeforeLast('.')
    val resId = ctx.resources.getIdentifier(name, "raw", ctx.packageName)
    if (resId == 0) return null
    return Uri.parse("android.resource://${ctx.packageName}/$resId")
  }

  private fun contentIntent(): PendingIntent? {
    val ctx = context()
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      ctx,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun appMetaData(): Bundle? = runCatching {
    context().packageManager
      .getApplicationInfo(context().packageName, PackageManager.GET_META_DATA)
      .metaData
  }.getOrNull()

  /** Reuse the icon and colour `expo-notifications` was configured with, so
   *  these rows sit alongside its own without looking foreign. */
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
    private const val SIZE = 256
    private const val MAX_TEXT_WIDTH = 184f
    private const val GRADE_TEXT_SIZE = 112f
    private const val DELTA_TEXT_SIZE = 64f
    private const val MIN_TEXT_SIZE = 24f
    private const val LINE_GAP = 24f
    private const val BASE_ID = 810_000

    // Pill geometry. MAX_PILL_WIDTH keeps the widest change ("-11.8") inside the
    // circular crop Android 12+ applies — the pill sits low on the square, where
    // the circle has already narrowed, so it gets less room than the grade above
    // it despite being the shorter line.
    private const val MAX_PILL_WIDTH = 186f
    private const val PILL_PAD_X = 26f
    private const val PILL_HEIGHT = 84f

    // 600 shades, a step darker than the 500s `gradeImageColor` fills the square
    // with, so a green pill still separates from a green square.
    private val PILL_POSITIVE = 0xFF16A34A.toInt()
    private val PILL_NEGATIVE = 0xFFDC2626.toInt()
    private val PILL_NEUTRAL = 0xFF6B7280.toInt()
    private val FALLBACK_FILL = 0xFF3B82F6.toInt()
    private const val EXPO_ICON_META_DATA = "expo.modules.notifications.default_notification_icon"
    private const val EXPO_COLOR_META_DATA = "expo.modules.notifications.default_notification_color"

    /**
     * Every grade change gets its own row, so ids must not collide. Seeded from
     * the clock rather than a constant so a process restart mid-check doesn't
     * reuse ids that are still on screen and silently replace them.
     */
    private val nextId = AtomicInteger(BASE_ID + (System.currentTimeMillis() % 100_000).toInt())
  }
}
