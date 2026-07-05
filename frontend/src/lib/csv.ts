import { DayRow, Timetable } from "./prayer";

// Convert a 12-hour "h:mm" (accepts "." or ":" separators, no AM/PM) to 24-hour "HH:MM".
function to24(t: string, period: "AM" | "PM"): string {
  if (!t) return "";
  const cleaned = t.trim();
  const m = cleaned.match(/^(\d{1,2})[:.](\d{2})/);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = m[2];
  if (period === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return `${String(h).padStart(2, "0")}:${min}`;
}

// Split a CSV line respecting simple quoting.
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function idx(headers: string[], ...names: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  for (const n of names) {
    const key = n.toLowerCase().replace(/[^a-z]/g, "");
    const found = lower.indexOf(key);
    if (found !== -1) return found;
  }
  return -1;
}

/**
 * Parse a monthly prayer timetable CSV.
 * Expected headers (case/spacing tolerant):
 * Day,Date,Hijri,Fajr Start,Fajr Jamaat,Sunrise,Zuhr Start,Zuhr Jamaat,
 * Asr Start,Asr Jamaat,Maghrib,Isha Start,Isha Jamaat
 * Times are 12-hour without AM/PM: Fajr & Sunrise are AM, the rest are PM.
 */
export function parseTimetableCsv(text: string): Timetable {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error("CSV has no data rows");

  const headers = splitLine(lines[0]);
  const iDay = idx(headers, "day");
  const iDate = idx(headers, "date");
  const iHijri = idx(headers, "hijri");
  const iFs = idx(headers, "fajrstart", "fajr");
  const iFj = idx(headers, "fajrjamaat", "fajriqamah", "fajrjamat");
  const iSun = idx(headers, "sunrise");
  const iZs = idx(headers, "zuhrstart", "zuhr", "dhuhrstart", "dhuhr");
  const iZj = idx(headers, "zuhrjamaat", "dhuhrjamaat");
  const iAs = idx(headers, "asrstart", "asr");
  const iAj = idx(headers, "asrjamaat");
  const iMag = idx(headers, "maghrib", "maghribstart");
  const iIs = idx(headers, "ishastart", "isha");
  const iIj = idx(headers, "ishajamaat");
  // Ramadan-only columns
  const iSehri = idx(headers, "sehriend", "sehri", "suhoor", "sehar", "sehriendtime");
  const iIftar = idx(headers, "iftari", "iftar", "iftaar", "iftaari");
  const isRamadan = iSehri !== -1 || iIftar !== -1;

  if (iDate === -1) throw new Error("CSV missing a Date column");

  const get = (cols: string[], i: number) => (i >= 0 && i < cols.length ? cols[i] : "");

  const rows: DayRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const c = splitLine(lines[r]);
    const dateVal = get(c, iDate);
    if (!dateVal || !/^\d+$/.test(dateVal.trim())) continue;

    const sehriEnd = iSehri >= 0 ? to24(get(c, iSehri), "AM") : "";
    const iftar = iIftar >= 0 ? to24(get(c, iIftar), "PM") : "";
    // In Ramadan tables Fajr has no explicit "start"; Sehri End is when Fajr begins.
    const fajrStart = iFs >= 0 ? to24(get(c, iFs), "AM") : sehriEnd;
    // Maghrib time comes from an explicit column, or from Iftari in Ramadan tables.
    const maghribTime = iMag >= 0 ? to24(get(c, iMag), "PM") : iftar;

    const row: DayRow = {
      day: get(c, iDay),
      date: dateVal.trim(),
      hijri: get(c, iHijri),
      fajr: { start: fajrStart, jamaat: to24(get(c, iFj), "AM") },
      sunrise: to24(get(c, iSun), "AM"),
      zuhr: { start: to24(get(c, iZs), "PM"), jamaat: to24(get(c, iZj), "PM") },
      asr: { start: to24(get(c, iAs), "PM"), jamaat: to24(get(c, iAj), "PM") },
      maghrib: { start: maghribTime, jamaat: maghribTime },
      isha: { start: to24(get(c, iIs), "PM"), jamaat: to24(get(c, iIj), "PM") },
      ...(isRamadan ? { sehriEnd, iftar } : {}),
    };

    // Skip padding rows that have a date number but no actual prayer times
    // (e.g. day 30/31 left blank in a 29/30-day month).
    const hasTimes =
      row.fajr.start ||
      row.fajr.jamaat ||
      row.sunrise ||
      row.zuhr.start ||
      row.zuhr.jamaat ||
      row.asr.start ||
      row.asr.jamaat ||
      row.maghrib.start ||
      row.isha.start ||
      row.isha.jamaat ||
      row.sehriEnd ||
      row.iftar;
    if (!hasTimes) continue;

    rows.push(row);
  }

  if (!rows.length) throw new Error("No valid rows found in CSV");
  return { rows, isRamadan };
}
