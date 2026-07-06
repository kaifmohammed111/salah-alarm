/**
 * Expo config plugin: makes the main Activity able to show over the lock screen
 * and turn the screen on, which is required for Notifee full-screen alarm intents.
 */
const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

module.exports = function withAlarmActivity(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    mainActivity.$["android:showWhenLocked"] = "true";
    mainActivity.$["android:turnScreenOn"] = "true";
    return cfg;
  });
};
