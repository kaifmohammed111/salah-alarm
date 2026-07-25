// Al Quran Cloud API client — free, no API key required, no usage
// restrictions. https://alquran.cloud/api
//
// Quran text itself carries no copyright; audio recitations are served
// through this API's CDN (cdn.islamic.network) specifically for this kind
// of programmatic/offline use.
import * as FileSystem from "expo-file-system/legacy";
import { storage } from "@/src/utils/storage";

const BASE = "https://api.alquran.cloud/v1";
const CDN = "https://cdn.islamic.network/quran";

// Standard Arabic Uthmani-script text edition, and Saheeh International's
// widely-used English translation — both stable, long-standing edition
// identifiers on this API.
const ARABIC_EDITION = "quran-uthmani";
const ENGLISH_EDITION = "en.sahih";

const K_SURAH_LIST = "quran.surahList";
const K_AUDIO_EDITIONS = "quran.audioEditions";
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
  language: string;
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

const K_VERIFIED_AUDIO_EDITIONS = "quran.verifiedAudioEditions";

// FIX: /edition/format/audio lists every Arabic AUDIO edition on the API —
// but that list includes reciters who only have per-AYAH audio bundled,
// not full-SURAH files (confirmed via the CDN's own documentation: surah
// audio is a separate, smaller set of reciters than the general ayah-audio
// list). This is what caused some reciters to "not load" while others
// (Basit, Basfar, Alafasy) worked fine — those happen to have surah-level
// files, others in the general list don't.
//
// A second external index file exists that's meant to list which editions
// have surah-level audio (cdn_surah_audio.json), but its documented URL
// returned a 404 when checked, and there's at least one recent community
// report of that CDN infrastructure being intermittently unavailable — so
// rather than depend on a second external source I can't currently verify,
// this checks directly against the real audio CDN itself: a quick HEAD
// request for each candidate reciter's Surah 1 file. This tests the exact
// thing that actually matters (does this reciter's full-surah audio
// exist) rather than trusting external metadata that might be stale or
// unreachable. Runs once and the verified result is cached indefinitely,
// same as everything else here.
async function hasFullSurahAudio(edition: string): Promise<boolean> {
  try {
    const res = await fetch(surahAudioUrl(edition, 1), { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

// Filtered to Arabic-language reciters only — translated/other-language
// audio editions on this API aren't relevant for a Quran recitation picker
// — and further filtered to only those confirmed to actually have
// full-Surah audio files (see hasFullSurahAudio above).
export async function fetchAudioEditions(): Promise<AudioEdition[]> {
  const cachedVerified = await storage.getItem(K_VERIFIED_AUDIO_EDITIONS, "");
  if (cachedVerified) {
    try {
      return JSON.parse(cachedVerified);
    } catch {}
  }

  let arabicOnly: AudioEdition[];
  const cached = await storage.getItem(K_AUDIO_EDITIONS, "");
  if (cached) {
    try {
      arabicOnly = JSON.parse(cached);
    } catch {
      arabicOnly = [];
    }
  } else {
    const data = (await fetchJson(`${BASE}/edition/format/audio`)) as AudioEdition[];
    arabicOnly = data.filter((e) => e.language === "ar");
    await storage.setItem(K_AUDIO_EDITIONS, JSON.stringify(arabicOnly));
  }

  const checks = await Promise.all(
    arabicOnly.map(async (e) => ({ edition: e, ok: await hasFullSurahAudio(e.identifier) })),
  );
  const verified = checks.filter((c) => c.ok).map((c) => c.edition);
  await storage.setItem(K_VERIFIED_AUDIO_EDITIONS, JSON.stringify(verified));
  return verified;
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
  // FIX: the multi-edition endpoint (/editions/ed1,ed2) is only ever
  // documented for /surah/ — every source describing the Juz endpoint
  // consistently shows it as single-edition only (/juz/{n}/{edition}).
  // Assuming the same multi-edition pattern worked for Juz too (without
  // confirming it) was the actual cause of "Could not load this Juz."
  // Two separate single-edition requests use only the endpoint shape
  // that's actually confirmed to exist, then combine them client-side by
  // ayah order — same technique already used for Surah, just two calls
  // instead of one.
  const [arabicData, englishData] = await Promise.all([
    fetchJson(`${BASE}/juz/${juzNumber}/${ARABIC_EDITION}`),
    fetchJson(`${BASE}/juz/${juzNumber}/${ENGLISH_EDITION}`),
  ]);
  const result = { arabic: arabicData.ayahs, english: englishData.ayahs };
  await storage.setItem(cacheKey, JSON.stringify(result));
  return result;
}

// Direct CDN URL for a full-Surah audio file — used both for streaming
// (Listen mode, before download) and as the source to download from.
export function surahAudioUrl(edition: string, surahNumber: number, bitrate: 32 | 40 | 48 | 64 | 128 | 192 = 128): string {
  return `${CDN}/audio-surah/${bitrate}/${edition}/${surahNumber}.mp3`;
}

function localSurahAudioDir(edition: string): string {
  return `${FileSystem.documentDirectory}quran-audio/${edition}/`;
}

export function localSurahAudioPath(edition: string, surahNumber: number): string {
  return `${localSurahAudioDir(edition)}${surahNumber}.mp3`;
}

export async function isSurahDownloaded(edition: string, surahNumber: number): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(localSurahAudioPath(edition, surahNumber));
    return info.exists;
  } catch {
    return false;
  }
}

// Downloads all 114 Surahs for one reciter, sequentially (not in parallel —
// avoids hammering the CDN or the device's network stack with 114
// simultaneous requests). Skips any file already present, so a retry after
// a partial/failed download only fetches what's missing rather than
// starting over.
//
// FIX: an individual Surah failing to download (e.g. a reciter that passed
// the Surah-1 check but is genuinely missing one specific file) no longer
// aborts the entire 114-Surah download — it's skipped and reported back so
// the caller can tell the user, rather than the whole download silently
// stopping partway with no explanation.
export async function downloadFullQuranAudio(
  edition: string,
  onProgress: (done: number, total: number) => void,
): Promise<{ failedSurahs: number[] }> {
  const dir = localSurahAudioDir(edition);
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // Directory may already exist — fine, ignore.
  }
  const failedSurahs: number[] = [];
  for (let s = 1; s <= 114; s++) {
    const dest = localSurahAudioPath(edition, s);
    const already = await isSurahDownloaded(edition, s);
    if (!already) {
      try {
        await FileSystem.downloadAsync(surahAudioUrl(edition, s), dest);
      } catch (e) {
        console.warn(`Quran download failed for surah ${s}, edition ${edition}`, e);
        failedSurahs.push(s);
      }
    }
    onProgress(s, 114);
  }
  return { failedSurahs };
}

export async function deleteDownloadedQuranAudio(edition: string): Promise<void> {
  const dir = localSurahAudioDir(edition);
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

export async function markEditionDownloaded(edition: string): Promise<string[]> {
  const list = await getDownloadedEditions();
  if (!list.includes(edition)) list.push(edition);
  await storage.setItem(K_DOWNLOADED_EDITIONS, JSON.stringify(list));
  return list;
}

export async function unmarkEditionDownloaded(edition: string): Promise<string[]> {
  const list = (await getDownloadedEditions()).filter((e) => e !== edition);
  await storage.setItem(K_DOWNLOADED_EDITIONS, JSON.stringify(list));
  return list;
}
