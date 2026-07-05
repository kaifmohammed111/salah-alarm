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
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");

  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.split(",").some((c) => c.trim() !== "")); // drop fully-empty rows
  if (lines.length < 2) throw new Error("CSV has no data rows");

  // Find the header row (the one that has a "Date" column). Skips any title rows.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const toks = splitLine(lines[i]).map(norm);
    if (toks.includes("date")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("CSV missing a Date column");

  const headerRaw = splitLine(lines[headerIdx]);
  const headerNorm = headerRaw.map(norm);
  const inlineTiers = headerNorm.some(
    (t) => t.includes("start") || t.includes("jamat") || t.includes("jamaat") || t.includes("sehri") || t.includes("iftar"),
  );

  let headers: string[];
  let dataStart: number;

  if (inlineTiers) {
    headers = headerRaw;
    dataStart = headerIdx + 1;
  } else if (headerIdx + 1 < lines.length) {
    const subRaw = splitLine(lines[headerIdx + 1]);
    const subHasTiers = subRaw.map(norm).some((t) => t.includes("start") || t.includes("jamat") || t.includes("jamaat"));
    if (subHasTiers) {
      // Two-tier header: forward-fill merged prayer names, then append Start/Jamat.
      const filled = [...headerRaw];
      for (let k = 1; k < filled.length; k++) {
        if (!filled[k] || !filled[k].trim()) filled[k] = filled[k - 1];
      }
      headers = filled.map((h, k) => `${h || ""} ${subRaw[k] || ""}`.trim());
      dataStart = headerIdx + 2;
    } else {
      headers = headerRaw;
      dataStart = headerIdx + 1;
    }
  } else {
    headers = headerRaw;
    dataStart = headerIdx + 1;
  }

  const iDay = idx(headers, "day");
  const iDate = idx(headers, "date");
  const iHijri = idx(headers, "hijri");
  const iFs = idx(headers, "fajrstart", "fajr");
  const iFj = idx(headers, "fajrjamaat", "fajriqamah", "fajrjamat");
  const iSun = idx(headers, "sunrise");
  const iZs = idx(headers, "zuhrstart", "zuharstart", "dhuhrstart", "zuhr", "zuhar", "dhuhr");
  const iZj = idx(headers, "zuhrjamaat", "zuhrjamat", "zuharjamaat", "zuharjamat", "dhuhrjamaat");
  const iAs = idx(headers, "asrstart", "asr");
  const iAj = idx(headers, "asrjamaat", "asrjamat");
  const iMag = idx(headers, "maghrib", "maghribstart");
  const iIs = idx(headers, "ishastart", "isha");
  const iIj = idx(headers, "ishajamaat", "ishajamat");
  // Ramadan-only columns
  const iSehri = idx(headers, "sehriend", "sehri", "suhoor", "sehar", "sehriendtime");
  const iIftar = idx(headers, "iftari", "iftar", "iftaar", "iftaari");
  const isRamadan = iSehri !== -1 || iIftar !== -1;

  if (iDate === -1) throw new Error("CSV missing a Date column");

  const get = (cols: string[], i: number) => (i >= 0 && i < cols.length ? cols[i] : "");

  const rows: DayRow[] = [];
  for (let r = dataStart; r < lines.length; r++) {
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
