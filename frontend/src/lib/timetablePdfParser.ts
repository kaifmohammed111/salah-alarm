export type PdfTimetableParseResult = {
  csv: string;
  rowCount: number;
  headers: string[];
};

const TIME_RE = /^\d{1,2}:\d{2}$/;
const DAY_RE = /^[A-Za-z]{3}$/;

// Header row this app's existing CSV parser (src/lib/csv.ts) already
// auto-detects with zero manual column reassignment needed — see
// csvTemplate.ts for the documented canonical format. Maghrib is
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

/**
 * Parses raw text extracted from a prayer timetable PDF into CSV rows.
 * Detects data rows by shape, not position — a line qualifies if it starts
 * with a 3-letter day abbreviation, a numeric date, and ends with exactly
 * 10 HH:MM tokens (Fajr Start/Jamaat, Sunrise, Zuhr Start/Jamaat, Asr
 * Start/Jamaat, Maghrib, Isha Start/Jamaat) — confirmed against a real
 * sample timetable's extracted text. The Hijri field is whatever text sits
 * between the date and the first time token, since it's sometimes a plain
 * number and sometimes a month name (e.g. "Rabi Ul Awwal") when the Hijri
 * month changes partway through the PDF.
 *
 * This pattern-based detection (not line position) is what lets it ignore
 * surrounding page noise — titles, download links, footer paragraphs —
 * without needing to know where the table starts or ends.
 */
export function parseTimetablePdfText(rawText: string): PdfTimetableParseResult {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const rows: string[][] = [];

  for (const line of lines) {
    const tokens = line.split(/\s+/);
    if (tokens.length < 12) continue;
    if (!DAY_RE.test(tokens[0])) continue;
    if (!/^\d{1,2}$/.test(tokens[1])) continue;

    const firstTimeIdx = tokens.findIndex((t) => TIME_RE.test(t));
    if (firstTimeIdx === -1) continue;

    const times = tokens.slice(firstTimeIdx);
    if (times.length !== 10 || !times.every((t) => TIME_RE.test(t))) continue;

    const day = tokens[0].toUpperCase();
    const date = tokens[1];
    const hijri = tokens.slice(2, firstTimeIdx).join(" ");
    rows.push([day, date, hijri, ...times]);
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
