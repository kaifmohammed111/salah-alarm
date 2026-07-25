import TrackPlayer, { Capability, Event, RepeatMode, State } from "react-native-track-player";
import type { AudioEdition, SurahMeta } from "./quran";
import { isSurahDownloaded, localSurahAudioPath, mp3QuranSurahUrl } from "./quran";

let setupDone = false;

export async function ensurePlayerSetup(): Promise<void> {
  if (setupDone) return;
  try {
    await TrackPlayer.setupPlayer();
  } catch (e: any) {
    // Some TrackPlayer versions throw if setupPlayer() is called a second
    // time (e.g. after a Fast Refresh during development) — treat "already
    // set up" as success rather than a real failure.
    if (!(typeof e?.message === "string" && e.message.toLowerCase().includes("already"))) {
      throw e;
    }
  }
  await TrackPlayer.updateOptions({
    // NOTE: Android's system media notification only supports a small,
    // fixed set of standard transport buttons via MediaStyle — there's no
    // standard "shuffle" notification button the way there is in-app.
    // This matches how Spotify/Apple Music/YouTube Music all behave too:
    // shuffle/repeat stay as in-app-only controls; only play/pause/skip
    // appear in the system notification.
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
      Capability.Stop,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious],
  });
  setupDone = true;
}

async function trackUriFor(edition: AudioEdition, surahNumber: number): Promise<string> {
  const downloaded = await isSurahDownloaded(edition.identifier, surahNumber);
  return downloaded ? localSurahAudioPath(edition.identifier, surahNumber) : mp3QuranSurahUrl(edition.server, surahNumber);
}

// Builds and loads the full 114-Surah queue for a reciter (optionally
// shuffled), starting playback at `startSurah`. Track IDs are the Surah
// number as a string, so TrackPlayer's own current-track-id maps directly
// back to our Surah numbering — see useActiveTrack() usage in quran.tsx.
export async function loadQueueAndPlay(
  edition: AudioEdition,
  surahList: SurahMeta[],
  startSurah: number,
  shuffled: boolean,
): Promise<void> {
  await ensurePlayerSetup();

  let order = surahList.map((s) => s.number);
  if (shuffled) {
    // Fisher-Yates on everything except startSurah, then put startSurah
    // first — playback begins exactly where the user tapped, with the
    // rest of the queue shuffled behind it.
    order = order.filter((n) => n !== startSurah);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order = [startSurah, ...order];
  } else {
    // Rotate so playback starts at startSurah but Next continues in
    // ascending order (wrapping around), rather than jumping back to
    // Surah 1 first.
    const idx = order.indexOf(startSurah);
    order = idx >= 0 ? [...order.slice(idx), ...order.slice(0, idx)] : order;
  }

  const tracks = await Promise.all(
    order.map(async (n) => {
      const meta = surahList.find((s) => s.number === n);
      return {
        id: String(n),
        url: await trackUriFor(edition, n),
        title: meta?.englishName || `Surah ${n}`,
        artist: edition.englishName,
      };
    }),
  );

  await TrackPlayer.reset();
  await TrackPlayer.add(tracks);
  await TrackPlayer.play();
}

export { TrackPlayer, Event, State, RepeatMode, Capability };
