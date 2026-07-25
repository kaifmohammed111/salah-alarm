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

// Filtered to Arabic-language reciters only — translated/other-language
// audio editions on this API aren't relevant for a Quran recitation picker.
export async function fetchAudioEditions(): Promise<AudioEdition[]> {
  const cached = await storage.getItem(K_AUDIO_EDITIONS, "");
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }
  const data = (await fetchJson(`${BASE}/edition/format/audio`)) as AudioEdition[];
  const arabicOnly = data.filter((e) => e.language === "ar");
  await storage.setItem(K_AUDIO_EDITIONS, JSON.stringify(arabicOnly));
  return arabicOnly;
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
  const data = await fetchJson(`${BASE}/juz/${juzNumber}/editions/${ARABIC_EDITION},${ENGLISH_EDITION}`);
  const result = { arabic: data[0].ayahs, english: data[1].ayahs };
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
export async function downloadFullQuranAudio(
  edition: string,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const dir = localSurahAudioDir(edition);
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // Directory may already exist — fine, ignore.
  }
  for (let s = 1; s <= 114; s++) {
    const dest = localSurahAudioPath(edition, s);
    const already = await isSurahDownloaded(edition, s);
    if (!already) {
      await FileSystem.downloadAsync(surahAudioUrl(edition, s), dest);
    }
    onProgress(s, 114);
  }
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
