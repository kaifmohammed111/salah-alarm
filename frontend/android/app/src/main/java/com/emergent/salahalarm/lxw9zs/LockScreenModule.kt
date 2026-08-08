package com.emergent.salahalarm.lxw9zs

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
