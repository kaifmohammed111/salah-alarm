export type PdfTimetableParseResult = {
  csv: string;
  rowCount: number;
  headers: string[];
};

const TIME_RE = /^\d{1,2}:\d{2}$/;
// Printed timetables sometimes use a ditto mark instead of repeating a
// Jamaat time that's unchanged from the row above (seen in a real sample:
// Central Jamia Mosque Zia-ul-Quran's Aug 2026 table uses `"` this way).
const DITTO_RE = /^["'\u2033\u201d\u201c]+$/;
const DAY_RE = /^[A-Za-z]{3}$/;
const TARGET_COUNT = 10; // Fajr Start/Jamaat, Sunrise, Zuhr Start/Jamaat, Asr Start/Jamaat, Maghrib, Isha Start/Jamaat

// Header row this app's existing CSV parser (src/lib/csv.ts) already
// auto-detects with zero manual column reassignment needed. Maghrib is
// intentionally a single column (not Start/Jamaat) to match how these
// timetables are actually published.
const HEADERS = [
  "Day",
  "Date",
  "Hijri",
  "Fajr Start",
  "Fajr Jamaat",
  "Sunrise",
  "Zuhr Start",
  "Zuhr Jamaat",
  "Asr Start",
  "Asr Jamaat",
  "Maghrib",
  "Isha Start",
  "Isha Jamaat",
];

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function isTimeOrDitto(tok: string): boolean {
  return TIME_RE.test(tok) || DITTO_RE.test(tok);
}

// Some mosques print an extra time column this app doesn't track (e.g. a
// separate "Zawal"/solar-noon time before Zuhr Start). Trims down to the
// 10 slots this app understands, preferring to trim right after Sunrise —
// Fajr Start/Jamaat at the front and the Asr/Maghrib/Isha tail have been
// the most consistently-positioned columns across the timetables checked
// so far, so an unknown extra column is more likely to sit in the middle.
function normalizeSlotCount(tokens: string[]): string[] | null {
  if (tokens.length === TARGET_COUNT) return tokens;
  if (tokens.length > TARGET_COUNT) {
    const extra = tokens.length - TARGET_COUNT;
    return [...tokens.slice(0, 3), ...tokens.slice(3 + extra)];
  }
  return null; // fewer than expected — can't confidently map, skip the row
}

/**
 * Parses raw text (from either a real PDF text layer or on-device OCR)
 * into CSV rows. Detects data rows by shape, not position — a line
 * qualifies if it starts with a 3-letter day abbreviation, a numeric date,
 * and ends with a run of HH:MM/ditto tokens that normalizes to exactly 10
 * slots — matching the column order confirmed against real sample
 * timetables. The Hijri field is whatever text sits between the date and
 * the first time token, since it's sometimes a plain number and sometimes
 * a month name (e.g. "Rabi Ul Awwal") when the Hijri month changes
 * partway through the PDF.
 */
export function parseTimetablePdfText(rawText: string): PdfTimetableParseResult {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const rows: string[][] = [];
  let prevSlots: string[] | null = null;

  for (const line of lines) {
    const tokens = line.split(/\s+/);
    if (tokens.length < 12) continue;
    if (!DAY_RE.test(tokens[0])) continue;
    if (!/^\d{1,2}$/.test(tokens[1])) continue;

    const firstTimeIdx = tokens.findIndex((t) => isTimeOrDitto(t));
    if (firstTimeIdx === -1) continue;

    const trailing = tokens.slice(firstTimeIdx);
    if (!trailing.every(isTimeOrDitto)) continue;

    const slots = normalizeSlotCount(trailing);
    if (!slots) continue;

    const resolved = slots.map((tok, i) => {
      if (TIME_RE.test(tok)) return tok;
      return prevSlots ? prevSlots[i] : ""; // ditto with no prior row to copy from
    });
    if (resolved.some((v) => !v)) continue; // couldn't resolve a ditto — skip rather than emit a blank time

    prevSlots = resolved;

    const day = tokens[0].toUpperCase();
    const date = tokens[1];
    const hijri = tokens.slice(2, firstTimeIdx).join(" ");
    rows.push([day, date, hijri, ...resolved]);
  }

  const csvLines = [HEADERS.join(",")];
  for (const r of rows) {
    csvLines.push(r.map(csvEscape).join(","));
  }

  return {
    csv: csvLines.join("\n"),
    rowCount: rows.length,
    headers: HEADERS,
  };
}
