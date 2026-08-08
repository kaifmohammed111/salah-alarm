package com.emergent.salahalarm.lxw9zs
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
