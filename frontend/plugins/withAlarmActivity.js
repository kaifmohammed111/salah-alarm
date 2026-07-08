/**
 * Expo config plugin: makes the main Activity able to turn the screen on,
 * which is required for Notifee full-screen alarm intents.
 *
 * IMPORTANT: `showWhenLocked` is deliberately NOT set here anymore — that
 * flag previously let MainActivity display over the lock screen at ALL
 * times (any normal app open while the phone was locked bypassed the lock
 * screen entirely, a real security hole). Instead, `showWhenLocked` is now
 * toggled dynamically at runtime via a native module (LockScreenModule),
 * only while the alarm ring screen is actually on screen. See
 * app/alarm-ring.tsx and plugins/withLockScreenModule.js.
 */
const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");
module.exports = function withAlarmActivity(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    mainActivity.$["android:turnScreenOn"] = "true";
    return cfg;
  });
};
