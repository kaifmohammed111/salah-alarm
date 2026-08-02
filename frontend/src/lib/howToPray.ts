// Content and step-generation for the "How to Pray" feature. Deliberately
// built as one shared template engine (see buildRakahSteps /
// buildSegmentSteps) rather than hand-writing separate step lists per
// segment, since every segment (whether Sunnah, Fard, Nafl, or Witr)
// follows the same core rakah structure — just a different rakah count,
// audibility, and classification label — this keeps everything
// consistent and avoids duplicating (and risking drift in) the same
// core sequence many times over.
//
// IMPORTANT: this content reflects commonly-taught, widely-agreed basics
// of the daily prayers, illustrated with real Hanafi-specific artwork
// (hand position, etc.). The Sunnah-emphasis classifications
// (Mu'akkadah / Ghair Mu'akkadah) for segments not explicitly specified
// follow common Hanafi teaching, but this is NOT a substitute for
// guidance from a qualified local scholar or imam. The UI surfaces this
// disclaimer directly to users — see app/(tabs)/how-to-pray.tsx.

import { PrayerPose } from "@/src/components/PrayerPostureIllustration";

export type Fiqh = "hanafi" | "shafii" | "maliki" | "hanbali";

export const FIQH_OPTIONS: { key: Fiqh; label: string }[] = [
  { key: "hanafi", label: "Hanafi" },
  { key: "shafii", label: "Shafi'i" },
  { key: "maliki", label: "Maliki" },
  { key: "hanbali", label: "Hanbali" },
];

export type PrayerStep = {
  id: string;
  title: string;
  description: string;
  pose: PrayerPose;
};

export type SegmentType = "sunnah-muakkadah" | "sunnah-ghair-muakkadah" | "fard" | "nafl" | "wajib";

export const SEGMENT_TYPE_LABELS: Record<SegmentType, string> = {
  "sunnah-muakkadah": "Sunnah (Mu'akkadah) / Emphasized Sunnah",
  "sunnah-ghair-muakkadah": "Sunnah (Ghair Mu'akkadah) / Non Emphasized Sunnah",
  fard: "Fard / Compulsory",
  nafl: "Nafl",
  wajib: "Wajib / Compulsory",
};

export type PrayerSegment = {
  id: string;
  type: SegmentType;
  rakahCount: number;
  // Optional display-label override for a specific segment instance —
  // used when the generic SEGMENT_TYPE_LABELS text for this segment's
  // `type` isn't specific enough (e.g. Isha's Witr is type "wajib" but
  // should read "Witr (Wajib) / Compulsory" instead of the generic
  // "Wajib / Compulsory" label). Rendering code must prefer this over
  // SEGMENT_TYPE_LABELS[type] when present.
  labelOverride?: string;
  // Which rakahs (1-indexed) have audible (jahri) recitation — the rest
  // are silent (sirri). Fard rakahs follow the standard per-prayer
  // audibility rule; Sunnah/Nafl prayed individually are conventionally
  // taught as recited quietly, and Witr commonly follows Isha's audible
  // pattern when prayed alone at night — reasonable, widely-taught
  // defaults rather than an exhaustively verified rule for every case.
  audibleRakahs: number[];
  // Hanafi Witr-specific: the final rakah includes the Qunut
  // supplication (raise hands, takbir, fold hands again, silently
  // recite Dua-e-Qunut) immediately before Ruku — regular prayers don't
  // have this step at all.
  qunutInFinalRakah?: boolean;
};

export type DailyPrayerKey = "fajr" | "zuhr" | "asr" | "maghrib" | "isha";

export type DailyPrayerInfo = {
  key: DailyPrayerKey;
  label: string;
  segments: PrayerSegment[];
};

// HANAFI-SPECIFIC. The Sunnah/Nafl rakah counts and Mu'akkadah/Ghair
// Mu'akkadah/Wajib classifications below follow Hanafi fiqh specifically
// — other madhabs have genuinely different structures (e.g., Shafi'i
// treats Witr as Sunnah, not Wajib, and doesn't have the Qunut-in-Witr
// step the same way; rakah counts around the obligatory prayers differ
// too). When Shafi'i/Maliki/Hanbali content gets built, each needs its
// OWN separate array here — none of them should reuse this one. See
// getDailyPrayersForFiqh() below, which is deliberately structured to
// make that explicit rather than implicit.
const DAILY_PRAYERS_HANAFI: DailyPrayerInfo[] = [
  {
    key: "fajr",
    label: "Fajr",
    segments: [
      { id: "fajr-sunnah", type: "sunnah-muakkadah", rakahCount: 2, audibleRakahs: [] },
      { id: "fajr-fard", type: "fard", rakahCount: 2, audibleRakahs: [1, 2] },
    ],
  },
  {
    key: "zuhr",
    label: "Dhuhr",
    segments: [
      { id: "zuhr-sunnah1", type: "sunnah-muakkadah", rakahCount: 4, audibleRakahs: [] },
      { id: "zuhr-fard", type: "fard", rakahCount: 4, audibleRakahs: [] },
      { id: "zuhr-sunnah2", type: "sunnah-muakkadah", rakahCount: 2, audibleRakahs: [] },
      { id: "zuhr-nafl", type: "nafl", rakahCount: 2, audibleRakahs: [] },
    ],
  },
  {
    key: "asr",
    label: "Asr",
    segments: [
      { id: "asr-sunnah", type: "sunnah-ghair-muakkadah", rakahCount: 4, audibleRakahs: [] },
      { id: "asr-fard", type: "fard", rakahCount: 4, audibleRakahs: [] },
    ],
  },
  {
    key: "maghrib",
    label: "Maghrib",
    segments: [
      { id: "maghrib-fard", type: "fard", rakahCount: 3, audibleRakahs: [1, 2] },
      { id: "maghrib-sunnah", type: "sunnah-muakkadah", rakahCount: 2, audibleRakahs: [] },
      { id: "maghrib-nafl", type: "nafl", rakahCount: 2, audibleRakahs: [] },
    ],
  },
  {
    key: "isha",
    label: "Isha",
    segments: [
      { id: "isha-sunnah1", type: "sunnah-ghair-muakkadah", rakahCount: 4, audibleRakahs: [] },
      { id: "isha-fard", type: "fard", rakahCount: 4, audibleRakahs: [1, 2] },
      { id: "isha-sunnah2", type: "sunnah-muakkadah", rakahCount: 2, audibleRakahs: [] },
      { id: "isha-nafl1", type: "nafl", rakahCount: 2, audibleRakahs: [] },
      { id: "isha-witr", type: "wajib", rakahCount: 3, audibleRakahs: [1, 2, 3], qunutInFinalRakah: true, labelOverride: "Witr (Wajib) / Compulsory" },
      { id: "isha-nafl2", type: "nafl", rakahCount: 2, audibleRakahs: [] },
    ],
  },
];

// Returns the correct segment structure for a given fiqh — currently
// only Hanafi has real content (matching the app's current
// Hanafi-only-selectable state); other madhabs return an empty array
// rather than silently falling back to Hanafi's structure, so a future
// mistake here fails obviously (empty list) instead of showing
// incorrect fiqh-mismatched content.
export function getDailyPrayersForFiqh(fiqh: Fiqh): DailyPrayerInfo[] {
  if (fiqh === "hanafi") return DAILY_PRAYERS_HANAFI;
  return [];
}

// Categories shown on the main "How to Pray" list, grouped under their
// own section headers. Only "daily" has real, tappable content right
// now — the rest are placeholders (disabled, "Coming Soon") until their
// own content is built, but the structure/grouping is all here so
// adding them later doesn't require restructuring the screen.
export type PrayerCategoryKey = "daily" | "wudu" | "taraweeh" | "tahajjud" | "janazah" | "eid";

export const PRAYER_CATEGORIES: { key: PrayerCategoryKey; label: string; available: boolean }[] = [
  { key: "daily", label: "Daily Prayers", available: true },
  { key: "wudu", label: "Wudu", available: false },
  { key: "taraweeh", label: "Taraweeh", available: false },
  { key: "tahajjud", label: "Tahajjud", available: false },
  { key: "janazah", label: "Janazah", available: false },
  { key: "eid", label: "Eid", available: false },
];

// Builds the full step sequence for ONE rakah. isFirstRakah controls
// whether the Niyyah (intention), opening takbir, and opening
// supplication are included — these only happen once, at the very start
// of the prayer, not repeated each rakah. includeQunut is only ever
// true for Hanafi Witr's third rakah.
function buildRakahSteps(rakahNumber: number, isFirstRakah: boolean, audible: boolean, includeQunut: boolean): PrayerStep[] {
  const steps: PrayerStep[] = [];

  if (isFirstRakah) {
    steps.push({
      id: `r${rakahNumber}-niyyah`,
      title: "Niyyah (Intention)",
      description: "Make the intention in your heart to pray this specific prayer, facing the Qiblah. The intention does not need to be spoken aloud.",
      pose: "niyyah",
    });
    steps.push({
      id: `r${rakahNumber}-takbir`,
      title: "Opening Takbir (Takbiratul Ihram)",
      description: "Raise your hands and say \"Allahu Akbar\" (Allah is the Greatest) to begin the prayer, then fold your hands as shown.",
      pose: "takbir",
    });
    steps.push({
      id: `r${rakahNumber}-thana`,
      title: "Opening Supplication",
      description: "Recite the opening supplication (thana) silently, praising Allah before beginning recitation.",
      pose: "standing-navel",
    });
  } else {
    steps.push({
      id: `r${rakahNumber}-stand`,
      title: `Stand for Rakah ${rakahNumber}`,
      description: "Rise to standing and fold your hands as shown.",
      pose: "standing-navel",
    });
  }

  steps.push({
    id: `r${rakahNumber}-fatiha`,
    title: "Surah Al-Fatiha",
    description: audible
      ? "Recite Surah Al-Fatiha aloud."
      : "Recite Surah Al-Fatiha silently.",
    pose: "standing-navel",
  });
  steps.push({
    id: `r${rakahNumber}-surah`,
    title: "Additional Surah",
    description: audible
      ? "Recite a surah or passage from the Quran aloud, following Al-Fatiha."
      : "Recite a surah or passage from the Quran silently, following Al-Fatiha.",
    pose: "standing-navel",
  });

  if (includeQunut) {
    steps.push({
      id: `r${rakahNumber}-qunut`,
      title: "Qunut Supplication",
      description: "Before bowing, raise your hands and say \"Allahu Akbar\", fold your hands again, and silently recite Dua-e-Qunut.",
      pose: "takbir",
    });
  }

  steps.push({
    id: `r${rakahNumber}-ruku`,
    title: "Ruku (Bowing)",
    description: "Say \"Allahu Akbar\" and bow, placing your hands on your knees with your back straight. Say \"Subhana Rabbiyal Azeem\" (Glory be to my Lord, the Great) three times.",
    pose: "ruku",
  });

  steps.push({
    id: `r${rakahNumber}-qaumah`,
    title: "Qaumah (Rising from Ruku)",
    description: "Rise to standing, saying \"Sami Allahu liman hamidah\" (Allah hears whoever praises Him), then \"Rabbana lakal hamd\" (Our Lord, praise be to You) once standing straight.",
    pose: "qaumah",
  });

  steps.push({
    id: `r${rakahNumber}-sujood1`,
    title: "First Sajdah (Prostration)",
    description: "Say \"Allahu Akbar\" and lower into prostration, with forehead, nose, palms, knees, and toes touching the ground. Say \"Subhana Rabbiyal A'la\" (Glory be to my Lord, the Most High) three times.",
    pose: "sajdah",
  });

  steps.push({
    id: `r${rakahNumber}-jalsa`,
    title: "Sitting Between Prostrations",
    description: "Say \"Allahu Akbar\" and sit up briefly, resting on your left foot.",
    pose: "sitting",
  });

  steps.push({
    id: `r${rakahNumber}-sujood2`,
    title: "Second Sajdah (Prostration)",
    description: "Say \"Allahu Akbar\" and prostrate again, repeating \"Subhana Rabbiyal A'la\" three times.",
    pose: "sajdah",
  });

  return steps;
}

// Builds the full step sequence for ONE complete prayer segment (a full
// Niyyah-through-Taslim cycle) — used for every segment (Sunnah, Fard,
// Nafl, Witr) identically, since each is its own complete unit of
// prayer regardless of classification.
export function buildSegmentSteps(segment: PrayerSegment): PrayerStep[] {
  const steps: PrayerStep[] = [];

  for (let r = 1; r <= segment.rakahCount; r++) {
    const isFirst = r === 1;
    const isFinalRakah = r === segment.rakahCount;
    const audible = segment.audibleRakahs.includes(r);
    const includeQunut = !!segment.qunutInFinalRakah && isFinalRakah;
    steps.push(...buildRakahSteps(r, isFirst, audible, includeQunut));

    const isMidTashahhud = r === 2 && segment.rakahCount > 2;

    if (isMidTashahhud) {
      steps.push({
        id: `r${r}-tashahhud-mid`,
        title: "Sit for Tashahhud",
        description: "Sit and recite At-Tahiyyat (the testimony of faith).",
        pose: "sitting",
      });
      steps.push({
        id: `r${r}-stand-after-mid`,
        title: `Stand for Rakah ${r + 1}`,
        description: "Rise to standing for the next rakah without saying salam.",
        pose: "standing-navel",
      });
    } else if (isFinalRakah) {
      steps.push({
        id: `r${r}-tashahhud-final`,
        title: "Final Tashahhud",
        description: "Sit and recite At-Tahiyyat, followed by Salawat (blessings upon the Prophet), then any additional supplication.",
        pose: "sitting",
      });
      steps.push({
        id: `r${r}-taslim-right`,
        title: "Taslim — Turn Right",
        description: "Turn your head to the right saying \"Assalamu alaikum wa rahmatullah\" (Peace and mercy of Allah be upon you).",
        pose: "salaam-right",
      });
      steps.push({
        id: `r${r}-taslim-left`,
        title: "Taslim — Turn Left",
        description: "Turn your head to the left, repeating the same salutation, ending the prayer.",
        pose: "salaam-left",
      });
    }
  }

  return steps;
}
