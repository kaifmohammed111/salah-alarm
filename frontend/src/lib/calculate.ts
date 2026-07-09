import { CalculationMethod, CalculationParameters, Coordinates, Madhab, PrayerTimes } from "adhan";
import tzlookup from "tz-lookup";
import { DayRow, Timetable } from "./prayer";
import { formatHijri } from "./hijri";

export type CalcMethodKey =
  | "MuslimWorldLeague"
  | "NorthAmerica"
  | "Egyptian"
  | "UmmAlQura"
  | "Karachi"
  | "Dubai"
  | "MoonsightingCommittee"
  | "Kuwait"
  | "Qatar"
  | "Singapore"
  | "Tehran"
  | "Turkey"
  | "Algeria"
  | "FranceAngle15"
  | "FranceAngle18"
  | "Jakim"
  | "UOIF"
  | "Kemenag"
  | "Jafari"
  | "Tunisia"
  | "Gulf"
  | "Jordan"
  | "Portugal"
  | "Russia"
  | "Morocco";

export const CALC_METHODS: { key: CalcMethodKey; label: string }[] = [
  { key: "MuslimWorldLeague", label: "Muslim World League" },
  { key: "NorthAmerica", label: "Islamic Society of North America (ISNA)" },
  { key: "Egyptian", label: "Egyptian General Authority of Survey" },
  { key: "UmmAlQura", label: "Umm Al-Qura University, Makkah" },
  { key: "Karachi", label: "University of Islamic Sciences, Karachi" },
  { key: "Dubai", label: "Dubai" },
  { key: "MoonsightingCommittee", label: "Moonsighting Committee Worldwide" },
  { key: "Kuwait", label: "Kuwait" },
  { key: "Qatar", label: "Qatar" },
  { key: "Singapore", label: "Singapore" },
  { key: "Tehran", label: "University of Tehran" },
  { key: "Turkey", label: "Directorate of Religious Affairs, Turkey" },
  { key: "Algeria", label: "Algerian Ministry of Religious Affairs and Wakfs" },
  { key: "FranceAngle15", label: "France - Angle 15" },
  { key: "FranceAngle18", label: "France - Angle 18" },
  { key: "UOIF", label: "Musulmans de France (ex-UOIF) - Angle 12" },
  { key: "Jakim", label: "JAKIM (Jabatan Kemajuan Islam Malaysia)" },
  { key: "Kemenag", label: "SIHAT/KEMENAG (Kementerian Agama RI)" },
  { key: "Jafari", label: "Shia Ithna Ashari (Jafari)" },
  { key: "Tunisia", label: "Tunisian Ministry of Religious Affairs" },
  { key: "Gulf", label: "Gulf Region" },
  { key: "Jordan", label: "Ministry of Awqaf, Jordan" },
  { key: "Portugal", label: "Comunidade Islamica de Lisboa" },
  { key: "Russia", label: "Spiritual Administration of Muslims of Russia" },
  { key: "Morocco", label: "Morocco" },
];

// Angles sourced from Adhan's official method data (api.aladhan.com/v1/methods)
// for methods not already built into the adhan-js library.
function customParams(opts: {
  fajrAngle: number;
  ishaAngle?: number;
  ishaIntervalMinutes?: number;
  maghribAngle?: number;
}): CalculationParameters {
  const params = CalculationMethod.Other();
  params.fajrAngle = opts.fajrAngle;
  if (opts.ishaIntervalMinutes) {
    params.ishaInterval = opts.ishaIntervalMinutes;
  } else if (opts.ishaAngle != null) {
    params.ishaAngle = opts.ishaAngle;
  }
  if (opts.maghribAngle != null) {
    params.maghribAngle = opts.maghribAngle;
  }
  return params;
}

function getParams(methodKey: CalcMethodKey, asrMethod: "hanafi" | "shafi") {
  let params: CalculationParameters;
  switch (methodKey) {
    case "MuslimWorldLeague":
      params = CalculationMethod.MuslimWorldLeague();
      break;
    case "NorthAmerica":
      params = CalculationMethod.NorthAmerica();
      break;
    case "Egyptian":
      params = CalculationMethod.Egyptian();
      break;
    case "UmmAlQura":
      params = CalculationMethod.UmmAlQura();
      break;
    case "Karachi":
      params = CalculationMethod.Karachi();
      break;
    case "Dubai":
      params = CalculationMethod.Dubai();
      break;
    case "MoonsightingCommittee":
      params = CalculationMethod.MoonsightingCommittee();
      break;
    case "Kuwait":
      params = CalculationMethod.Kuwait();
      break;
    case "Qatar":
      params = CalculationMethod.Qatar();
      break;
    case "Singapore":
      params = CalculationMethod.Singapore();
      break;
    case "Tehran":
      params = customParams({ fajrAngle: 17.7, ishaAngle: 14, maghribAngle: 4.5 });
      break;
    case "Turkey":
      params = CalculationMethod.Turkey();
      break;
    case "Algeria":
      params = customParams({ fajrAngle: 18, ishaAngle: 17 });
      break;
    case "FranceAngle15":
      params = customParams({ fajrAngle: 15, ishaAngle: 15 });
      break;
    case "FranceAngle18":
      params = customParams({ fajrAngle: 18, ishaAngle: 18 });
      break;
    case "UOIF":
      params = customParams({ fajrAngle: 12, ishaAngle: 12 });
      break;
    case "Jakim":
      params = customParams({ fajrAngle: 20, ishaAngle: 18 });
      break;
    case "Kemenag":
      params = customParams({ fajrAngle: 20, ishaAngle: 18 });
      break;
    case "Jafari":
      params = customParams({ fajrAngle: 16, ishaAngle: 14, maghribAngle: 4 });
      break;
    case "Tunisia":
      params = customParams({ fajrAngle: 18, ishaAngle: 18 });
      break;
    case "Gulf":
      params = customParams({ fajrAngle: 19.5, ishaIntervalMinutes: 90 });
      break;
    case "Jordan":
      params = customParams({ fajrAngle: 18, ishaAngle: 18 });
      break;
    case "Portugal":
      params = customParams({ fajrAngle: 18, ishaIntervalMinutes: 77 });
      break;
    case "Russia":
      params = customParams({ fajrAngle: 16, ishaAngle: 15 });
      break;
    case "Morocco":
      params = customParams({ fajrAngle: 19, ishaAngle: 17 });
      break;
    default:
      params = CalculationMethod.MuslimWorldLeague();
  }
  params.madhab = asrMethod === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  return params;
}

// Formats a Date's clock time in a SPECIFIC timezone, not the device's own.
// Using raw .getHours()/.getMinutes() always reads in the device's local
// timezone — fine when calculating for your own physical location (GPS
// mode), but wrong whenever the target coordinates are in a different
// timezone than the device (manual coordinate entry for another region).
function hhmm(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}:${mm}`;
}

/**
 * Generate a full month's prayer timetable from GPS coordinates using a
 * standard astronomical calculation method, as an alternative to CSV import
 * for users whose mosque doesn't publish one. Jamaat (congregation) times
 * are inherently mosque-specific and can't be derived astronomically, so
 * they're left blank — the app already renders those as "N/A".
 */
/**
 * Compares the device's system clock against a trusted network time source
 * (the standard HTTP `Date` response header, present on virtually any HTTPS
 * response — no dependency on a specific time API that could go down).
 * Prayer time calculation needs to know the correct current date to know
 * which day/month to calculate for; if the device's clock is significantly
 * wrong, the underlying astronomical math will still be correct, just for
 * the wrong day. Returns ok:true (and doesn't block anything) if there's no
 * internet connection or the check fails — this is a best-effort sanity
 * check, not a hard requirement.
 */
export async function checkDeviceClockDrift(): Promise<{
  ok: boolean;
  driftMinutes?: number;
}> {
  try {
    const res = await fetch("https://www.google.com", { method: "HEAD" });
    const serverDateHeader = res.headers.get("date");
    if (!serverDateHeader) return { ok: true };
    const serverTime = new Date(serverDateHeader).getTime();
    const deviceTime = Date.now();
    if (isNaN(serverTime)) return { ok: true };
    const driftMinutes = Math.round(Math.abs(serverTime - deviceTime) / 60000);
    return { ok: driftMinutes <= 5, driftMinutes };
  } catch {
    return { ok: true };
  }
}

export function generateTimetableForMonth(
  lat: number,
  lon: number,
  year: number,
  monthIndex0: number, // 0-11
  methodKey: CalcMethodKey,
  asrMethod: "hanafi" | "shafi",
): Timetable {
  const coordinates = new Coordinates(lat, lon);
  const params = getParams(methodKey, asrMethod);

  // Resolve the ACTUAL timezone at the target coordinates, rather than
  // assuming the device's own timezone applies — critical for manually
  // entered coordinates far from the device's real location.
  const timeZone = tzlookup(lat, lon);

  const daysInMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const rows: DayRow[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    // Use UTC noon as the reference instant for this calendar day — avoids
    // any dependency on the device's own timezone when constructing the
    // input date; the day-granular Julian calculation inside adhan doesn't
    // need exact local noon, just an instant that falls on the right day.
    const date = new Date(Date.UTC(year, monthIndex0, day, 12, 0, 0));
    const pt = new PrayerTimes(coordinates, date, params);

    const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone }).format(date);

    rows.push({
      day: weekday,
      date: String(day),
      hijri: formatHijri(date),
      fajr: { start: hhmm(pt.fajr, timeZone), jamaat: "" },
      sunrise: hhmm(pt.sunrise, timeZone),
      zuhr: { start: hhmm(pt.dhuhr, timeZone), jamaat: "" },
      asr: { start: hhmm(pt.asr, timeZone), jamaat: "" },
      maghrib: { start: hhmm(pt.maghrib, timeZone), jamaat: "" },
      isha: { start: hhmm(pt.isha, timeZone), jamaat: "" },
    });
  }

  return {
    rows,
    isRamadan: false,
    month: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone }).format(
      new Date(Date.UTC(year, monthIndex0, 1, 12)),
    ),
    year: String(year),
    // Metadata so the app can show which method/convention produced this
    // timetable — purely informational, not used in any calculation.
    calcMethodLabel: CALC_METHODS.find((m) => m.key === methodKey)?.label ?? methodKey,
    calcAsrLabel: asrMethod === "hanafi" ? "Hanafi Asr" : "Shafi/Maliki/Hanbali Asr",
  };
}
