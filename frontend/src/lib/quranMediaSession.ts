import { NativeEventEmitter, NativeModules } from "react-native";

const { MediaSessionModule } = NativeModules;

// Starts (or restarts with new track info) the foreground service +
// notification + MediaSessionCompat. Call this once per new Surah.
export function startMediaSession(
  title: string,
  artist: string,
  isPlaying: boolean,
  positionMs: number,
  durationMs: number,
): void {
  try {
    MediaSessionModule?.start(title, artist, isPlaying, positionMs, durationMs);
  } catch (e) {
    console.warn("startMediaSession failed", e);
  }
}

// Updates play/pause state and position — call this whenever playback
// status changes (play, pause, or periodically while playing) so the
// notification/lock-screen controls and scrubber stay in sync.
export function updateMediaSessionState(isPlaying: boolean, positionMs: number, durationMs: number): void {
  try {
    MediaSessionModule?.updateState(isPlaying, positionMs, durationMs);
  } catch (e) {
    console.warn("updateMediaSessionState failed", e);
  }
}

// Fully stops the foreground service and removes the notification.
export function stopMediaSession(): void {
  try {
    MediaSessionModule?.stop();
  } catch (e) {
    console.warn("stopMediaSession failed", e);
  }
}

// Subscribes to remote-control events — fires when the user presses a
// button in the notification, on the lock screen, or on a Bluetooth/
// headset device. Returns an unsubscribe function.
export function subscribeMediaSessionEvents(handlers: {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeekTo: (positionSeconds: number) => void;
}): () => void {
  if (!MediaSessionModule) return () => {};
  const emitter = new NativeEventEmitter(MediaSessionModule);
  const subs = [
    emitter.addListener("onPlay", handlers.onPlay),
    emitter.addListener("onPause", handlers.onPause),
    emitter.addListener("onNext", handlers.onNext),
    emitter.addListener("onPrevious", handlers.onPrevious),
    emitter.addListener("onSeekTo", (e: { position?: number }) => handlers.onSeekTo(e?.position ?? 0)),
  ];
  return () => subs.forEach((s) => s.remove());
}
