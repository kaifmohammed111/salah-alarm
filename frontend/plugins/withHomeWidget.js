const {
  withDangerousMod,
  withAndroidManifest,
  AndroidConfig,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WIDGET_PROVIDER_KT = `package __PACKAGE__

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Renders today's prayer times on the home screen. Deliberately does NOT
 * duplicate any prayer-time calculation logic here — it just displays
 * already-computed, ready-to-show strings written by the JS side (see
 * WidgetModule.kt) into SharedPreferences whenever the app's timetable,
 * settings, or the current time-of-day's "next prayer" changes.
 */
class SalahWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (id in appWidgetIds) {
            updateWidget(context, appWidgetManager, id)
        }
    }

    companion object {
        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
            val prefs = context.getSharedPreferences("salah_widget", Context.MODE_PRIVATE)
            val json = prefs.getString("widget_data", null)

            val views = RemoteViews(context.packageName, R.layout.widget_salah)

            if (json == null) {
                views.setTextViewText(R.id.next_label, "SalahSync")
                views.setTextViewText(R.id.next_time, "Open the app")
                views.setTextViewText(R.id.countdown, "to load today's times")
                views.removeAllViews(R.id.rows_container)
                appWidgetManager.updateAppWidget(widgetId, views)
                return
            }

            try {
                val data = JSONObject(json)
                views.setTextViewText(R.id.next_label, data.optString("nextLabel", "—"))
                views.setTextViewText(R.id.next_time, data.optString("nextTime", "--:--"))
                views.setTextViewText(R.id.countdown, data.optString("countdown", ""))

                views.removeAllViews(R.id.rows_container)
                val rows = data.optJSONArray("rows")
                if (rows != null) {
                    for (i in 0 until rows.length()) {
                        val row = rows.getJSONObject(i)
                        val rowView = RemoteViews(context.packageName, R.layout.widget_row_item)
                        rowView.setTextViewText(R.id.row_label, row.optString("label", ""))
                        rowView.setTextViewText(R.id.row_time, row.optString("time", ""))
                        views.addView(R.id.rows_container, rowView)
                    }
                }
            } catch (e: Exception) {
                views.setTextViewText(R.id.next_label, "SalahSync")
                views.setTextViewText(R.id.next_time, "--:--")
            }

            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
`;

const WIDGET_MODULE_KT = `package __PACKAGE__

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
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
        val context = reactApplicationContext
        val prefs = context.getSharedPreferences("salah_widget", Context.MODE_PRIVATE)
        prefs.edit().putString("widget_data", dataJson).apply()

        val appWidgetManager = AppWidgetManager.getInstance(context)
        val componentName = ComponentName(context, SalahWidgetProvider::class.java)
        val widgetIds = appWidgetManager.getAppWidgetIds(componentName)
        for (id in widgetIds) {
            SalahWidgetProvider.updateWidget(context, appWidgetManager, id)
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
    android:minHeight="110dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_salah"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen">
</appwidget-provider>
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
            android:textSize="28sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/countdown"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:gravity="end"
            android:text=""
            android:textColor="#E8B84B"
            android:textSize="13sp" />
    </LinearLayout>

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
        android:textSize="10sp" />

    <TextView
        android:id="@+id/row_time"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text=""
        android:textColor="#FFFFFF"
        android:textSize="12sp"
        android:textStyle="bold" />

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
      fs.writeFileSync(path.join(javaDir, "WidgetModule.kt"), WIDGET_MODULE_KT.replace(/__PACKAGE__/g, pkg));
      fs.writeFileSync(path.join(javaDir, "WidgetPackage.kt"), WIDGET_PACKAGE_KT.replace(/__PACKAGE__/g, pkg));

      const xmlDir = path.join(projectRoot, "app/src/main/res/xml");
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, "salah_widget_info.xml"), WIDGET_INFO_XML);

      const drawableDir = path.join(projectRoot, "app/src/main/res/drawable");
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.writeFileSync(path.join(drawableDir, "widget_bg_default.xml"), WIDGET_BG_XML);

      const layoutDir = path.join(projectRoot, "app/src/main/res/layout");
      fs.mkdirSync(layoutDir, { recursive: true });
      fs.writeFileSync(path.join(layoutDir, "widget_salah.xml"), WIDGET_LAYOUT_XML);
      fs.writeFileSync(path.join(layoutDir, "widget_row_item.xml"), WIDGET_ROW_ITEM_XML);

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
