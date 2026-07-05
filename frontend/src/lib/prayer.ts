// Prayer domain types + helpers.

export type PrayerKey = "fajr" | "sunrise" | "zuhr" | "asr" | "maghrib" | "isha";

export const PRAYER_ORDER: PrayerKey[] = ["fajr", "sunrise", "zuhr", "asr", "maghrib", "isha"];

export const PRAYER_LABELS: Record<PrayerKey, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  zuhr: "Zuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

export const PRAYER_ICONS: Record<PrayerKey, string> = {
  fajr: "cloudy-night-outline",
  sunrise: "partly-sunny-outline",
  zuhr: "sunny-outline",
  asr: "sunny-outline",
  maghrib: "cloudy-night-outline",
  isha: "moon-outline",
};

// Which time to use for the alarm/display per requirements.
// Fajr/Zuhr/Asr/Isha -> Jamaat, Maghrib -> Prayer(start), Sunrise -> start (no alarm).
export const ALARM_SOURCE: Record<PrayerKey, "start" | "jamaat"> = {
  fajr: "jamaat",
  sunrise: "start",
  zuhr: "jamaat",
  asr: "jamaat",
  maghrib: "start",
  isha: "jamaat",
};

export type TimePair = { start: string; jamaat: string };

export type DayRow = {
  date: string;
  day?: string;
  hijri?: string;
  fajr: TimePair;
  sunrise: string;
  zuhr: TimePair;
  asr: TimePair;
  maghrib: TimePair;
  isha: TimePair;
};

export type Timetable = {
  id?: string;
  month?: string;
  year?: string;
  rows: DayRow[];
};

export type AlarmConfig = {
  enabled: boolean;
  sound: string; // 'beep' | 'short_adhan' | 'full_adhan' | 'custom'
  volume: number; // 0..1
  vibration: boolean;
  snooze: boolean;
  preAlarmMinutes: number; // 0 = off; ring this many minutes before the anchor time
  customUri?: string; // local uri of user-uploaded MP3 (when sound === 'custom')
  customName?: string; // display name of the uploaded file
};

export const SOUND_OPTIONS = [
  { id: "beep", label: "Beep" },
  { id: "short_adhan", label: "Short Adhan" },
  { id: "full_adhan", label: "Full Adhan" },
  { id: "custom", label: "Custom MP3" },
];

export const PRE_ALARM_PRESETS = [0, 5, 10, 15];

export function defaultAlarmConfig(key: PrayerKey): AlarmConfig {
  return {
    enabled: key !== "sunrise",
    sound: "beep",
    volume: 0.8,
    vibration: true,
    snooze: false,
    preAlarmMinutes: 0,
  };
}

// Return the display/alarm time string ("HH:MM") for a prayer from a row.
export function prayerTime(row: DayRow, key: PrayerKey): string {
  if (key === "sunrise") return row.sunrise || "";
  const pair = row[key] as TimePair;
  const src = ALARM_SOURCE[key];
  return (src === "jamaat" ? pair?.jamaat : pair?.start) || pair?.start || "";
}

// Return start & jamaat display strings for a prayer. jamaat is null for sunrise.
export function startJamaat(row: DayRow, key: PrayerKey): { start: string; jamaat: string | null } {
  if (key === "sunrise") return { start: row.sunrise || "", jamaat: null };
  const pair = row[key] as TimePair;
  return { start: pair?.start || "", jamaat: pair?.jamaat || "" };
}

// Build a Date for today at the given HH:MM.
export function timeToDate(hhmm: string, base: Date = new Date()): Date | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

export function formatTime(hhmm: string, is24h: boolean): string {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return "--:--";
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (is24h) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const period = h >= 12 ? "PM" : "AM";
  let hr = h % 12;
  if (hr === 0) hr = 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

// Find today's row by matching date-of-month.
export function findTodayRow(tt: Timetable | null, now: Date = new Date()): DayRow | null {
  if (!tt || !tt.rows?.length) return null;
  const d = String(now.getDate());
  const found = tt.rows.find((r) => String(parseInt(r.date, 10)) === d);
  return found || null;
}

export type PrayerStatus = "past" | "current" | "upcoming";

// Determine current/next prayer among the row. "current" = the next upcoming alarm prayer.
export function computeStatuses(
  row: DayRow | null,
  showSunrise: boolean,
  now: Date = new Date(),
): Record<PrayerKey, PrayerStatus> {
  const result = {} as Record<PrayerKey, PrayerStatus>;
  if (!row) {
    PRAYER_ORDER.forEach((k) => (result[k] = "upcoming"));
    return result;
  }
  const keys = PRAYER_ORDER.filter((k) => (k === "sunrise" ? showSunrise : true));
  let currentSet = false;
  for (const k of keys) {
    const t = timeToDate(prayerTime(row, k), now);
    if (!t) {
      result[k] = "upcoming";
      continue;
    }
    if (t.getTime() <= now.getTime()) {
      result[k] = "past";
    } else if (!currentSet) {
      result[k] = "current";
      currentSet = true;
    } else {
      result[k] = "upcoming";
    }
  }
  PRAYER_ORDER.forEach((k) => {
    if (!(k in result)) result[k] = "upcoming";
  });
  return result;
}

export function nextPrayerInfo(
  row: DayRow | null,
  showSunrise: boolean,
  now: Date = new Date(),
): { key: PrayerKey; time: string; date: Date } | null {
  if (!row) return null;
  const keys = PRAYER_ORDER.filter((k) => (k === "sunrise" ? showSunrise : true));
  for (const k of keys) {
    const t = timeToDate(prayerTime(row, k), now);
    if (t && t.getTime() > now.getTime()) {
      return { key: k, time: prayerTime(row, k), date: t };
    }
  }
  return null;
}

export function countdownString(target: Date, now: Date = new Date()): string {
  let diff = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  diff -= h * 3600;
  const m = Math.floor(diff / 60);
  const s = diff - m * 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
