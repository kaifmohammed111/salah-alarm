package com.emergent.salahalarm.lxw9zs

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
        Log.d("SalahWidget", "WidgetModule.updateWidgetData() called, jsonLength=${dataJson.length}")
        val context = reactApplicationContext
        val prefs = context.getSharedPreferences("salah_widget", Context.MODE_PRIVATE)
        prefs.edit().putString("widget_data", dataJson).apply()

        val appWidgetManager = AppWidgetManager.getInstance(context)
        val componentName = ComponentName(context, SalahWidgetProvider::class.java)
        val widgetIds = appWidgetManager.getAppWidgetIds(componentName)
        Log.d("SalahWidget", "WidgetModule.updateWidgetData() widgetIds=${widgetIds.joinToString()}")
        for (id in widgetIds) {
            SalahWidgetProvider.updateWidget(context, appWidgetManager, id)
        }

        // Also refresh the separate circular clock-face widget, if any
        // instances of it are placed — both read from the same
        // SharedPreferences payload above, so a single JS push keeps both
        // widget types in sync with no extra data path needed.
        val clockComponentName = ComponentName(context, SalahClockWidgetProvider::class.java)
        val clockWidgetIds = appWidgetManager.getAppWidgetIds(clockComponentName)
        Log.d("SalahWidget", "WidgetModule.updateWidgetData() clockWidgetIds=${clockWidgetIds.joinToString()}")
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
        Log.d("SalahWidget", "WidgetModule.refreshWidget() widgetIds=${widgetIds.joinToString()}")
        for (id in widgetIds) {
            SalahWidgetProvider.updateWidget(context, appWidgetManager, id)
        }

        val clockComponentName = ComponentName(context, SalahClockWidgetProvider::class.java)
        val clockWidgetIds = appWidgetManager.getAppWidgetIds(clockComponentName)
        Log.d("SalahWidget", "WidgetModule.refreshWidget() clockWidgetIds=${clockWidgetIds.joinToString()}")
        for (id in clockWidgetIds) {
            SalahClockWidgetProvider.updateWidget(context, appWidgetManager, id)
        }
    }
}
