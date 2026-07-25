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
export async function fetchAudioEditions(): Promise<AudioEdition[]> {
  const cached = await storage.getItem(K_AUDIO_EDITIONS, "");
  if (cached) {
    try {
      return JSON.parse(cached);
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
        englishName: hasMultipleReadings ? `${r.name} (${m.name})` : r.name,
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
export async function downloadQuranAudio(
  edition: AudioEdition,
  surahNumbers: number[],
  onProgress: (done: number, total: number, etaSeconds: number | null) => void,
): Promise<{ failures: DownloadFailure[] }> {
  const dir = localSurahAudioDir(edition.identifier);
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // Directory may already exist — fine, ignore.
  }
  const failures: DownloadFailure[] = [];
  let elapsedMsSoFar = 0;
  let filesTimedSoFar = 0;

  for (let i = 0; i < surahNumbers.length; i++) {
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
        const startedAt = Date.now();
        try {
          await FileSystem.downloadAsync(mp3QuranSurahUrl(edition.server, s), dest);
          elapsedMsSoFar += Date.now() - startedAt;
          filesTimedSoFar += 1;
        } catch (e: any) {
          console.warn(`Quran download failed for surah ${s}, edition ${edition.identifier}`, e);
          const reason =
            typeof e?.message === "string" && e.message.length > 0 && e.message.length < 200
              ? e.message
              : "Network error while downloading this Surah.";
          failures.push({ surah: s, reason });
        }
      }
    }
    const doneCount = i + 1;
    const remaining = surahNumbers.length - doneCount;
    const avgMsPerFile = filesTimedSoFar > 0 ? elapsedMsSoFar / filesTimedSoFar : null;
    const etaSeconds = avgMsPerFile != null ? Math.round((avgMsPerFile * remaining) / 1000) : null;
    onProgress(doneCount, surahNumbers.length, etaSeconds);
  }
  return { failures };
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
