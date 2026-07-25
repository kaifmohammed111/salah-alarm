const {
  withDangerousMod,
  withAndroidManifest,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Foreground service + MediaSessionCompat for real Android lock-screen /
 * notification media controls (play/pause/skip), used by the Quran Listen
 * feature. Deliberately hand-written rather than using a third-party
 * library: react-native-track-player (the obvious off-the-shelf choice)
 * has multiple confirmed, unresolved upstream compatibility issues with
 * React Native's New Architecture (TurboModule interop parsing failures on
 * its native module, crashing the app immediately on launch) — this
 * follows the exact same "hand-written Kotlin via a config plugin"
 * pattern already proven working in this project for the home screen
 * widget, avoiding that risk entirely since it's code we control.
 *
 * Deliberately does NOT do any audio decoding/playback itself — actual
 * playback stays on expo-audio (already used elsewhere in this app, e.g.
 * alarm-ring.tsx). This service only owns the MediaSessionCompat, the
 * foreground notification, and forwards remote-control button presses
 * (notification taps, lock-screen controls, Bluetooth/headset buttons)
 * back to JS via events — JS then calls the real expo-audio player.
 */
const MEDIA_SESSION_SERVICE_KT = `package __PACKAGE__

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import android.util.Log

class MediaSessionService : Service() {
    private var mediaSession: MediaSessionCompat? = null
    private var currentTitle = "Quran"
    private var currentArtist = ""

    companion object {
        private const val CHANNEL_ID = "quran_playback"
        private const val NOTIFICATION_ID = 9911
    }

    override fun onCreate() {
        super.onCreate()
        Log.d("MediaSessionService", "onCreate")
        createNotificationChannel()

        mediaSession = MediaSessionCompat(this, "QuranMediaSession").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                // These fire for lock-screen controls, Bluetooth/headset
                // buttons, and Android Auto — same event path as the
                // notification's own action buttons below, so both
                // sources of a "play" press converge on identical
                // behavior regardless of where the user actually pressed.
                override fun onPlay() {
                    Log.d("MediaSessionService", "session callback: onPlay")
                    MediaSessionModule.emitEvent("onPlay")
                }
                override fun onPause() {
                    Log.d("MediaSessionService", "session callback: onPause")
                    MediaSessionModule.emitEvent("onPause")
                }
                override fun onSkipToNext() {
                    Log.d("MediaSessionService", "session callback: onSkipToNext")
                    MediaSessionModule.emitEvent("onNext")
                }
                override fun onSkipToPrevious() {
                    Log.d("MediaSessionService", "session callback: onSkipToPrevious")
                    MediaSessionModule.emitEvent("onPrevious")
                }
                override fun onSeekTo(pos: Long) {
                    Log.d("MediaSessionService", "session callback: onSeekTo $pos")
                    MediaSessionModule.emitEvent("onSeekTo", pos.toDouble())
                }
                override fun onStop() {
                    Log.d("MediaSessionService", "session callback: onStop")
                    MediaSessionModule.emitEvent("onPause")
                }
            })
            isActive = true
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Quran Playback",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Controls for Quran audio playback"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.getStringExtra("action")
        Log.d("MediaSessionService", "onStartCommand action=\$action")
        when (action) {
            "start" -> {
                currentTitle = intent?.getStringExtra("title") ?: "Quran"
                currentArtist = intent?.getStringExtra("artist") ?: ""
                val isPlaying = intent?.getBooleanExtra("isPlaying", false) ?: false
                val position = intent?.getLongExtra("position", 0L) ?: 0L
                val duration = intent?.getLongExtra("duration", 0L) ?: 0L
                updateSessionAndNotification(isPlaying, position, duration)
            }
            "update" -> {
                val isPlaying = intent?.getBooleanExtra("isPlaying", false) ?: false
                val position = intent?.getLongExtra("position", 0L) ?: 0L
                val duration = intent?.getLongExtra("duration", 0L) ?: 0L
                updateSessionAndNotification(isPlaying, position, duration)
            }
            "play" -> MediaSessionModule.emitEvent("onPlay")
            "pause" -> MediaSessionModule.emitEvent("onPause")
            "next" -> MediaSessionModule.emitEvent("onNext")
            "previous" -> MediaSessionModule.emitEvent("onPrevious")
            "stop" -> {
                stopForeground(true)
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun updateSessionAndNotification(isPlaying: Boolean, position: Long, duration: Long) {
        val session = mediaSession ?: return

        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration)
                .build(),
        )

        val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or
                        PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_PLAY_PAUSE or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackStateCompat.ACTION_SEEK_TO,
                )
                .setState(state, position, 1f)
                .build(),
        )

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val playPauseIcon = if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
        val playPauseAction = NotificationCompat.Action(
            playPauseIcon,
            if (isPlaying) "Pause" else "Play",
            buildActionIntent(if (isPlaying) "pause" else "play"),
        )
        val nextAction = NotificationCompat.Action(
            android.R.drawable.ic_media_next, "Next", buildActionIntent("next"),
        )
        val prevAction = NotificationCompat.Action(
            android.R.drawable.ic_media_previous, "Previous", buildActionIntent("previous"),
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(contentIntent)
            .setOngoing(isPlaying)
            .addAction(prevAction)
            .addAction(playPauseAction)
            .addAction(nextAction)
            .setStyle(
                MediaStyle()
                    .setMediaSession(session.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2),
            )
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        if (isPlaying) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            // Keep the notification visible (paused state) but no longer
            // pinned as foreground/ongoing — matching how most media apps
            // behave when paused, the user can swipe it away if they want.
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFICATION_ID, notification)
            stopForeground(false)
        }
    }

    private fun buildActionIntent(action: String): PendingIntent {
        val intent = Intent(this, MediaSessionService::class.java).apply {
            putExtra("action", action)
        }
        return PendingIntent.getService(
            this, action.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    override fun onDestroy() {
        Log.d("MediaSessionService", "onDestroy")
        mediaSession?.isActive = false
        mediaSession?.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
`;

const MEDIA_SESSION_MODULE_KT = `package __PACKAGE__

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.util.Log

class MediaSessionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "MediaSessionModule"

    companion object {
        // Static reference so the Service (which has no direct bridge
        // access of its own) can emit events back to JS through whichever
        // module instance is currently alive.
        private var instance: MediaSessionModule? = null

        fun emitEvent(name: String, seekPosition: Double? = null) {
            val params = Arguments.createMap()
            if (seekPosition != null) params.putDouble("position", seekPosition)
            instance?.sendEvent(name, params)
        }
    }

    init {
        instance = this
    }

    private fun sendEvent(eventName: String, params: com.facebook.react.bridge.WritableMap) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.d("MediaSessionModule", "emitEvent failed: \${e.message}")
        }
    }

    @ReactMethod
    fun start(title: String, artist: String, isPlaying: Boolean, position: Double, duration: Double) {
        Log.d("MediaSessionModule", "start() title=\$title isPlaying=\$isPlaying")
        val intent = Intent(reactApplicationContext, MediaSessionService::class.java).apply {
            putExtra("action", "start")
            putExtra("title", title)
            putExtra("artist", artist)
            putExtra("isPlaying", isPlaying)
            putExtra("position", position.toLong())
            putExtra("duration", duration.toLong())
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
    }

    @ReactMethod
    fun updateState(isPlaying: Boolean, position: Double, duration: Double) {
        val intent = Intent(reactApplicationContext, MediaSessionService::class.java).apply {
            putExtra("action", "update")
            putExtra("isPlaying", isPlaying)
            putExtra("position", position.toLong())
            putExtra("duration", duration.toLong())
        }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun stop() {
        val intent = Intent(reactApplicationContext, MediaSessionService::class.java).apply {
            putExtra("action", "stop")
        }
        reactApplicationContext.startService(intent)
    }

    // Required by React Native's NativeEventEmitter on Android even though
    // no special bookkeeping is needed here — the JS-side emitter calls
    // these when listeners are added/removed.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
`;

const MEDIA_SESSION_PACKAGE_KT = `package __PACKAGE__

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class MediaSessionPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(MediaSessionModule(reactContext))
    }
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

function withMediaSessionFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const pkg = config.android.package;
      const projectRoot = config.modRequest.platformProjectRoot;

      const javaDir = path.join(projectRoot, "app/src/main/java", pkg.split(".").join("/"));
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(path.join(javaDir, "MediaSessionService.kt"), MEDIA_SESSION_SERVICE_KT.replace(/__PACKAGE__/g, pkg));
      fs.writeFileSync(path.join(javaDir, "MediaSessionModule.kt"), MEDIA_SESSION_MODULE_KT.replace(/__PACKAGE__/g, pkg));
      fs.writeFileSync(path.join(javaDir, "MediaSessionPackage.kt"), MEDIA_SESSION_PACKAGE_KT.replace(/__PACKAGE__/g, pkg));

      return config;
    },
  ]);
}

function withMediaSessionManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    if (!app.service) app.service = [];
    const already = app.service.some(
      (s) => s["$"] && s["$"]["android:name"] === ".MediaSessionService",
    );
    if (!already) {
      app.service.push({
        $: {
          "android:name": ".MediaSessionService",
          "android:exported": "false",
          "android:foregroundServiceType": "mediaPlayback",
        },
      });
    }

    return config;
  });
}

function withMediaSessionPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    const src = config.modResults.contents;
    if (src.includes("MediaSessionPackage()")) return config;
    let next = src;
    if (next.includes(".apply {")) {
      next = next.replace(".apply {", ".apply {\n      add(MediaSessionPackage())");
    }
    config.modResults.contents = next;
    return config;
  });
}

module.exports = function withMediaSession(config) {
  config = withMediaSessionFiles(config);
  config = withMediaSessionManifest(config);
  config = withMediaSessionPackageRegistration(config);
  return config;
};
