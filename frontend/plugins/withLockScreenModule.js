const { withDangerousMod, withMainApplication } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MODULE_KT = `package __PACKAGE__

import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Lets JS dynamically toggle whether the current Activity can display over
 * the lock screen. Deliberately narrow in scope — only called while the
 * alarm ring screen (app/alarm-ring.tsx) is actually mounted, and cleared
 * immediately on dismiss, so normal app usage always requires the phone to
 * be unlocked as expected.
 */
class LockScreenModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "LockScreenModule"

    @ReactMethod
    fun showOverLockScreen() {
        val activity = reactApplicationContext.currentActivity ?: return
        activity.runOnUiThread {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        }
    }

    @ReactMethod
    fun clearOverLockScreen() {
        val activity = reactApplicationContext.currentActivity ?: return
        activity.runOnUiThread {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        }
    }
}
`;

const PACKAGE_KT = `package __PACKAGE__

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class LockScreenPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(LockScreenModule(reactContext))
    }
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

function withLockScreenNativeFiles(config) {
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
        path.join(dir, "LockScreenModule.kt"),
        MODULE_KT.replace(/__PACKAGE__/g, pkg),
      );
      fs.writeFileSync(
        path.join(dir, "LockScreenPackage.kt"),
        PACKAGE_KT.replace(/__PACKAGE__/g, pkg),
      );
      return config;
    },
  ]);
}

function withLockScreenPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    const src = config.modResults.contents;
    if (src.includes("LockScreenPackage()")) return config;

    let next = src;
    if (next.includes(".apply {")) {
      next = next.replace(".apply {", ".apply {\n      add(LockScreenPackage())");
    }
    config.modResults.contents = next;
    return config;
  });
}

module.exports = function withLockScreenModule(config) {
  config = withLockScreenNativeFiles(config);
  config = withLockScreenPackageRegistration(config);
  return config;
};
