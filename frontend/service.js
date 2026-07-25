import TrackPlayer, { Event } from "react-native-track-player";

// Registered at true module scope in index.js (not inside a React
// component) — this is exactly the same registration-timing lesson this
// project already learned the hard way with the widget's background alarm
// handler earlier this session: anything that needs to work reliably
// during headless/background execution must be wired up somewhere
// guaranteed to run on every JS engine boot, not somewhere that depends on
// the app's component tree actually mounting.
module.exports = async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteSeek, (event: { position: number }) => TrackPlayer.seekTo(event.position));
};
