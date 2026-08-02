/**
 * Expo config plugin covering two related things:
 *
 * 1. MainActivity gets `android:turnScreenOn="true"` — required for
 *    Notifee full-screen alarm intents to be ABLE to wake the screen at
 *    all, regardless of which activity ends up handling them.
 *
 * 2. A separate, dedicated AlarmActivity is generated and registered,
 *    specifically for alarm notification launches. This exists because
 *    of a real timing bug: showWhenLocked was previously toggled
 *    dynamically at runtime (via LockScreenModule, see
 *    plugins/withLockScreenModule.js) only once app/alarm-ring.tsx
 *    actually mounted — but that requires the full React Native JS
 *    bridge to boot first, which is too slow from a cold start (app
 *    swiped away) to reliably show over the lock screen before the user
 *    manually unlocks. Real user-reported symptom: notification always
 *    showed, but the full-screen swipe UI only appeared after manually
 *    unlocking, never automatically.
 *
 *    AlarmActivity fixes this by setting showWhenLocked/turnScreenOn
 *    STATICALLY in its own manifest entry, taking effect immediately at
 *    the OS level with zero JS-bridge dependency. This is safe to do
 *    statically (unlike doing the same on MainActivity, which would let
 *    ANY normal app open bypass the lock screen — a real security hole)
 *    specifically because AlarmActivity has NO launcher intent-filter:
 *    it's unreachable by any means except the alarm notification's own
 *    PendingIntent (see fullScreenAction/pressAction in src/lib/alarm.ts).
 *    Normal app usage always goes through MainActivity, completely
 *    unaffected by this change.
 *
 *    AlarmActivity hosts the exact same JS entry point ("main", the
 *    full Expo Router app) as MainActivity — not a separate JS bundle —
 *    so all existing routing/logic (AlarmGate, getLaunchAlarm()) works
 *    completely unchanged regardless of which native Activity launched it.
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const ALARM_ACTIVITY_KT = `package __PACKAGE__
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper
/**
 * Dedicated launch target for alarm notifications only — see the plugin
 * comment in withAlarmActivity.js for why this exists as a separate
 * Activity from MainActivity. Hosts the same JS app ("main") as
 * MainActivity; existing JS-side alarm-detection logic (AlarmGate,
 * getLaunchAlarm()) handles routing to the ring screen exactly as it
 * already does today.
 */
class AlarmActivity : ReactActivity() {
  override fun getMainComponentName(): String = "main"
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }
}
`;

function withAlarmActivityNativeFile(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const pkg = config.android.package;
      const pkgPath = pkg.split(".").join("/");
      const dir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/java",
        pkgPath,
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "AlarmActivity.kt"),
        ALARM_ACTIVITY_KT.replace(/__PACKAGE__/g, pkg),
      );
      return config;
    },
  ]);
}

module.exports = function withAlarmActivity(config) {
  config = withAlarmActivityNativeFile(config);
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    mainActivity.$["android:turnScreenOn"] = "true";

    const app = manifest.manifest.application[0];
    const already = app.activity?.some(
      (a) => a["$"] && a["$"]["android:name"] === ".AlarmActivity",
    );
    if (!already) {
      if (!app.activity) app.activity = [];
      app.activity.push({
        $: {
          "android:name": ".AlarmActivity",
          "android:exported": "false",
          "android:showWhenLocked": "true",
          "android:turnScreenOn": "true",
          "android:theme": mainActivity.$["android:theme"],
          "android:launchMode": "singleTask",
        },
      });
    }
    return cfg;
  });
};
