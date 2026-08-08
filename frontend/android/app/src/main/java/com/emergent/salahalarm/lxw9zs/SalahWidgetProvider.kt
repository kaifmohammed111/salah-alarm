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
import android.graphics.Path
import android.os.SystemClock
import android.util.Log
import android.widget.RemoteViews
import org.json.JSONObject
import kotlin.math.sin
import android.graphics.RectF
import org.json.JSONArray
import java.util.Calendar
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Renders today's prayer times on the home screen. Deliberately does NOT
 * duplicate any prayer-time calculation logic here — it just displays
 * already-computed, ready-to-show strings written by the JS side (see
 * WidgetModule.kt) into SharedPreferences whenever the app's timetable,
 * settings, or the current time-of-day's "next prayer" changes.
 *
 * The arc above the prayer row is drawn dynamically via Canvas (not a
 * static image) so the marker can sit above whichever prayer is next —
 * an original design, not copied from any reference.
 */
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

class SalahWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        Log.d("SalahWidget", "onUpdate() called by Android for widgetIds=${appWidgetIds.joinToString()}")
        for (id in appWidgetIds) {
            updateWidget(context, appWidgetManager, id)
        }
    }

    companion object {
        private fun drawArcBitmap(nextIndex: Int, widthPx: Int, heightPx: Int): Bitmap {
            val bitmap = Bitmap.createBitmap(widthPx.coerceAtLeast(1), heightPx.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val cols = 6
            val marginX = widthPx * 0.05f
            val usableWidth = widthPx - marginX * 2
            val baseY = heightPx * 0.92f
            val peakY = heightPx * 0.12f

            fun yAt(t: Float): Float = baseY - (sin(t * Math.PI).toFloat()) * (baseY - peakY)
            fun xAt(i: Int): Float = marginX + usableWidth * (i.toFloat() / (cols - 1))

            val fullPath = Path()
            for (i in 0 until cols) {
                val t = i.toFloat() / (cols - 1)
                val x = xAt(i)
                val y = yAt(t)
                if (i == 0) fullPath.moveTo(x, y) else fullPath.lineTo(x, y)
            }
            val grayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = heightPx * 0.045f
                color = Color.parseColor("#3E5C56")
                strokeCap = Paint.Cap.ROUND
            }
            canvas.drawPath(fullPath, grayPaint)

            if (nextIndex in 0 until cols) {
                val goldPath = Path()
                for (i in 0..nextIndex) {
                    val t = i.toFloat() / (cols - 1)
                    val x = xAt(i)
                    val y = yAt(t)
                    if (i == 0) goldPath.moveTo(x, y) else goldPath.lineTo(x, y)
                }
                val goldPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.STROKE
                    strokeWidth = heightPx * 0.045f
                    color = Color.parseColor("#E8B84B")
                    strokeCap = Paint.Cap.ROUND
                }
                canvas.drawPath(goldPath, goldPaint)

                val markerX = xAt(nextIndex)
                val markerY = yAt(nextIndex.toFloat() / (cols - 1))
                val markerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.FILL
                    color = Color.parseColor("#FFFFFF")
                }
                canvas.drawCircle(markerX, markerY, heightPx * 0.10f, markerPaint)
                val markerRing = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.STROKE
                    strokeWidth = heightPx * 0.03f
                    color = Color.parseColor("#E8B84B")
                }
                canvas.drawCircle(markerX, markerY, heightPx * 0.10f, markerRing)
            }

            return bitmap
        }

        private fun iconForLabel(label: String): Int = when (label) {
            "Fajr" -> R.drawable.ic_prayer_fajr
            "Maghrib" -> R.drawable.ic_prayer_maghrib
            "Isha" -> R.drawable.ic_prayer_isha
            "Sunrise" -> R.drawable.ic_prayer_sunrise
            else -> R.drawable.ic_prayer_sun // Zuhr (Dhuhr), Asr
        }

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
            Log.d("SalahWidget", "updateWidget() ENTER widgetId=$widgetId at wallClock=${System.currentTimeMillis()}")

            val prefs = context.getSharedPreferences("salah_widget", Context.MODE_PRIVATE)
            val json = prefs.getString("widget_data", null)
            Log.d("SalahWidget", "updateWidget() stored json is null = ${json == null}, length = ${json?.length ?: 0}")

            // "arc" was removed as a widget style — any install that still
            // has it saved (or any unrecognized value) falls back to grid,
            // same migration already applied on the JS/Settings side.
            val style = try {
                if (json != null) JSONObject(json).optString("style", "grid") else "grid"
            } catch (e: Exception) {
                "grid"
            }
            val isClock = style == "clock"
            val isGrid = !isClock

            val views = RemoteViews(
                context.packageName,
                if (isClock) R.layout.widget_salah_clock else R.layout.widget_salah_grid,
            )

            // Tapping anywhere on the widget opens the app.
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
            val minWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250).coerceAtLeast(200)
            val density = context.resources.displayMetrics.density
            val widthPx = (minWidthDp * density).toInt()
            // Only needed for the clock style's square canvas — grid
            // doesn't use this.
            val minHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 250).coerceAtLeast(180)
            val clockSizePx = (minOf(minWidthDp, minHeightDp) * density).toInt()

            if (isClock) {
                val dateFormat = SimpleDateFormat("EEEE, d MMMM", Locale.getDefault())
                views.setTextViewText(R.id.date_line, "☾  " + dateFormat.format(java.util.Date()))
            }

            if (json == null) {
                Log.d("SalahWidget", "updateWidget() no stored data yet, showing placeholder")
                views.setTextViewText(R.id.next_label, "SalahSync")
                views.setTextViewText(R.id.next_time, "Open the app")
                views.setTextViewText(R.id.countdown, "to load today's times")
                if (isClock) {
                    views.setImageViewBitmap(R.id.clock_image, drawClockBitmap(null, clockSizePx))
                } else {
                    views.removeAllViews(R.id.grid_col_left)
                    views.removeAllViews(R.id.grid_col_right)
                }
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
                Log.d("SalahWidget", "updateWidget() recomputed next: label=$chosenLabel timestamp=$chosenTimestamp nowWall=$nowWall")

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
                val nextTimestamp = chosenTimestamp
                if (nextTimestamp > 0) {
                    val nowElapsed = SystemClock.elapsedRealtime()
                    var base = nowElapsed + (nextTimestamp - nowWall)
                    if (base <= nowElapsed) {
                        base = nowElapsed + 1000L
                    }
                    views.setChronometer(R.id.countdown, base, "%s", true)
                    views.setChronometerCountDown(R.id.countdown, true)
                } else {
                    views.setTextViewText(R.id.countdown, "--:--:--")
                }

                if (isClock) {
                    views.setImageViewBitmap(R.id.clock_image, drawClockBitmap(rows, clockSizePx))
                } else {
                    views.removeAllViews(R.id.grid_col_left)
                    views.removeAllViews(R.id.grid_col_right)
                    if (rows != null) {
                        val half = (rows.length() + 1) / 2
                        for (i in 0 until rows.length()) {
                            val row = rows.getJSONObject(i)
                            val label = row.optString("label", "")
                            val rowView = RemoteViews(context.packageName, R.layout.widget_grid_row_item)
                            rowView.setImageViewResource(R.id.grid_row_icon, iconForLabel(label))
                            rowView.setTextViewText(R.id.grid_row_label, label)
                            rowView.setTextViewText(R.id.grid_row_time, row.optString("time", ""))
                            views.addView(if (i < half) R.id.grid_col_left else R.id.grid_col_right, rowView)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.d("SalahWidget", "updateWidget() EXCEPTION: ${e.message}")
                views.setTextViewText(R.id.next_label, "SalahSync")
                views.setTextViewText(R.id.next_time, "--:--")
                if (isClock) {
                    views.setImageViewBitmap(R.id.clock_image, drawClockBitmap(null, clockSizePx))
                }
            }

            appWidgetManager.updateAppWidget(widgetId, views)
            Log.d("SalahWidget", "updateWidget() EXIT widgetId=$widgetId, appWidgetManager.updateAppWidget called")
        }
    }
}
