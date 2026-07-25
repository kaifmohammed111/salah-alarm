const {
  withDangerousMod,
  withAndroidManifest,
  AndroidConfig,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WIDGET_PROVIDER_KT = `package __PACKAGE__

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
class SalahWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        Log.d("SalahWidget", "onUpdate() called by Android for widgetIds=\${appWidgetIds.joinToString()}")
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
            Log.d("SalahWidget", "updateWidget() ENTER widgetId=\$widgetId at wallClock=\${System.currentTimeMillis()}")

            val prefs = context.getSharedPreferences("salah_widget", Context.MODE_PRIVATE)
            val json = prefs.getString("widget_data", null)
            Log.d("SalahWidget", "updateWidget() stored json is null = \${json == null}, length = \${json?.length ?: 0}")

            val style = try {
                if (json != null) JSONObject(json).optString("style", "arc") else "arc"
            } catch (e: Exception) {
                "arc"
            }
            val isGrid = style == "grid"

            val views = RemoteViews(
                context.packageName,
                if (isGrid) R.layout.widget_salah_grid else R.layout.widget_salah,
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
            val arcHeightPx = (46 * density).toInt()

            if (json == null) {
                Log.d("SalahWidget", "updateWidget() no stored data yet, showing placeholder")
                views.setTextViewText(R.id.next_label, "SalahSync")
                views.setTextViewText(R.id.next_time, "Open the app")
                views.setTextViewText(R.id.countdown, "to load today's times")
                if (isGrid) {
                    views.removeAllViews(R.id.grid_col_left)
                    views.removeAllViews(R.id.grid_col_right)
                } else {
                    views.removeAllViews(R.id.rows_container)
                    views.setImageViewBitmap(R.id.arc_image, drawArcBitmap(-1, widthPx, arcHeightPx))
                }
                appWidgetManager.updateAppWidget(widgetId, views)
                return
            }

            try {
                val data = JSONObject(json)
                val rows = data.optJSONArray("rows")
                val nowWall = System.currentTimeMillis()

                // Recompute "next prayer" FRESH from the stored rows' own
                // timestamps every time this runs — including Android's
                // periodic onUpdate() calls (every ~30 min, the platform's
                // guaranteed minimum), not just when the app happens to be
                // open. Previously this trusted the JS-computed nextLabel/
                // nextTimestamp directly, which went stale the moment that
                // prayer's time passed and the app wasn't reopened.
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
                    // All of today's listed prayers have passed — fall back
                    // to tomorrow's Fajr if the app provided it.
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
                Log.d("SalahWidget", "updateWidget() recomputed next: label=\$chosenLabel timestamp=\$chosenTimestamp nowWall=\$nowWall")

                views.setTextViewText(R.id.next_label, chosenLabel)
                views.setTextViewText(R.id.countdown_label, "Time until $chosenLabel")
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
                    // Chronometer ticks on its own once configured — no
                    // repeated app-triggered updates needed (and Android
                    // widgets shouldn't be updated at high frequency anyway).
                    // base must be in SystemClock.elapsedRealtime() terms,
                    // not wall-clock time, hence the conversion below.
                    //
                    // Chronometer prepends a "-" only when the computed
                    // remaining duration is genuinely negative (base already
                    // in the past by the time it renders). Clamping here
                    // guarantees base is always comfortably in the future,
                    // eliminating that edge case regardless of small timing
                    // discrepancies between when JS computed "now" and when
                    // this code actually executes.
                    val nowElapsed = SystemClock.elapsedRealtime()
                    var base = nowElapsed + (nextTimestamp - nowWall)
                    if (base <= nowElapsed) {
                        base = nowElapsed + 1000L
                    }
                    views.setChronometer(R.id.countdown, base, "%s", true)
                    // The combined 4-arg setChronometer() above doesn't
                    // always reliably apply the count-down direction on all
                    // devices — some show a stray leading "-" despite
                    // isCountDown=true. Calling the dedicated method too is
                    // a known, documented workaround for this.
                    views.setChronometerCountDown(R.id.countdown, true)
                } else {
                    views.setTextViewText(R.id.countdown, "--:--:--")
                }

                if (isGrid) {
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
                } else {
                    views.removeAllViews(R.id.rows_container)
                    if (rows != null) {
                        for (i in 0 until rows.length()) {
                            val row = rows.getJSONObject(i)
                            val rowView = RemoteViews(context.packageName, R.layout.widget_row_item)
                            rowView.setTextViewText(R.id.row_label, row.optString("label", ""))
                            rowView.setTextViewText(R.id.row_time, row.optString("time", ""))
                            views.addView(R.id.rows_container, rowView)
                        }
                    }
                    var recomputedIndex = -1
                    if (rows != null) {
                        for (i in 0 until rows.length()) {
                            if (rows.getJSONObject(i).optString("label", "") == chosenLabel) {
                                recomputedIndex = i
                                break
                            }
                        }
                    }
                    views.setImageViewBitmap(R.id.arc_image, drawArcBitmap(recomputedIndex, widthPx, arcHeightPx))
                }
            } catch (e: Exception) {
                Log.d("SalahWidget", "updateWidget() EXCEPTION: \${e.message}")
                views.setTextViewText(R.id.next_label, "SalahSync")
                views.setTextViewText(R.id.next_time, "--:--")
                if (!isGrid) {
                    views.setImageViewBitmap(R.id.arc_image, drawArcBitmap(-1, widthPx, arcHeightPx))
                }
            }

            appWidgetManager.updateAppWidget(widgetId, views)
            Log.d("SalahWidget", "updateWidget() EXIT widgetId=\$widgetId, appWidgetManager.updateAppWidget called")
        }
    }
}
`;

const CLOCK_WIDGET_PROVIDER_KT = `package __PACKAGE__

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
        Log.d("SalahWidget", "ClockWidget onUpdate() called for widgetIds=\${appWidgetIds.joinToString()}")
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
            val radius = size * 0.42f
            val nowWall = System.currentTimeMillis()

            fun pointAt(angleDeg: Double, r: Float): Pair<Float, Float> {
                val rad = Math.toRadians(angleDeg)
                val x = cx + r * Math.cos(rad).toFloat()
                val y = cy + r * Math.sin(rad).toFloat()
                return Pair(x, y)
            }

            val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = size * 0.012f
                color = Color.parseColor("#2E4A45")
            }
            canvas.drawCircle(cx, cy, radius, ringPaint)

            val tickPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = size * 0.006f
                color = Color.parseColor("#5C7A73")
            }
            for (h in 0 until 24) {
                val angle = angleForHour(h.toDouble())
                val outer = pointAt(angle, radius)
                val innerR = if (h % 6 == 0) radius - size * 0.045f else radius - size * 0.025f
                val inner = pointAt(angle, innerR)
                canvas.drawLine(inner.first, inner.second, outer.first, outer.second, tickPaint)
            }

            val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.parseColor("#B8C4C0")
                textSize = size * 0.045f
                textAlign = Paint.Align.CENTER
                isFakeBoldText = true
            }
            val labelR = radius + size * 0.065f
            val labels = listOf(0 to "24", 6 to "6", 12 to "12", 18 to "18")
            for ((h, text) in labels) {
                val angle = angleForHour(h.toDouble())
                val p = pointAt(angle, labelR)
                canvas.drawText(text, p.first, p.second + size * 0.015f, labelPaint)
            }

            var nextAngle: Double? = null
            if (rows != null) {
                for (i in 0 until rows.length()) {
                    val row = rows.getJSONObject(i)
                    val ts = row.optLong("timestamp", 0L)
                    if (ts > nowWall) {
                        nextAngle = angleForHour(hourOfMillis(ts))
                        break
                    }
                }
            }

            // Highlighted "time remaining" sector, from now to the next
            // prayer's position on the dial — a circular analogue of the
            // existing Arc widget's horizontal progress arc.
            val nowAngle = angleForHour(hourOfMillis(nowWall))
            if (nextAngle != null) {
                var sweep = nextAngle - nowAngle
                if (sweep < 0) sweep += 360.0
                val sectorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.FILL
                    color = Color.parseColor("#33E8B84B")
                }
                val rectF = RectF(cx - radius, cy - radius, cx + radius, cy + radius)
                canvas.drawArc(rectF, nowAngle.toFloat(), sweep.toFloat(), true, sectorPaint)
                // Re-stroke the ring on top so the sector fill doesn't
                // visually bleed past the dial's own border.
                canvas.drawCircle(cx, cy, radius, ringPaint)
            }

            if (rows != null) {
                for (i in 0 until rows.length()) {
                    val row = rows.getJSONObject(i)
                    val ts = row.optLong("timestamp", 0L)
                    if (ts <= 0) continue
                    val angle = angleForHour(hourOfMillis(ts))
                    val p = pointAt(angle, radius)
                    val isNext = nextAngle != null && kotlin.math.abs(angle - nextAngle) < 0.01
                    val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        style = Paint.Style.FILL
                        color = if (isNext) Color.parseColor("#E8B84B") else Color.parseColor("#F4F1E8")
                    }
                    canvas.drawCircle(p.first, p.second, if (isNext) size * 0.028f else size * 0.02f, dotPaint)
                    if (isNext) {
                        val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                            style = Paint.Style.STROKE
                            strokeWidth = size * 0.01f
                            color = Color.parseColor("#E8B84B")
                        }
                        canvas.drawCircle(p.first, p.second, size * 0.045f, glowPaint)
                    }
                }
            }

            // "Now" hand pointing from center toward the current time.
            val handEnd = pointAt(nowAngle, radius * 0.72f)
            val handPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = size * 0.015f
                strokeCap = Paint.Cap.ROUND
                color = Color.parseColor("#FFFFFF")
            }
            canvas.drawLine(cx, cy, handEnd.first, handEnd.second, handPaint)
            val hubPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.FILL
                color = Color.parseColor("#FFFFFF")
            }
            canvas.drawCircle(cx, cy, size * 0.02f, hubPaint)

            return bitmap
        }

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
            Log.d("SalahWidget", "ClockWidget updateWidget() ENTER widgetId=\$widgetId")
            val prefs = context.getSharedPreferences("salah_widget", Context.MODE_PRIVATE)
            val json = prefs.getString("widget_data", null)

            val views = RemoteViews(context.packageName, R.layout.widget_salah_clock)

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
                views.setTextViewText(R.id.countdown_label, "Time until \$chosenLabel")
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
                Log.d("SalahWidget", "ClockWidget updateWidget() EXCEPTION: \${e.message}")
                views.setTextViewText(R.id.next_label, "SalahSync")
                views.setImageViewBitmap(R.id.clock_image, drawClockBitmap(null, sizePx))
            }

            appWidgetManager.updateAppWidget(widgetId, views)
            Log.d("SalahWidget", "ClockWidget updateWidget() EXIT widgetId=\$widgetId")
        }
    }
}
`;

const WIDGET_MODULE_KT = `package __PACKAGE__

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Bridge letting JS push ready-to-display prayer time strings to the home
 * screen widget, whenever the app's timetable/settings/next-prayer changes.
 * See src/lib/widget.ts for the JS-side caller.
 */
class WidgetModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "WidgetModule"

    @ReactMethod
    fun updateWidgetData(dataJson: String) {
        Log.d("SalahWidget", "WidgetModule.updateWidgetData() called, jsonLength=\${dataJson.length}")
        val context = reactApplicationContext
        val prefs = context.getSharedPreferences("salah_widget", Context.MODE_PRIVATE)
        prefs.edit().putString("widget_data", dataJson).apply()

        val appWidgetManager = AppWidgetManager.getInstance(context)
        val componentName = ComponentName(context, SalahWidgetProvider::class.java)
        val widgetIds = appWidgetManager.getAppWidgetIds(componentName)
        Log.d("SalahWidget", "WidgetModule.updateWidgetData() widgetIds=\${widgetIds.joinToString()}")
        for (id in widgetIds) {
            SalahWidgetProvider.updateWidget(context, appWidgetManager, id)
        }

        // Also refresh the separate circular clock-face widget, if any
        // instances of it are placed — both read from the same
        // SharedPreferences payload above, so a single JS push keeps both
        // widget types in sync with no extra data path needed.
        val clockComponentName = ComponentName(context, SalahClockWidgetProvider::class.java)
        val clockWidgetIds = appWidgetManager.getAppWidgetIds(clockComponentName)
        Log.d("SalahWidget", "WidgetModule.updateWidgetData() clockWidgetIds=\${clockWidgetIds.joinToString()}")
        for (id in clockWidgetIds) {
            SalahClockWidgetProvider.updateWidget(context, appWidgetManager, id)
        }
    }

    // Re-runs the widget update using whatever is ALREADY cached in
    // SharedPreferences — no new data needed. Since the widget's own update
    // logic already recomputes "next prayer" fresh from the stored rows'
    // timestamps each time it runs, calling this at precisely the moment an
    // alarm fires (see registerBackgroundAlarmHandler in src/lib/alarm.ts)
    // gets the widget refreshed right when a prayer transition happens,
    // rather than waiting on Android's own ~30min periodic refresh floor.
    @ReactMethod
    fun refreshWidget() {
        Log.d("SalahWidget", "WidgetModule.refreshWidget() CALLED from JS")
        val context = reactApplicationContext
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val componentName = ComponentName(context, SalahWidgetProvider::class.java)
        val widgetIds = appWidgetManager.getAppWidgetIds(componentName)
        Log.d("SalahWidget", "WidgetModule.refreshWidget() widgetIds=\${widgetIds.joinToString()}")
        for (id in widgetIds) {
            SalahWidgetProvider.updateWidget(context, appWidgetManager, id)
        }

        val clockComponentName = ComponentName(context, SalahClockWidgetProvider::class.java)
        val clockWidgetIds = appWidgetManager.getAppWidgetIds(clockComponentName)
        Log.d("SalahWidget", "WidgetModule.refreshWidget() clockWidgetIds=\${clockWidgetIds.joinToString()}")
        for (id in clockWidgetIds) {
            SalahClockWidgetProvider.updateWidget(context, appWidgetManager, id)
        }
    }
}
`;

const WIDGET_PACKAGE_KT = `package __PACKAGE__

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class WidgetPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(WidgetModule(reactContext))
    }
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

const WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="140dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_salah"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen">
</appwidget-provider>
`;

// Separate appwidget-provider info for the circular clock-face widget —
// roughly square minimum size so the dial has room to render as an actual
// circle rather than getting squashed into a wide/short cell.
const CLOCK_WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="180dp"
    android:minHeight="180dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_salah_clock"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen">
</appwidget-provider>
`;

// Circular clock-face widget layout: the dial itself is drawn entirely as
// a single Bitmap (see SalahClockWidgetProvider.drawClockBitmap) and set
// into this ImageView; the next-prayer label/time/countdown sit centered
// on top of it via an overlaid FrameLayout child — RemoteViews supports
// FrameLayout as a widget-safe container, same as LinearLayout elsewhere.
const WIDGET_CLOCK_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_bg_default"
    android:padding="10dp">

    <ImageView
        android:id="@+id/clock_image"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:scaleType="fitCenter" />

    <LinearLayout
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_gravity="center"
        android:orientation="vertical"
        android:gravity="center">

        <TextView
            android:id="@+id/next_label"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="Next Prayer"
            android:textColor="#B8C4C0"
            android:textSize="10sp" />

        <TextView
            android:id="@+id/next_time"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="--:--"
            android:textColor="#FFFFFF"
            android:textSize="20sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/countdown_label"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="Time until next prayer"
            android:textColor="#9CB3AD"
            android:textSize="8sp"
            android:layout_marginTop="4dp" />

        <Chronometer
            android:id="@+id/countdown"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:textColor="#E8B84B"
            android:textSize="13sp"
            android:textStyle="bold" />

    </LinearLayout>

</FrameLayout>
`;

// Fajr, Isha, and Sunrise/Maghrib icons are the user's own designs
// (converted from their SVGs to Android vector format). Dhuhr/Asr keep a
// simple original 8-ray sun since no custom design was provided for that
// slot. Maghrib reuses the sunrise icon flipped vertically rather than a
// separate asset.
const ICON_MAGHRIB_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="100"
    android:viewportHeight="100">
    <path
        android:pathData="M50,75 a25,25 0 1,0 0,-50 a25,25 0 1,0 0,50 Z
        M20,75 h60
        M25,85 h50
        M30,95 h40"
        android:strokeWidth="4"
        android:strokeLineCap="round"
        android:strokeColor="#E8B84B"
        android:fillColor="#E8B84B" />
    <path
        android:pathData="M50,20 v30 l-10,-10 M50,50 l10,-10"
        android:strokeWidth="6"
        android:strokeLineCap="round"
        android:strokeColor="#FFFFFF"
        android:fillColor="#00000000" />
</vector>
`;

const ICON_FAJR_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="100"
    android:viewportHeight="100">
    <path
        android:pathData="M50,75 a25,25 0 1,0 0,-50 a25,25 0 1,0 0,50 Z
        M20,75 h60
        M25,85 h50
        M30,95 h40"
        android:strokeWidth="4"
        android:strokeLineCap="round"
        android:strokeColor="#E8B84B"
        android:fillColor="#E8B84B" />
    <path
        android:pathData="M50,50 v-30 l-10,10 M50,20 l10,10"
        android:strokeWidth="6"
        android:strokeLineCap="round"
        android:strokeColor="#FFFFFF"
        android:fillColor="#00000000" />
</vector>
`;

const ICON_ISHA_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="960"
    android:viewportHeight="960">
    <path
        android:fillColor="#E8B84B"
        android:pathData="M600,320L480,200L600,80L720,200L600,320ZM800,440L720,360L800,280L880,360L800,440ZM483,880Q399,880 325.5,848Q252,816 197.5,761.5Q143,707 111,633.5Q79,560 79,476Q79,330 172,218.5Q265,107 409,80Q391,179 420,273.5Q449,368 520,439Q591,510 685.5,539Q780,568 879,550Q853,694 741,787Q629,880 483,880ZM483,800Q571,800 646,756Q721,712 764,635Q678,627 601,591.5Q524,556 463,495Q402,434 366,357Q330,280 323,194Q246,237 202.5,312.5Q159,388 159,476Q159,611 253.5,705.5Q348,800 483,800Z" />
</vector>
`;

const ICON_SUN_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
    <path
        android:fillColor="#E8B84B"
        android:pathData="M12,12 m-3.5,0 a3.5,3.5 0 1,0 7,0 a3.5,3.5 0 1,0 -7,0" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="1.6" android:pathData="M12,5 L12,3" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="1.6" android:pathData="M12,19 L12,21" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="1.6" android:pathData="M5,12 L3,12" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="1.6" android:pathData="M19,12 L21,12" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="1.6" android:pathData="M7.5,7.5 L6,6" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="1.6" android:pathData="M16.5,7.5 L18,6" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="1.6" android:pathData="M7.5,16.5 L6,18" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="1.6" android:pathData="M16.5,16.5 L18,18" />
</vector>
`;

const ICON_SUNRISE_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="100" android:viewportHeight="100">
    <path
        android:fillColor="#E8B84B"
        android:pathData="M50,45 m-15,0 a15,15 0 1,0 30,0 a15,15 0 1,0 -30,0" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="4" android:strokeLineCap="round"
        android:pathData="M50,25 L50,7" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="4" android:strokeLineCap="round"
        android:pathData="M61,31 L73,15" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="4" android:strokeLineCap="round"
        android:pathData="M68,45 L88,45" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="4" android:strokeLineCap="round"
        android:pathData="M39,31 L27,15" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="4" android:strokeLineCap="round"
        android:pathData="M32,45 L12,45" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="4" android:strokeLineCap="round"
        android:pathData="M5,60 L95,60" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="4" android:strokeLineCap="round"
        android:pathData="M15,68 L85,68" />
    <path android:strokeColor="#E8B84B" android:strokeWidth="4" android:strokeLineCap="round"
        android:pathData="M25,76 L75,76" />

</vector>
`;

const WIDGET_BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <corners android:radius="16dp" />
    <gradient
        android:startColor="#20403B"
        android:centerColor="#132925"
        android:endColor="#0B1E1B"
        android:angle="90" />
</shape>
`;

const WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/widget_bg_default"
    android:padding="14dp">

    <TextView
        android:id="@+id/next_label"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Next Prayer"
        android:textColor="#B8C4C0"
        android:textSize="12sp" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:layout_marginTop="2dp"
        android:layout_marginBottom="2dp">

        <TextView
            android:id="@+id/next_time"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="--:--"
            android:textColor="#FFFFFF"
            android:textSize="26sp"
            android:textStyle="bold" />

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical"
            android:gravity="end">

            <TextView
                android:id="@+id/countdown_label"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Time until next prayer"
                android:textColor="#9CB3AD"
                android:textSize="9sp" />

            <Chronometer
                android:id="@+id/countdown"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textColor="#E8B84B"
                android:textSize="15sp"
                android:textStyle="bold" />
        </LinearLayout>
    </LinearLayout>

    <ImageView
        android:id="@+id/arc_image"
        android:layout_width="match_parent"
        android:layout_height="46dp"
        android:scaleType="fitXY"
        android:layout_marginTop="2dp"
        android:layout_marginBottom="2dp" />

    <LinearLayout
        android:id="@+id/rows_container"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:weightSum="6" />

</LinearLayout>
`;

const WIDGET_ROW_ITEM_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="0dp"
    android:layout_height="wrap_content"
    android:layout_weight="1"
    android:orientation="vertical"
    android:gravity="center">

    <TextView
        android:id="@+id/row_label"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text=""
        android:textColor="#9CB3AD"
        android:textSize="10sp"
        android:singleLine="true" />

    <TextView
        android:id="@+id/row_time"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text=""
        android:textColor="#FFFFFF"
        android:textSize="10sp"
        android:textStyle="bold"
        android:singleLine="true" />

</LinearLayout>
`;

// Second, original design — two-column grid with a small glyph per prayer.
// Inspired by the general "grid with icons" concept, built independently
// with SalahSync's own colors/spacing/typography, not a copied asset.
const WIDGET_GRID_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/widget_bg_default"
    android:padding="14dp">

    <TextView
        android:id="@+id/next_label"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Next Prayer"
        android:textColor="#B8C4C0"
        android:textSize="12sp" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:layout_marginTop="2dp"
        android:layout_marginBottom="8dp">

        <TextView
            android:id="@+id/next_time"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="--:--"
            android:textColor="#FFFFFF"
            android:textSize="30sp"
            android:textStyle="bold" />

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical"
            android:gravity="end">

            <TextView
                android:id="@+id/countdown_label"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Time until next prayer"
                android:textColor="#9CB3AD"
                android:textSize="9sp" />

            <Chronometer
                android:id="@+id/countdown"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:textColor="#E8B84B"
                android:textSize="15sp"
                android:textStyle="bold" />
        </LinearLayout>
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal">

        <LinearLayout
            android:id="@+id/grid_col_left"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:paddingEnd="10dp"
            android:orientation="vertical" />

        <LinearLayout
            android:id="@+id/grid_col_right"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:paddingStart="10dp"
            android:orientation="vertical" />

    </LinearLayout>

</LinearLayout>
`;

const WIDGET_GRID_ROW_ITEM_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="center_vertical"
    android:paddingTop="3dp"
    android:paddingBottom="3dp">

    <ImageView
        android:id="@+id/grid_row_icon"
        android:layout_width="16dp"
        android:layout_height="16dp"
        android:layout_marginEnd="6dp"
        android:scaleType="fitCenter" />

    <TextView
        android:id="@+id/grid_row_label"
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:text=""
        android:textColor="#B8C4C0"
        android:textSize="11sp"
        android:singleLine="true" />

    <TextView
        android:id="@+id/grid_row_time"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text=""
        android:textColor="#FFFFFF"
        android:textSize="11sp"
        android:textStyle="bold"
        android:singleLine="true" />

</LinearLayout>
`;

function withHomeWidgetFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const pkg = config.android.package;
      const projectRoot = config.modRequest.platformProjectRoot;

      const javaDir = path.join(projectRoot, "app/src/main/java", pkg.split(".").join("/"));
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(path.join(javaDir, "SalahWidgetProvider.kt"), WIDGET_PROVIDER_KT.replace(/__PACKAGE__/g, pkg));
      fs.writeFileSync(path.join(javaDir, "SalahClockWidgetProvider.kt"), CLOCK_WIDGET_PROVIDER_KT.replace(/__PACKAGE__/g, pkg));
      fs.writeFileSync(path.join(javaDir, "WidgetModule.kt"), WIDGET_MODULE_KT.replace(/__PACKAGE__/g, pkg));
      fs.writeFileSync(path.join(javaDir, "WidgetPackage.kt"), WIDGET_PACKAGE_KT.replace(/__PACKAGE__/g, pkg));

      const xmlDir = path.join(projectRoot, "app/src/main/res/xml");
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, "salah_widget_info.xml"), WIDGET_INFO_XML);
      fs.writeFileSync(path.join(xmlDir, "salah_clock_widget_info.xml"), CLOCK_WIDGET_INFO_XML);

      const drawableDir = path.join(projectRoot, "app/src/main/res/drawable");
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.writeFileSync(path.join(drawableDir, "widget_bg_default.xml"), WIDGET_BG_XML);
      fs.writeFileSync(path.join(drawableDir, "ic_prayer_fajr.xml"), ICON_FAJR_XML);
      fs.writeFileSync(path.join(drawableDir, "ic_prayer_maghrib.xml"), ICON_MAGHRIB_XML);
      fs.writeFileSync(path.join(drawableDir, "ic_prayer_isha.xml"), ICON_ISHA_XML);
      fs.writeFileSync(path.join(drawableDir, "ic_prayer_sun.xml"), ICON_SUN_XML);
      fs.writeFileSync(path.join(drawableDir, "ic_prayer_sunrise.xml"), ICON_SUNRISE_XML);

      const layoutDir = path.join(projectRoot, "app/src/main/res/layout");
      fs.mkdirSync(layoutDir, { recursive: true });
      fs.writeFileSync(path.join(layoutDir, "widget_salah.xml"), WIDGET_LAYOUT_XML);
      fs.writeFileSync(path.join(layoutDir, "widget_row_item.xml"), WIDGET_ROW_ITEM_XML);
      fs.writeFileSync(path.join(layoutDir, "widget_salah_grid.xml"), WIDGET_GRID_LAYOUT_XML);
      fs.writeFileSync(path.join(layoutDir, "widget_grid_row_item.xml"), WIDGET_GRID_ROW_ITEM_XML);
      fs.writeFileSync(path.join(layoutDir, "widget_salah_clock.xml"), WIDGET_CLOCK_LAYOUT_XML);

      return config;
    },
  ]);
}

function withHomeWidgetManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    if (!app.receiver) app.receiver = [];
    const already = app.receiver.some(
      (r) => r["$"] && r["$"]["android:name"] === ".SalahWidgetProvider",
    );
    if (!already) {
      app.receiver.push({
        $: {
          "android:name": ".SalahWidgetProvider",
          "android:exported": "false",
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.appwidget.provider",
              "android:resource": "@xml/salah_widget_info",
            },
          },
        ],
      });
    }

    // Second, independent widget provider — registered as its own receiver
    // with its own appwidget-provider info XML specifically so it shows up
    // as its own separate, directly-selectable entry in Android's widget
    // picker, rather than a style variant chosen inside the app.
    const clockAlready = app.receiver.some(
      (r) => r["$"] && r["$"]["android:name"] === ".SalahClockWidgetProvider",
    );
    if (!clockAlready) {
      app.receiver.push({
        $: {
          "android:name": ".SalahClockWidgetProvider",
          "android:exported": "false",
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.appwidget.provider",
              "android:resource": "@xml/salah_clock_widget_info",
            },
          },
        ],
      });
    }

    return config;
  });
}

function withHomeWidgetPackageRegistration(config) {
  const { withMainApplication } = require("@expo/config-plugins");
  return withMainApplication(config, (config) => {
    const src = config.modResults.contents;
    if (src.includes("WidgetPackage()")) return config;
    let next = src;
    if (next.includes(".apply {")) {
      next = next.replace(".apply {", ".apply {\n      add(WidgetPackage())");
    }
    config.modResults.contents = next;
    return config;
  });
}

module.exports = function withHomeWidget(config) {
  config = withHomeWidgetFiles(config);
  config = withHomeWidgetManifest(config);
  config = withHomeWidgetPackageRegistration(config);
  return config;
};
