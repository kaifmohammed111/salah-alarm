package com.emergent.salahalarm.lxw9zs

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.SystemClock
import android.util.Log
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * A second, independent home screen widget: a circular 24-hour dial with
 * each prayer marked at its time-of-day position around the ring, plus a
 * highlighted sector showing time remaining until the next prayer. Reads
 * from the SAME SharedPreferences payload as SalahWidgetProvider (written
 * by WidgetModule.updateWidgetData()) — no separate JS-side data path is
 * needed, so this stays in sync automatically with every existing refresh
 * trigger (app pushes, the alarm-triggered fast refresh, and Android's own
 * periodic onUpdate() floor).
 *
 * Registered as its own distinct AppWidgetProvider (separate manifest
 * receiver + separate appwidget-provider info XML) specifically so it
 * shows up as its own separate entry in Android's widget picker, rather
 * than being a style variant of the existing widget chosen in-app.
 */
class SalahClockWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        Log.d("SalahWidget", "ClockWidget onUpdate() called for widgetIds=${appWidgetIds.joinToString()}")
        for (id in appWidgetIds) {
            updateWidget(context, appWidgetManager, id)
        }
    }

    companion object {
        // Maps a fractional hour-of-day (0-24) to a canvas angle in degrees,
        // where 0/24 sits at the bottom, 6 at the left, 12 at the top, and
        // 18 at the right — a conventional 24h "sun path" dial orientation.
        private fun angleForHour(hour: Double): Double {
            var a = 90.0 + (hour / 24.0) * 360.0
            a %= 360.0
            if (a < 0) a += 360.0
            return a
        }

        private fun hourOfMillis(ts: Long): Double {
            val cal = Calendar.getInstance()
            cal.timeInMillis = ts
            val h = cal.get(Calendar.HOUR_OF_DAY)
            val m = cal.get(Calendar.MINUTE)
            return h + m / 60.0
        }

        private fun drawClockBitmap(rows: JSONArray?, sizePx: Int): Bitmap {
            val size = sizePx.coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val cx = size / 2f
            val cy = size / 2f
            // Smaller than before (was 0.42f) — the previous label radius
            // (dial radius + offset) actually exceeded the 0.5*size
            // distance to the nearest canvas edge for labels near the
            // left/right/top/bottom axes, silently clipping their text.
            // This leaves real margin for name+time labels to fully fit.
            val radius = size * 0.34f
            val nowWall = System.currentTimeMillis()

            fun pointAt(angleDeg: Double, r: Float): Pair<Float, Float> {
                val rad = Math.toRadians(angleDeg)
                val x = cx + r * Math.cos(rad).toFloat()
                val y = cy + r * Math.sin(rad).toFloat()
                return Pair(x, y)
            }

            // Solid dial face: dark emerald-to-teal gradient fill, so this
            // reads as a genuine circular dial (no rectangular container)
            // rather than a stroked ring on a transparent background.
            val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.FILL
                shader = android.graphics.LinearGradient(
                    cx - radius, cy - radius, cx + radius, cy + radius,
                    Color.parseColor("#062B29"), Color.parseColor("#0B3A36"),
                    android.graphics.Shader.TileMode.CLAMP,
                )
            }
            canvas.drawCircle(cx, cy, radius, bgPaint)

            val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = size * 0.008f
                color = Color.parseColor("#40FFFFFF")
            }
            canvas.drawCircle(cx, cy, radius, ringPaint)

            // 24 hour ticks (this dial's own 0-24 labeling), plus 5 minor
            // ticks between each hour for a "minute tick" texture.
            val hourTickPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = size * 0.006f
                color = Color.parseColor("#5C7A73")
            }
            val minorTickPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = size * 0.003f
                color = Color.parseColor("#2E4A45")
            }
            for (h in 0 until 24) {
                val angle = angleForHour(h.toDouble())
                val outer = pointAt(angle, radius)
                val innerR = if (h % 6 == 0) radius - size * 0.035f else radius - size * 0.02f
                val inner = pointAt(angle, innerR)
                canvas.drawLine(inner.first, inner.second, outer.first, outer.second, hourTickPaint)
                for (t in 1..4) {
                    val minorAngle = angleForHour(h + t * 0.2)
                    val minorOuter = pointAt(minorAngle, radius)
                    val minorInner = pointAt(minorAngle, radius - size * 0.01f)
                    canvas.drawLine(minorInner.first, minorInner.second, minorOuter.first, minorOuter.second, minorTickPaint)
                }
            }

            // Find both the NEXT prayer (smallest timestamp still in the
            // future) and the CURRENT one (largest timestamp already
            // passed) — the arrow points at the current one and stays
            // there until the next prayer's time arrives, rather than
            // continuously tracking the literal clock time.
            var nextTs: Long = -1
            var nextAngle: Double? = null
            var currentTs: Long = -1
            var currentAngle: Double? = null
            if (rows != null) {
                for (i in 0 until rows.length()) {
                    val row = rows.getJSONObject(i)
                    val ts = row.optLong("timestamp", 0L)
                    if (ts <= 0) continue
                    if (ts > nowWall && (nextTs < 0 || ts < nextTs)) {
                        nextTs = ts
                        nextAngle = angleForHour(hourOfMillis(ts))
                    }
                    if (ts <= nowWall && ts > currentTs) {
                        currentTs = ts
                        currentAngle = angleForHour(hourOfMillis(ts))
                    }
                }
            }
            // Before the first prayer of the day has started yet, there's
            // no "current" one — point at the upcoming one instead.
            val arrowAngle = currentAngle ?: nextAngle

            // Soft translucent gold sector from the current prayer to the
            // next one, showing progress through the current period.
            if (currentAngle != null && nextAngle != null) {
                var sweep = nextAngle - currentAngle
                if (sweep < 0) sweep += 360.0
                val sectorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.FILL
                    color = Color.parseColor("#33F4C542")
                }
                val rectF = RectF(cx - radius, cy - radius, cx + radius, cy + radius)
                canvas.drawArc(rectF, currentAngle.toFloat(), sweep.toFloat(), true, sectorPaint)
                canvas.drawCircle(cx, cy, radius, ringPaint)
            }

            // Prayer markers: a small gold dot at each prayer's real
            // time-of-day position, with the prayer name and time stacked
            // just outside the ring. Text alignment adapts to which side
            // of the dial the marker falls on. Label radius and font
            // sizes are kept well inside the canvas edge (unlike the
            // previous version) so nothing silently clips off-bitmap.
            if (rows != null) {
                for (i in 0 until rows.length()) {
                    val row = rows.getJSONObject(i)
                    val ts = row.optLong("timestamp", 0L)
                    if (ts <= 0) continue
                    val label = row.optString("label", "")
                    val timeText = row.optString("time", "")
                    val angle = angleForHour(hourOfMillis(ts))
                    val p = pointAt(angle, radius)
                    val isNext = ts == nextTs

                    val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        style = Paint.Style.FILL
                        color = Color.parseColor("#F4C542")
                        if (isNext) setShadowLayer(size * 0.025f, 0f, 0f, Color.parseColor("#F4C542"))
                    }
                    canvas.drawCircle(p.first, p.second, if (isNext) size * 0.022f else size * 0.015f, dotPaint)
                    if (isNext) {
                        val glowRingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                            style = Paint.Style.STROKE
                            strokeWidth = size * 0.007f
                            color = Color.parseColor("#F4C542")
                            setShadowLayer(size * 0.02f, 0f, 0f, Color.parseColor("#F4C542"))
                        }
                        canvas.drawCircle(p.first, p.second, size * 0.036f, glowRingPaint)
                    }

                    val cosA = Math.cos(Math.toRadians(angle))
                    val align = when {
                        cosA > 0.3 -> Paint.Align.LEFT
                        cosA < -0.3 -> Paint.Align.RIGHT
                        else -> Paint.Align.CENTER
                    }
                    val xOffset = when (align) {
                        Paint.Align.LEFT -> size * 0.015f
                        Paint.Align.RIGHT -> -size * 0.015f
                        else -> 0f
                    }
                    // Kept close to the ring (was +0.10f before, now +0.055f)
                    // with smaller text, so name+time reliably fit within
                    // the canvas even at the left/right/top/bottom extremes.
                    val labelOuter = pointAt(angle, radius + size * 0.055f)
                    val namePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        color = Color.parseColor("#FFFFFF")
                        textSize = size * 0.024f
                        textAlign = align
                        isFakeBoldText = true
                    }
                    val timePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        color = Color.parseColor("#F4C542")
                        textSize = size * 0.021f
                        textAlign = align
                    }
                    canvas.drawText(label, labelOuter.first + xOffset, labelOuter.second, namePaint)
                    canvas.drawText(timeText, labelOuter.first + xOffset, labelOuter.second + size * 0.026f, timePaint)
                }
            }

            // A single arrow pointing at whichever prayer is currently
            // active — a discrete indicator that jumps at each prayer
            // transition, not a continuously-sweeping clock hand (this
            // widget's bitmap only redraws periodically, so a "real" hand
            // would visibly jump anyway; a single static-looking arrow
            // reads more honestly than two hands pretending to tick).
            if (arrowAngle != null) {
                val arrowEnd = pointAt(arrowAngle, radius * 0.68f)
                val arrowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.STROKE
                    strokeWidth = size * 0.016f
                    strokeCap = Paint.Cap.ROUND
                    color = Color.parseColor("#FFFFFF")
                }
                canvas.drawLine(cx, cy, arrowEnd.first, arrowEnd.second, arrowPaint)
                // Small arrowhead.
                val headSize = size * 0.028f
                val leftWing = pointAt(arrowAngle + 150.0, headSize).let { Pair(arrowEnd.first + it.first - cx, arrowEnd.second + it.second - cy) }
                val rightWing = pointAt(arrowAngle - 150.0, headSize).let { Pair(arrowEnd.first + it.first - cx, arrowEnd.second + it.second - cy) }
                val headPath = android.graphics.Path().apply {
                    moveTo(arrowEnd.first, arrowEnd.second)
                    lineTo(leftWing.first, leftWing.second)
                    lineTo(rightWing.first, rightWing.second)
                    close()
                }
                val headPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.FILL
                    color = Color.parseColor("#FFFFFF")
                }
                canvas.drawPath(headPath, headPaint)
            }

            val hubPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.FILL
                color = Color.parseColor("#F4C542")
                setShadowLayer(size * 0.018f, 0f, 0f, Color.parseColor("#F4C542"))
            }
            canvas.drawCircle(cx, cy, size * 0.02f, hubPaint)

            return bitmap
        }

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
            Log.d("SalahWidget", "ClockWidget updateWidget() ENTER widgetId=$widgetId")
            val prefs = context.getSharedPreferences("salah_widget", Context.MODE_PRIVATE)
            val json = prefs.getString("widget_data", null)

            val views = RemoteViews(context.packageName, R.layout.widget_salah_clock)
            val dateFormat = SimpleDateFormat("EEEE, d MMMM", Locale.getDefault())
            views.setTextViewText(R.id.date_line, "☾  " + dateFormat.format(java.util.Date()))

            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                val pendingIntent = PendingIntent.getActivity(
                    context,
                    0,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
            }

            val options = appWidgetManager.getAppWidgetOptions(widgetId)
            val minWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250).coerceAtLeast(180)
            val minHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 250).coerceAtLeast(180)
            val density = context.resources.displayMetrics.density
            // Square canvas sized to whichever dimension is smaller, so the
            // dial never gets clipped regardless of the cell the launcher
            // actually grants it.
            val sizePx = (minOf(minWidthDp, minHeightDp) * density).toInt()

            if (json == null) {
                Log.d("SalahWidget", "ClockWidget updateWidget() no stored data yet")
                views.setTextViewText(R.id.next_label, "SalahSync")
                views.setTextViewText(R.id.next_time, "Open app")
                views.setTextViewText(R.id.countdown, "")
                views.setImageViewBitmap(R.id.clock_image, drawClockBitmap(null, sizePx))
                appWidgetManager.updateAppWidget(widgetId, views)
                return
            }

            try {
                val data = JSONObject(json)
                val rows = data.optJSONArray("rows")
                val nowWall = System.currentTimeMillis()

                var chosenLabel = data.optString("nextLabel", "—")
                var chosenTimestamp = data.optLong("nextTimestamp", 0L)
                if (rows != null) {
                    for (i in 0 until rows.length()) {
                        val row = rows.getJSONObject(i)
                        val ts = row.optLong("timestamp", 0L)
                        if (ts > nowWall) {
                            chosenLabel = row.optString("label", chosenLabel)
                            chosenTimestamp = ts
                            break
                        }
                    }
                    val allPassed = (0 until rows.length()).all {
                        rows.getJSONObject(it).optLong("timestamp", 0L) <= nowWall
                    }
                    if (allPassed) {
                        val tmrFajrTs = data.optLong("tomorrowFajrTimestamp", 0L)
                        if (tmrFajrTs > 0) {
                            chosenLabel = "Fajr"
                            chosenTimestamp = tmrFajrTs
                        }
                    }
                }

                views.setTextViewText(R.id.next_label, chosenLabel)
                val anchorWord = if (data.optString("anchor", "start") == "jamaat") "Jamaat" else "Start"
                views.setTextViewText(R.id.countdown_label, "Time until $chosenLabel $anchorWord")
                if (rows != null) {
                    for (i in 0 until rows.length()) {
                        val row = rows.getJSONObject(i)
                        if (row.optString("label", "") == chosenLabel) {
                            views.setTextViewText(R.id.next_time, row.optString("time", "--:--"))
                        }
                    }
                }

                if (chosenTimestamp > 0) {
                    val nowElapsed = SystemClock.elapsedRealtime()
                    var base = nowElapsed + (chosenTimestamp - nowWall)
                    if (base <= nowElapsed) base = nowElapsed + 1000L
                    views.setChronometer(R.id.countdown, base, "%s", true)
                    views.setChronometerCountDown(R.id.countdown, true)
                } else {
                    views.setTextViewText(R.id.countdown, "--:--:--")
                }

                views.setImageViewBitmap(R.id.clock_image, drawClockBitmap(rows, sizePx))
            } catch (e: Exception) {
                Log.d("SalahWidget", "ClockWidget updateWidget() EXCEPTION: ${e.message}")
                views.setTextViewText(R.id.next_label, "SalahSync")
                views.setImageViewBitmap(R.id.clock_image, drawClockBitmap(null, sizePx))
            }

            appWidgetManager.updateAppWidget(widgetId, views)
            Log.d("SalahWidget", "ClockWidget updateWidget() EXIT widgetId=$widgetId")
        }
    }
}
