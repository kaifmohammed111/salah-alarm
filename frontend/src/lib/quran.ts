// Quran text: Al Quran Cloud API — free, no API key required, no usage
// restrictions. https://alquran.cloud/api
// Quran audio: MP3Quran.net — a long-standing, purpose-built free API
// dedicated specifically to reciter audio hosting. https://www.mp3quran.net
//
// Two separate sources deliberately: Al Quran Cloud's own audio CDN turned
// out to be inconsistent (some reciters listed on it don't actually have
// full-Surah audio files, only per-ayah — see fetchAudioEditions below),
// while MP3Quran.net is dedicated audio infrastructure that explicitly
// reports which Surahs each reciter actually has, rather than us having to
// guess or verify against a possibly-unreliable second source.
//
// Quran text itself carries no copyright; both sources serve their content
// specifically for this kind of programmatic/offline use.
import * as FileSystem from "expo-file-system/legacy";
import * as Network from "expo-network";
import { storage } from "@/src/utils/storage";

const BASE = "https://api.alquran.cloud/v1";
const MP3QURAN_BASE = "https://www.mp3quran.net/api/v3";

// Standard Arabic Uthmani-script text edition, and Saheeh International's
// widely-used English translation — both stable, long-standing edition
// identifiers on this API.
const ARABIC_EDITION = "quran-uthmani";
const ENGLISH_EDITION = "en.sahih";

const K_SURAH_LIST = "quran.surahList";
// v2: the audio-edition data shape changed completely when the audio
// source moved from Al Quran Cloud to MP3Quran.net (old entries had a
// `language` field; new ones have `server`/`availableSurahs`) — using a
// fresh cache key avoids loading stale, incompatible cached data that
// would crash the Listen screen when it tries to read `.server` off an
// old-shaped object.
// v3: bumped again because the cached reciter names themselves changed
// (Arabic -> English) — v2's cache key would otherwise keep serving
// already-cached Arabic names to anyone who opened Listen mode before
// this fix, even after updating the app.
const K_AUDIO_EDITIONS = "quran.audioEditions.v3";
const K_DOWNLOADED_EDITIONS = "quran.downloadedEditions";
const K_BACKGROUND_PLAYBACK_ENABLED = "quran.backgroundPlaybackEnabled";

// Whether Quran audio should keep playing (with lock-screen/notification
// controls) after the user leaves the app. Defaults to true so existing
// behavior doesn't silently change for anyone who already had it working.
export async function getBackgroundPlaybackEnabled(): Promise<boolean> {
  const raw = await storage.getItem(K_BACKGROUND_PLAYBACK_ENABLED, "true");
  return raw !== "false";
}

export async function setBackgroundPlaybackEnabled(enabled: boolean): Promise<void> {
  await storage.setItem(K_BACKGROUND_PLAYBACK_ENABLED, enabled ? "true" : "false");
}

export type LastPlayed = {
  editionIdentifier: string;
  editionName: string;
  surahNumber: number;
  surahName: string;
  positionSeconds: number;
};

const K_LAST_PLAYED = "quran.lastPlayed";

// Lets the Listen tab show a "Continue Listening" card on relaunch and
// resume exactly where playback left off. Saved on every new Surah start
// (position 0), on pause, and periodically while playing — deliberately
// NOT saved continuously on every position tick, to avoid excessive
// storage writes.
export async function saveLastPlayed(data: LastPlayed): Promise<void> {
  try {
    await storage.setItem(K_LAST_PLAYED, JSON.stringify(data));
  } catch {}
}

export async function getLastPlayed(): Promise<LastPlayed | null> {
  const raw = await storage.getItem(K_LAST_PLAYED, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
const TEXT_CACHE_PREFIX = "quran.text.";

export type SurahMeta = {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: "Meccan" | "Medinan";
};

export type Ayah = {
  number: number;
  numberInSurah: number;
  text: string;
  surah: { number: number; englishName: string; name: string };
  // Standard 604-page Mushaf page number and Juz (1-30) this ayah falls
  // on — used by the page-based Read mode to group ayahs into full pages
  // and to jump to the right starting page for a chosen Surah/Juz.
  page: number;
  juz: number;
};

export type AudioEdition = {
  identifier: string;
  englishName: string;
  server: string;
  availableSurahs: number[];
};

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(typeof json.data === "string" ? json.data : "API error");
  return json.data;
}

// Quran text/reciter-list data is effectively static (it never meaningfully
// changes), so once fetched it's cached indefinitely rather than re-fetched
// on every visit — this also means the Read/Listen tabs work offline after
// the first successful load, even without an explicit "download" action.

export async function fetchSurahList(): Promise<SurahMeta[]> {
  const cached = await storage.getItem(K_SURAH_LIST, "");
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }
  const data = await fetchJson(`${BASE}/surah`);
  await storage.setItem(K_SURAH_LIST, JSON.stringify(data));
  return data;
}

type Mp3QuranMoshaf = {
  id: number;
  name: string;
  server: string;
  surah_total: number;
  surah_list: string;
};
type Mp3QuranReciter = {
  id: number;
  name: string;
  moshaf: Mp3QuranMoshaf[];
};

// Fetches the reciter list directly from MP3Quran.net — dedicated audio
// infrastructure, not a general-purpose Quran API that happens to also
// serve audio. Each reciter can have multiple "moshaf" entries (different
// riwayahs/recitation styles, e.g. Warsh vs Hafs), each with its own
// server URL and its own explicit list of which Surahs are available —
// flattened here into individual pickable entries.
//
// Only reciters with a COMPLETE set (all 114 Surahs) are included. This is
// what actually fixes "some reciters don't load": rather than showing
// partial reciters and having to handle missing-Surah cases throughout the
// UI, only fully-complete recitations are offered at all.
// Manual corrections for reciter name transliterations that read oddly
// in English (as supplied by the user) — a display-only substitution.
// Substring-based (not exact-match) so it also corrects a name when it's
// combined with a reading-style suffix, e.g. "Name (Reading)". The
// underlying MP3Quran.net data used for matching/downloads is untouched;
// only what's shown on screen changes.
const RECITER_NAME_OVERRIDES: [string, string][] = [
  ["Abdulrahman Alsudaes", "Abdul Rahman Al-Sudais"],
  ["Maher Al Meaqli", "Maher Al-Muaiqly"],
  ["Abdulbasit Abdulsamad", "Abdul Basit 'Abd us-Samad"],
];

function applyReciterNameOverrides(englishName: string): string {
  let result = englishName;
  for (const [from, to] of RECITER_NAME_OVERRIDES) {
    if (result.includes(from)) {
      result = result.split(from).join(to);
    }
  }
  return result;
}

export async function fetchAudioEditions(): Promise<AudioEdition[]> {
  const cached = await storage.getItem(K_AUDIO_EDITIONS, "");
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as AudioEdition[];
      // Apply overrides even to already-cached data, so a correction
      // takes effect immediately without needing to bump the cache key.
      return parsed.map((e) => ({ ...e, englishName: applyReciterNameOverrides(e.englishName) }));
    } catch {}
  }

  // FIX: language=ar returns reciter/moshaf names in Arabic script — the
  // mp3quran.net API's `language` parameter controls the language of the
  // returned metadata (names), not a content filter (Quran audio is
  // essentially always in Arabic regardless of this parameter). Confirmed
  // via mp3quran.net's own English documentation page, which explicitly
  // uses language=eng for English-language results.
  const res = await fetch(`${MP3QURAN_BASE}/reciters?language=eng`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  const reciters = (json.reciters || []) as Mp3QuranReciter[];

  const editions: AudioEdition[] = [];
  for (const r of reciters) {
    const moshafList = r.moshaf || [];
    const hasMultipleReadings = moshafList.length > 1;
    for (const m of moshafList) {
      const availableSurahs = (m.surah_list || "")
        .split(",")
        .map((n) => parseInt(n.trim(), 10))
        .filter((n) => !isNaN(n));
      if (availableSurahs.length < 114) continue;
      editions.push({
        identifier: `${r.id}-${m.id}`,
        englishName: applyReciterNameOverrides(hasMultipleReadings ? `${r.name} (${m.name})` : r.name),
        server: m.server,
        availableSurahs,
      });
    }
  }
  await storage.setItem(K_AUDIO_EDITIONS, JSON.stringify(editions));
  return editions;
}

// Fetches Arabic + English together in a single request via the API's
// multi-edition endpoint, rather than two separate calls.
export async function fetchSurahBilingual(surahNumber: number): Promise<{ arabic: Ayah[]; english: Ayah[] }> {
  const cacheKey = `${TEXT_CACHE_PREFIX}surah.${surahNumber}`;
  const cached = await storage.getItem(cacheKey, "");
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }
  const data = await fetchJson(`${BASE}/surah/${surahNumber}/editions/${ARABIC_EDITION},${ENGLISH_EDITION}`);
  const result = { arabic: data[0].ayahs, english: data[1].ayahs };
  await storage.setItem(cacheKey, JSON.stringify(result));
  return result;
}

export async function fetchJuzBilingual(juzNumber: number): Promise<{ arabic: Ayah[]; english: Ayah[] }> {
  const cacheKey = `${TEXT_CACHE_PREFIX}juz.${juzNumber}`;
  const cached = await storage.getItem(cacheKey, "");
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }
  // The multi-edition endpoint (/editions/ed1,ed2) is only ever documented
  // for /surah/ — the Juz endpoint is consistently single-edition only
  // (/juz/{n}/{edition}). Two separate requests, combined client-side by
  // ayah order, same technique already used for Surah.
  const [arabicData, englishData] = await Promise.all([
    fetchJson(`${BASE}/juz/${juzNumber}/${ARABIC_EDITION}`),
    fetchJson(`${BASE}/juz/${juzNumber}/${ENGLISH_EDITION}`),
  ]);
  const result = { arabic: arabicData.ayahs, english: englishData.ayahs };
  await storage.setItem(cacheKey, JSON.stringify(result));
  return result;
}

// Builds the full Quran (Arabic + English), once, by looping the same
// already-verified /surah/{n}/editions/{ar},{en} endpoint used by
// fetchSurahBilingual across all 114 Surahs — deliberately NOT using the
// whole-book /quran/{edition} endpoint, since its exact response shape
// isn't already used/verified anywhere else in this app, and guessing
// wrong there would silently break this feature. Cached afterward via
// storage, same as everything else, so this cost is only ever paid once.
// Powers the page-based Read mode's ability to swipe freely across the
// entire Quran regardless of which Surah/Juz the user originally opened.
const K_WHOLE_QURAN_CACHE_KEY = `${TEXT_CACHE_PREFIX}wholeQuranBilingual.v5`;
// The full bilingual Quran (6236 ayahs x 2 languages) serializes to
// several MB of JSON — real evidence points to this silently failing to
// persist via AsyncStorage (storage.setItem swallows write errors and
// returns false, which fetchWholeQuranBilingual never checked), since
// AsyncStorage is only really meant for small values and is known to be
// unreliable well above a couple MB on Android. Cached as a plain file
// instead, which has no comparable size ceiling.
const WHOLE_QURAN_CACHE_PATH = `${FileSystem.documentDirectory}quran-whole-cache-v5.json`;

// Retries specifically on HTTP 429 (rate limited) with increasing
// backoff. Real logcat evidence: fetching all 114 Surahs at concurrency
// 10 tripped AlQuranCloud's rate limiter ("Request failed: 429"). Local
// to this bulk-fetch path only — the shared fetchJson used elsewhere in
// this file is left as-is since single-Surah/Juz fetches never hit this.
async function fetchJsonWithRetry(
  url: string,
  onWaitingForConnection?: (waiting: boolean) => void,
  maxRateLimitRetries = 5,
): Promise<any> {
  let rateLimitAttempt = 0;
  while (true) {
    try {
      const result = await fetchJson(url);
      return result;
    } catch (e: any) {
      const is429 = typeof e?.message === "string" && e.message.includes("429");
      if (is429) {
        if (rateLimitAttempt >= maxRateLimitRetries) throw e;
        await new Promise((resolve) => setTimeout(resolve, 600 * Math.pow(2, rateLimitAttempt)));
        rateLimitAttempt += 1;
        continue;
      }
      // Not a rate-limit error — check if we're genuinely offline. If so,
      // pause here, poll connectivity, and retry the SAME request once
      // back online, same "auto-pause/resume on disconnect" behavior the
      // download feature already has, rather than treating a dropped
      // connection as a hard failure.
      const online = await hasInternetConnection();
      if (online) {
        throw e;
      }
      onWaitingForConnection?.(true);
      while (!(await hasInternetConnection())) {
        await new Promise((resolve) => setTimeout(resolve, CONNECTIVITY_POLL_MS));
      }
      onWaitingForConnection?.(false);
    }
  }
}

export type WholeQuranFetchProgress = {
  done: number; // Surahs completed so far
  total: number; // always 114
  waitingForConnection: boolean;
};

export async function fetchWholeQuranBilingual(
  onProgress?: (info: WholeQuranFetchProgress) => void,
): Promise<{ arabic: Ayah[]; english: Ayah[] }> {
  try {
    const info = await FileSystem.getInfoAsync(WHOLE_QURAN_CACHE_PATH);
    if (info.exists) {
      const cached = await FileSystem.readAsStringAsync(WHOLE_QURAN_CACHE_PATH);
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn("fetchWholeQuranBilingual: reading cache file failed, will re-fetch", e);
  }
  const allArabic: Ayah[] = [];
  const allEnglish: Ayah[] = [];
  let doneCount = 0;
  // Small batch size + a pause between batches, rather than firing many
  // Surah requests at high concurrency — real evidence showed concurrency
  // 10 tripping the rate limiter. This is slower (one-time only, cached
  // after) but reliable.
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 500;
  for (let start = 1; start <= 114; start += BATCH_SIZE) {
    const batch = Array.from(
      { length: Math.min(BATCH_SIZE, 114 - start + 1) },
      (_, i) => start + i,
    );
    const results = await Promise.all(
      batch.map((n) =>
        fetchJsonWithRetry(
          `${BASE}/surah/${n}/editions/${ARABIC_EDITION},${ENGLISH_EDITION}`,
          (waiting) => onProgress?.({ done: doneCount, total: 114, waitingForConnection: waiting }),
        ),
      ),
    );
    results.forEach((data, batchIdx) => {
      const surahNum = batch[batchIdx];
      const arabicAyahs = data?.[0]?.ayahs;
      const englishAyahs = data?.[1]?.ayahs;
      if (!Array.isArray(arabicAyahs) || !Array.isArray(englishAyahs)) {
        console.warn(`fetchWholeQuranBilingual: Surah ${surahNum} response missing ayahs arrays, skipping`);
        return;
      }
      // Real evidence (logged ayah shape): the /surah/{n}/editions/{ar},{en}
      // endpoint does NOT include a `.surah` sub-object per ayah (unlike
      // the /juz/{n}/{edition} endpoint fetchJuzBilingual uses, which spans
      // multiple Surahs and needs it) — every ayah here already belongs to
      // the same known Surah, so the API puts that metadata at the
      // response level instead. Attach it manually per ayah so downstream
      // code (page grouping, Surah-header rendering, Surah/Juz jump-to
      // lookup) can rely on `.surah` existing uniformly everywhere.
      const surahMeta = {
        number: data[0]?.number ?? surahNum,
        englishName: data[0]?.englishName ?? `Surah ${surahNum}`,
        name: data[0]?.name ?? "",
      };
      for (let i = 0; i < arabicAyahs.length; i++) {
        const a = arabicAyahs[i];
        const en = englishAyahs[i];
        if (!a || typeof a.page !== "number" || !en) {
          console.warn(`fetchWholeQuranBilingual: malformed ayah in Surah ${surahNum} at index ${i}, skipping`);
          continue;
        }
        allArabic.push({ ...a, surah: surahMeta });
        allEnglish.push(en);
      }
    });
    doneCount += batch.length;
    onProgress?.({ done: doneCount, total: 114, waitingForConnection: false });
    if (start + BATCH_SIZE <= 114) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
  const result = { arabic: allArabic, english: allEnglish };
  try {
    await FileSystem.writeAsStringAsync(WHOLE_QURAN_CACHE_PATH, JSON.stringify(result));
  } catch (e) {
    // Not fatal — the fetch itself already succeeded and the caller has
    // the data; this just means next launch will re-fetch instead of
    // hitting a warm cache. Logged so it's visible if it keeps happening.
    console.warn("fetchWholeQuranBilingual: writing cache file failed", e);
  }
  return result;
}

// MP3Quran.net's per-Surah file convention: {server}{3-digit zero-padded
// surah number}.mp3, e.g. https://server6.mp3quran.net/akdr/001.mp3
export function mp3QuranSurahUrl(server: string, surahNumber: number): string {
  const base = server.endsWith("/") ? server : `${server}/`;
  return `${base}${String(surahNumber).padStart(3, "0")}.mp3`;
}

function localSurahAudioDir(editionIdentifier: string): string {
  return `${FileSystem.documentDirectory}quran-audio/${editionIdentifier}/`;
}

export function localSurahAudioPath(editionIdentifier: string, surahNumber: number): string {
  return `${localSurahAudioDir(editionIdentifier)}${surahNumber}.mp3`;
}

export async function isSurahDownloaded(editionIdentifier: string, surahNumber: number): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(localSurahAudioPath(editionIdentifier, surahNumber));
    return info.exists;
  } catch {
    return false;
  }
}

// Checks for a real, working internet connection (WiFi or mobile data —
// deliberately not WiFi-only, since requiring WiFi specifically would
// block legitimate downloads over cellular data for no real benefit).
// Fails "open" (returns true) if the check itself errors, so a broken
// connectivity check never blocks downloads that would otherwise work.
export async function hasInternetConnection(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

// Distinguishes WiFi specifically, for the "Wi-Fi only" download option.
export async function isOnWifi(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.type === Network.NetworkStateType.WIFI;
  } catch {
    return false;
  }
}

// HEAD request to get a single Surah audio file's real size, without
// downloading the file itself.
export async function getSurahFileSizeBytes(server: string, surahNumber: number): Promise<number | null> {
  try {
    const res = await fetch(mp3QuranSurahUrl(server, surahNumber), { method: "HEAD" });
    const len = res.headers.get("content-length") || res.headers.get("Content-Length");
    return len ? parseInt(len, 10) : null;
  } catch {
    return null;
  }
}

// Estimates total download size for a list of Surahs by sampling a few
// (not all — could be 114 HEAD requests otherwise) and extrapolating an
// average across the full list. Fast and reasonably representative, since
// one reciter's files for different Surahs tend to be similar bitrate.
export async function estimateDownloadSizeBytes(server: string, surahNumbers: number[]): Promise<number | null> {
  const sampleCount = Math.min(5, surahNumbers.length);
  const sample = surahNumbers.slice(0, sampleCount);
  const sizes = (await Promise.all(sample.map((s) => getSurahFileSizeBytes(server, s)))).filter(
    (s): s is number => s != null,
  );
  if (sizes.length === 0) return null;
  const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  return Math.round(avg * surahNumbers.length);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type DownloadFailure = { surah: number; reason: string };

// Downloads the given list of Surah numbers for one reciter, sequentially
// (not in parallel — avoids hammering the server or the device's network
// stack). Skips any file already present. Generalized from the original
// "always all 114" version so it can also be used for a single Surah at a
// time — pass [n] to download just Surah n, or all 114 numbers for a full
// download.
//
// Reports a live ETA (seconds) via onProgress, computed from the ACTUAL
// average download time of files completed so far in this run — not a
// guessed constant — so it only appears once real data exists (null until
// the first file finishes) and keeps refining as the download proceeds.
//
// An individual Surah failing doesn't abort the rest — it's recorded with
// its specific failure reason and reported back, rather than the whole
// download silently stopping partway with no explanation.
export type DownloadControl = {
  cancelled: boolean;
  // The currently in-flight resumable task, if any. Stashed here so the
  // Cancel button (outside this function's closure) can actually interrupt
  // a real network request — plain FileSystem.downloadAsync() has NO
  // cancel method at all, which is why Cancel used to just sit there
  // until whatever file was mid-transfer happened to finish on its own.
  activeTask: FileSystem.DownloadResumable | null;
};

export function createDownloadControl(): DownloadControl {
  return { cancelled: false, activeTask: null };
}

// Called by the Cancel button. Actually pauses the in-flight transfer via
// the resumable task's pauseAsync() (a real native cancel-the-request
// call), instead of only flipping a flag that gets checked between files.
export async function cancelDownload(control: DownloadControl): Promise<void> {
  control.cancelled = true;
  if (control.activeTask) {
    try {
      await control.activeTask.pauseAsync();
    } catch {
      // Task already settled (completed or errored) right as we tried to
      // pause it — nothing to do, not an error worth surfacing.
    }
  }
}

export type DownloadProgressInfo = {
  done: number;
  total: number;
  etaSeconds: number | null;
  waitingForConnection: boolean;
  // Fraction (0..1) complete of whichever file is currently mid-transfer.
  // Lets the UI move the percentage bar continuously between whole-file
  // completions, instead of freezing for the whole duration of one file
  // on a slow connection.
  currentFileFraction: number;
};

// How often to re-check connectivity while paused waiting for it to return.
const CONNECTIVITY_POLL_MS = 5000;

export async function downloadQuranAudio(
  edition: AudioEdition,
  surahNumbers: number[],
  onProgress: (info: DownloadProgressInfo) => void,
  control: DownloadControl,
): Promise<{ failures: DownloadFailure[]; cancelled: boolean }> {
  const dir = localSurahAudioDir(edition.identifier);
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // Directory may already exist — fine, ignore.
  }
  const failures: DownloadFailure[] = [];

  // Real byte-rate-based ETA: track actual bytes transferred (completed
  // files + whatever's been written of the file currently in flight)
  // against real elapsed *active* download time. Time spent paused
  // waiting for connectivity is excluded from that elapsed time so a
  // disconnect doesn't drag the computed rate down artificially.
  const batchStartedAt = Date.now();
  let pausedMs = 0;
  let bytesFromCompletedFiles = 0;
  let totalExpectedBytesSeen = 0; // sum of file sizes seen so far, for estimating not-yet-started files
  let filesWithKnownSize = 0;

  const emitProgress = (
    doneCount: number,
    currentFileWritten: number,
    currentFileExpected: number,
    waitingForConnection: boolean,
  ) => {
    const activeMs = Math.max(1, Date.now() - batchStartedAt - pausedMs);
    const bytesSoFar = bytesFromCompletedFiles + currentFileWritten;
    const rate = bytesSoFar / (activeMs / 1000); // bytes/sec

    const avgFileSize = filesWithKnownSize > 0 ? totalExpectedBytesSeen / filesWithKnownSize : null;
    const remainingInCurrentFile =
      currentFileExpected > 0 ? Math.max(0, currentFileExpected - currentFileWritten) : avgFileSize ?? 0;
    const filesNotYetStarted = surahNumbers.length - doneCount - (currentFileExpected > 0 ? 1 : 0);
    const remainingBytes =
      remainingInCurrentFile + (avgFileSize != null ? avgFileSize * Math.max(0, filesNotYetStarted) : 0);

    const etaSeconds = rate > 0 && bytesSoFar > 0 ? Math.round(remainingBytes / rate) : null;
    const currentFileFraction = currentFileExpected > 0 ? Math.min(1, currentFileWritten / currentFileExpected) : 0;

    onProgress({
      done: doneCount,
      total: surahNumbers.length,
      etaSeconds,
      waitingForConnection,
      currentFileFraction,
    });
  };

  for (let i = 0; i < surahNumbers.length; i++) {
    if (control.cancelled) return { failures, cancelled: true };

    const s = surahNumbers[i];
    // Defensive: fetchAudioEditions only returns complete (114/114)
    // reciters, so this should never actually trigger — kept as a safety
    // net in case that ever changes.
    if (!edition.availableSurahs.includes(s)) {
      failures.push({ surah: s, reason: "This reciter doesn't have this Surah available." });
    } else {
      const already = await isSurahDownloaded(edition.identifier, s);
      if (!already) {
        const dest = localSurahAudioPath(edition.identifier, s);
        let succeeded = false;
        let lastError: any = null;
        let lastKnownWritten = 0;
        let lastKnownExpected = 0;

        // Retry loop: a failure while online is a real per-file failure
        // (don't retry forever). A failure while offline pauses here,
        // polling connectivity, and auto-resumes by restarting the SAME
        // file once back online — this is the "auto-pause/resume on
        // disconnect" behavior. (Restart-from-scratch, not byte-offset
        // resume — a possible future upgrade, not needed for this fix.)
        while (!succeeded && !control.cancelled) {
          const task = FileSystem.createDownloadResumable(
            mp3QuranSurahUrl(edition.server, s),
            dest,
            {},
            (progress) => {
              lastKnownWritten = progress.totalBytesWritten;
              lastKnownExpected = progress.totalBytesExpectedToWrite;
              emitProgress(i, lastKnownWritten, lastKnownExpected, false);
            },
          );
          control.activeTask = task;
          try {
            const result = await task.downloadAsync();
            control.activeTask = null;
            if (result) {
              if (lastKnownExpected > 0) {
                bytesFromCompletedFiles += lastKnownExpected;
                totalExpectedBytesSeen += lastKnownExpected;
                filesWithKnownSize += 1;
              }
              succeeded = true;
            } else {
              // downloadAsync() resolved with null: the task was paused.
              // On this code path that only happens via the Cancel
              // button's pauseAsync() call above — treat as a real cancel.
              return { failures, cancelled: true };
            }
          } catch (e: any) {
            control.activeTask = null;
            lastError = e;
            const online = await hasInternetConnection();
            if (online) {
              // Genuine failure (server error, bad file, timeout while
              // actually connected) — don't retry indefinitely.
              break;
            }
            const pauseStartedAt = Date.now();
            emitProgress(i, lastKnownWritten, lastKnownExpected, true);
            while (!(await hasInternetConnection()) && !control.cancelled) {
              await new Promise((resolve) => setTimeout(resolve, CONNECTIVITY_POLL_MS));
            }
            pausedMs += Date.now() - pauseStartedAt;
            // Falls back to the top of the while loop: retries this same
            // file if connection returned, or exits if cancelled meanwhile.
          }
        }

        if (control.cancelled) return { failures, cancelled: true };

        if (!succeeded) {
          console.warn(`Quran download failed for surah ${s}, edition ${edition.identifier}`, lastError);
          const reason =
            typeof lastError?.message === "string" && lastError.message.length > 0 && lastError.message.length < 200
              ? lastError.message
              : "Network error while downloading this Surah.";
          failures.push({ surah: s, reason });
        }
      }
    }

    emitProgress(i + 1, 0, 0, false);
  }
  return { failures, cancelled: false };
}

// Checks, in parallel, which of the 114 Surahs are already downloaded for
// a given reciter — local filesystem checks only, fast even at 114 calls.
// Used to drive the per-Surah download indicator in the Surah list.
export async function getDownloadedSurahSet(editionIdentifier: string): Promise<Set<number>> {
  const checks = await Promise.all(
    Array.from({ length: 114 }, (_, i) => i + 1).map(async (s) => ({
      s,
      exists: await isSurahDownloaded(editionIdentifier, s),
    })),
  );
  return new Set(checks.filter((c) => c.exists).map((c) => c.s));
}

export async function deleteSingleSurahAudio(editionIdentifier: string, surahNumber: number): Promise<void> {
  try {
    await FileSystem.deleteAsync(localSurahAudioPath(editionIdentifier, surahNumber), { idempotent: true });
  } catch {}
}

export async function deleteDownloadedQuranAudio(editionIdentifier: string): Promise<void> {
  const dir = localSurahAudioDir(editionIdentifier);
  try {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch {}
}

export async function getDownloadedEditions(): Promise<string[]> {
  const raw = await storage.getItem(K_DOWNLOADED_EDITIONS, "");
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function markEditionDownloaded(editionIdentifier: string): Promise<string[]> {
  const list = await getDownloadedEditions();
  if (!list.includes(editionIdentifier)) list.push(editionIdentifier);
  await storage.setItem(K_DOWNLOADED_EDITIONS, JSON.stringify(list));
  return list;
}

export async function unmarkEditionDownloaded(editionIdentifier: string): Promise<string[]> {
  const list = (await getDownloadedEditions()).filter((e) => e !== editionIdentifier);
  await storage.setItem(K_DOWNLOADED_EDITIONS, JSON.stringify(list));
  return list;
}
