import { ColumnMap, CsvFieldKey, DayRow, Timetable } from "./prayer";

// Convert a time string to 24-hour "HH:MM". Handles three cases:
// 1. Explicit AM/PM marker in the cell itself (e.g. "2:30 PM", "2:30pm", "2:30 p.m.") — always wins.
// 2. Already 24-hour format with no marker (e.g. "14:30", "00:15") — passed through as-is.
// 3. Bare 12-hour with no marker (e.g. "2:30") — falls back to the assumed period based on
//    which prayer column it came from (Fajr/Sunrise = AM, others = PM), same as before.
function to24(t: string, assumedPeriod: "AM" | "PM"): string {
  if (!t) return "";
  const cleaned = t.trim();
  const timeMatch = cleaned.match(/(\d{1,2})[:.](\d{2})/);
  if (!timeMatch) return "";
  let h = parseInt(timeMatch[1], 10);
  const min = timeMatch[2];
  if (h > 23 || parseInt(min, 10) > 59) return "";

  const explicitMatch = cleaned.match(/\b([ap])\.?\s?m\.?\b/i);
  if (explicitMatch) {
    const period = explicitMatch[1].toLowerCase() === "a" ? "AM" : "PM";
    if (period === "AM") {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
    return `${String(h).padStart(2, "0")}:${min}`;
  }

  // No explicit marker. If the hour is already outside the 1-12 range, it's
  // already in 24-hour form (e.g. "14:30" or "00:15") — leave it untouched.
  if (h === 0 || h > 12) {
    return `${String(h).padStart(2, "0")}:${min}`;
  }

  // Bare 12-hour value with no marker — use the assumed period for this column.
  if (assumedPeriod === "AM") {
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

/**
 * Parse a monthly prayer timetable CSV.
 * Expected headers (case/spacing tolerant):
 * Day,Date,Hijri,Fajr Start,Fajr Jamaat,Sunrise,Zuhr Start,Zuhr Jamaat,
 * Asr Start,Asr Jamaat,Maghrib,Isha Start,Isha Jamaat
 * Times may be 12-hour with or without AM/PM, or already 24-hour — auto-detected per cell.
 */
export function parseTimetableCsv(
  text: string,
  overrides?: Partial<Record<CsvFieldKey, number>>,
): Timetable {
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");

  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.split(",").some((c) => c.trim() !== ""));
  if (lines.length < 2) throw new Error("CSV has no data rows");

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

  const hNorm = headers.map(norm);

  const findCol = (variants: string[], exclude: string[] = []) =>
    hNorm.findIndex(
      (h) => variants.some((v) => h.includes(v)) && !exclude.some((e) => h.includes(e)),
    );

  const prayerCols = (variants: string[], exclude: string[] = []) => {
    let start = -1;
    let jamaat = -1;
    let plain = -1;
    hNorm.forEach((h, i) => {
      if (!variants.some((v) => h.includes(v))) return;
      if (exclude.some((e) => h.includes(e))) return;
      if (h.includes("start")) {
        if (start === -1) start = i;
      } else if (h.includes("jama") || h.includes("iqam")) {
        if (jamaat === -1) jamaat = i;
      } else if (plain === -1) {
        plain = i;
      }
    });
    return { start, jamaat, plain };
  };

  const iDay = findCol(["day"], ["date"]);
  const iHijri = findCol(["hijri"]);

  const fajr = prayerCols(["fajr", "sehri", "suhoor", "sehar"]);
  const zuhr = prayerCols(["zuhur", "zuhr", "zuhar", "dhuhr"], ["kubra"]);
  const asr = prayerCols(["asr"]);
  const maghrib = prayerCols(["maghrib"]);
  const isha = prayerCols(["isha"]);

  const ov = overrides ?? {};
  const use = (k: CsvFieldKey, base: number) => (typeof ov[k] === "number" ? (ov[k] as number) : base);

  const iDate = use("date", findCol(["date"]));
  const iSun = use("sunrise", findCol(["sunrise", "sunris"]));
  const iFs = use("fajrStart", fajr.start !== -1 ? fajr.start : fajr.plain);
  const iFj = use("fajrJamaat", fajr.jamaat);
  const iZs = use("zuhrStart", zuhr.start !== -1 ? zuhr.start : zuhr.plain);
  const iZj = use("zuhrJamaat", zuhr.jamaat);
  const iAs = use("asrStart", asr.start !== -1 ? asr.start : asr.plain);
  const iAj = use("asrJamaat", asr.jamaat);
  const iMs = use("maghribStart", maghrib.start !== -1 ? maghrib.start : maghrib.plain);
  const iMj = use("maghribJamaat", maghrib.jamaat);
  const iIs = use("ishaStart", isha.start !== -1 ? isha.start : isha.plain);
  const iIj = use("ishaJamaat", isha.jamaat);

  const iSehri = use("sehri", findCol(["sehriend", "sehri", "suhoor", "sehar"]));
  const iIftar = use("iftar", findCol(["iftari", "iftar", "iftaar", "iftaari"]));
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
    const fajrStart = iFs >= 0 ? to24(get(c, iFs), "AM") : sehriEnd;
    const maghribStart = iMs >= 0 ? to24(get(c, iMs), "PM") : "";
    const maghribJamaat = iMj >= 0 ? to24(get(c, iMj), "PM") : "";
    const maghribBase = maghribStart || maghribJamaat || iftar;

    const row: DayRow = {
      day: get(c, iDay),
      date: dateVal.trim(),
      hijri: get(c, iHijri),
      fajr: { start: fajrStart, jamaat: to24(get(c, iFj), "AM") },
      sunrise: to24(get(c, iSun), "AM"),
      zuhr: { start: to24(get(c, iZs), "PM"), jamaat: to24(get(c, iZj), "PM") },
      asr: { start: to24(get(c, iAs), "PM"), jamaat: to24(get(c, iAj), "PM") },
      maghrib: { start: maghribBase, jamaat: maghribJamaat || maghribBase },
      isha: { start: to24(get(c, iIs), "PM"), jamaat: to24(get(c, iIj), "PM") },
      ...(isRamadan ? { sehriEnd, iftar } : {}),
    };

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

  const col = (i: number) => (i >= 0 && i < headers.length ? headers[i].trim() || null : null);
  const m = (key: CsvFieldKey, label: string, index: number): ColumnMap => ({
    key,
    label,
    index,
    column: col(index),
  });
  const mapping: ColumnMap[] = [
    m("date", "Date", iDate),
    m("fajrStart", "Fajr Start", iFs),
    m("fajrJamaat", "Fajr Jamaat", iFj),
    m("sunrise", "Sunrise", iSun),
    m("zuhrStart", "Zuhr Start", iZs),
    m("zuhrJamaat", "Zuhr Jamaat", iZj),
    m("asrStart", "Asr Start", iAs),
    m("asrJamaat", "Asr Jamaat", iAj),
    m("maghribStart", "Maghrib Start", iMs),
    m("maghribJamaat", "Maghrib Jamaat", iMj),
    m("ishaStart", "Isha Start", iIs),
    m("ishaJamaat", "Isha Jamaat", iIj),
    ...(isRamadan ? [m("sehri", "Sehri End", iSehri), m("iftar", "Iftari", iIftar)] : []),
  ];

  return { rows, isRamadan, mapping, headers: headers.map((h) => h.trim()) };
}
