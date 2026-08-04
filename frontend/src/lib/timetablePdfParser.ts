export type PdfTimetableParseResult = {
  csv: string;
  rowCount: number;
  headers: string[];
};

const TIME_RE = /^\d{1,2}:\d{2}$/;
// "Sat".."Thurs" — day abbreviations aren't always exactly 3 letters (one
// real sample uses "Tues"/"Thurs"), so this is intentionally a range.
const DAY_RE = /^[A-Za-z]{3,6}$/;

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

function toMinutes(raw: string, period: "AM" | "PM"): number {
  const [hStr, mStr] = raw.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (period === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return h * 60 + m;
}

type Candidate = { day: string; date: string; hijri: string; timeTokens: string[] };

// Finds candidate data rows by shape, not position. Only well-formed HH:MM
// tokens are kept from the point the first one appears — OCR noise (stray
// words from decorative rotated side-text, page furniture bleeding into a
// row, etc., confirmed against a real sample) is simply dropped rather
// than rejecting the whole row over one misread word.
function extractCandidates(rawText: string): Candidate[] {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Candidate[] = [];

  for (const line of lines) {
    const tokens = line.split(/\s+/);
    if (tokens.length < 3) continue;
    if (!DAY_RE.test(tokens[0])) continue;
    if (!/^\d{1,2}$/.test(tokens[1])) continue;

    const firstTimeIdx = tokens.findIndex((t) => TIME_RE.test(t));
    if (firstTimeIdx === -1) continue;

    const timeTokens = tokens.slice(firstTimeIdx).filter((t) => TIME_RE.test(t));
    if (timeTokens.length < 5) continue; // too little survives to plausibly be a real data row

    const hijri = tokens.slice(2, firstTimeIdx).join(" ");
    out.push({ day: tokens[0].toUpperCase(), date: tokens[1], hijri, timeTokens });
  }
  return out;
}

// Per-slot AM/PM assumption. 10 slots = this app's standard schema (no
// separate Zawal column). 11 slots = some mosques print a separate
// Zawal/solar-noon time before Zuhr Start (confirmed against a real
// sample) — that extra slot sits at index 3 and is dropped before
// emitting the final row, since this app doesn't track it.
function buildSlotPeriods(n: number): ("AM" | "PM")[] {
  const template: ("AM" | "PM")[] = ["AM", "AM", "AM", "PM", "PM", "PM", "PM", "PM", "PM", "PM", "PM"];
  if (n === 10) return ["AM", "AM", "AM", "PM", "PM", "PM", "PM", "PM", "PM", "PM"];
  if (n === 11) return template;
  return Array.from({ length: n }, (_, i) => template[Math.min(i, template.length - 1)]);
}

const ALIGN_TOLERANCE_MIN = 25;

// Aligns a row's (possibly incomplete) time tokens against the fixed slot
// template, using the previous fully-resolved row as a reference. Handles
// timetables where a repeated value (unchanged from the row above) is
// printed as a blank cell rather than a visible ditto mark — confirmed
// against real OCR output, where the value is simply missing rather than
// replaced by any symbol we could pattern-match on. At each slot, if the
// next available token's implied time is close to what that slot held on
// the previous row, it's consumed as this row's value; otherwise the slot
// is assumed unchanged and carried forward, leaving the token to be tried
// against the next slot instead.
function alignRow(tokens: string[], periods: ("AM" | "PM")[], prevSlots: string[] | null): string[] | null {
  const n = periods.length;
  if (tokens.length === n) return tokens; // nothing missing — use as-is
  if (!prevSlots) return null; // can't carry forward without a baseline row yet

  const resolved: string[] = new Array(n).fill("");
  let ti = 0;
  for (let j = 0; j < n; j++) {
    const tok = tokens[ti];
    if (tok) {
      const candMin = toMinutes(tok, periods[j]);
      const prevMin = toMinutes(prevSlots[j], periods[j]);
      if (Math.abs(candMin - prevMin) <= ALIGN_TOLERANCE_MIN) {
        resolved[j] = tok;
        ti++;
        continue;
      }
    }
    resolved[j] = prevSlots[j];
  }
  return resolved;
}

/**
 * Parses raw text (from either a real PDF text layer or on-device OCR)
 * into CSV rows. See extractCandidates() / alignRow() above for the two
 * real-world complications this handles, both confirmed against actual
 * samples: OCR noise interspersed mid-row, and repeated values printed as
 * blank cells rather than a visible ditto mark.
 */
export function parseTimetablePdfText(rawText: string): PdfTimetableParseResult {
  const candidates = extractCandidates(rawText);
  if (candidates.length === 0) {
    return { csv: [HEADERS.join(",")].join("\n"), rowCount: 0, headers: HEADERS };
  }

  // The most common full-row length is our reference slot count — a row
  // with an omitted repeated value is always shorter than the true column
  // count, never longer, so the max (clamped to a sane range) is a safe
  // estimate of how many columns this particular timetable actually has.
  const n = Math.min(12, Math.max(10, Math.max(...candidates.map((c) => c.timeTokens.length))));
  const periods = buildSlotPeriods(n);
  const zawalIndex = n === 11 ? 3 : -1;

  const rows: string[][] = [];
  let prevSlots: string[] | null = null;

  for (const c of candidates) {
    const resolved = alignRow(c.timeTokens, periods, prevSlots);
    if (!resolved) continue; // no baseline yet to carry forward from — skip until a full row establishes one
    prevSlots = resolved;

    const finalSlots = zawalIndex >= 0 ? resolved.filter((_, i) => i !== zawalIndex) : resolved;
    if (finalSlots.length !== 10) continue;

    rows.push([c.day, c.date, c.hijri, ...finalSlots]);
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
