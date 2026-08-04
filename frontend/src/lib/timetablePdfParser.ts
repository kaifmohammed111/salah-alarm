export type PdfTimetableParseResult = {
  csv: string;
  rowCount: number;
  headers: string[];
};

const FULL_TIME_RE = /^\d{1,2}:\d{2}$/;
// OCR sometimes drops the leading hour digit entirely (e.g. ":27" instead
// of "5:27") — confirmed against a real sample. Rather than discard these,
// we reconstruct the hour from the previous row's value at that slot once
// we know one.
const PARTIAL_TIME_RE = /^:\d{2}$/;
// Day abbreviations aren't always 3+ letters — confirmed real OCR output
// includes "SA" and "FR" (a dropped final letter), alongside "Tues"/"Thurs"
// (longer forms) seen elsewhere.
const DAY_RE = /^[A-Za-z]{2,6}$/;

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

type Token = { raw: string; kind: "full" | "partial" };
type Candidate = { day: string; date: string; hijri: string; tokens: Token[] };

// Finds candidate data rows by shape, not position. Non-time words (OCR
// noise from decorative text bleeding into a row) are dropped; malformed
// but recoverable time fragments (missing hour digit) are kept as
// "partial" tokens for alignRow() to repair using row-to-row context.
function extractCandidates(rawText: string): Candidate[] {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Candidate[] = [];

  for (const line of lines) {
    const words = line.split(/\s+/);
    if (words.length < 3) continue;
    if (!DAY_RE.test(words[0])) continue;
    if (!/^\d{1,2}$/.test(words[1])) continue;

    const firstTimeIdx = words.findIndex((w) => FULL_TIME_RE.test(w) || PARTIAL_TIME_RE.test(w));
    if (firstTimeIdx === -1) continue;

    const tokens: Token[] = [];
    for (const w of words.slice(firstTimeIdx)) {
      if (FULL_TIME_RE.test(w)) tokens.push({ raw: w, kind: "full" });
      else if (PARTIAL_TIME_RE.test(w)) tokens.push({ raw: w, kind: "partial" });
    }
    if (tokens.length < 5) continue;

    const hijri = words.slice(2, firstTimeIdx).join(" ");
    out.push({ day: words[0].toUpperCase(), date: words[1], hijri, tokens });
  }
  return out;
}

// Most-common full-row token count, restricted to a plausible range —
// more robust than a raw max, since a single line with one stray
// OCR-matched extra number shouldn't be able to inflate the estimate.
function estimateSlotCount(candidates: Candidate[]): number {
  const counts = new Map<number, number>();
  for (const c of candidates) {
    const n = c.tokens.length;
    if (n < 9 || n > 12) continue;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  let best = 10;
  let bestFreq = -1;
  for (const [n, freq] of counts) {
    // On ties, prefer the higher count — an omitted repeated value only
    // ever REDUCES a row's token count below the true total, never
    // inflates it, so the true column count is never the smaller tie.
    if (freq > bestFreq || (freq === bestFreq && n > best)) {
      best = n;
      bestFreq = freq;
    }
  }
  return best;
}

// 10 slots = this app's standard schema. 11 slots = some mosques print a
// separate Zawal/solar-noon time before Zuhr Start (confirmed real
// sample) — dropped before emitting the final row since this app doesn't
// track it.
function buildSlotPeriods(n: number): ("AM" | "PM")[] {
  const template: ("AM" | "PM")[] = ["AM", "AM", "AM", "PM", "PM", "PM", "PM", "PM", "PM", "PM", "PM"];
  if (n === 10) return ["AM", "AM", "AM", "PM", "PM", "PM", "PM", "PM", "PM", "PM"];
  if (n === 11) return template;
  return Array.from({ length: n }, (_, i) => template[Math.min(i, template.length - 1)]);
}

const ALIGN_TOLERANCE_MIN = 25;

// Aligns a row's tokens against the fixed slot template using whatever's
// been learned so far (prevSlots — null entries mean "not yet seen").
// A slot with no reference yet accepts the next token unconditionally,
// which is what lets the very first row (even if imperfect) bootstrap the
// baseline instead of requiring it to be flawless. A slot WITH a
// reference only consumes a token if it's a plausible small drift from
// last time; otherwise it's assumed unchanged (carried forward) and the
// token is left for a later slot to try. Partial (hour-dropped) tokens
// are repaired using the reference's hour, or discarded if there's no
// reference yet to repair them with.
function alignRow(tokens: Token[], periods: ("AM" | "PM")[], prevSlots: (string | null)[]): (string | null)[] {
  const n = periods.length;
  const resolved: (string | null)[] = new Array(n).fill(null);
  let ti = 0;

  for (let j = 0; j < n; j++) {
    const prevKnown = prevSlots[j];
    let consumed = false;

    while (ti < tokens.length && !consumed) {
      const tok = tokens[ti];

      if (tok.kind === "partial") {
        if (prevKnown) {
          const prevHour = prevKnown.split(":")[0];
          resolved[j] = `${prevHour}:${tok.raw.slice(1)}`;
          ti++;
          consumed = true;
        } else {
          ti++; // can't repair without a reference hour — discard, keep looking
        }
        continue;
      }

      if (!prevKnown) {
        resolved[j] = tok.raw;
        ti++;
        consumed = true;
        continue;
      }

      const candMin = toMinutes(tok.raw, periods[j]);
      const prevMin = toMinutes(prevKnown, periods[j]);
      if (Math.abs(candMin - prevMin) <= ALIGN_TOLERANCE_MIN) {
        resolved[j] = tok.raw;
        ti++;
        consumed = true;
      } else {
        break; // doesn't belong here — leave for a later slot, this one carries forward
      }
    }

    if (!consumed) {
      resolved[j] = prevKnown; // may still be null if this slot has never been seen
    }
  }

  return resolved;
}

/**
 * Parses raw text (from either a real PDF text layer or on-device OCR)
 * into CSV rows. See extractCandidates() / alignRow() above for the
 * real-world complications this handles, all confirmed against actual
 * samples: OCR noise interspersed mid-row, repeated values printed as
 * blank cells rather than a visible ditto mark, dropped leading digits
 * within a time, and truncated/misread day abbreviations.
 */
export function parseTimetablePdfText(rawText: string): PdfTimetableParseResult {
  const candidates = extractCandidates(rawText);
  if (candidates.length === 0) {
    return { csv: [HEADERS.join(",")].join("\n"), rowCount: 0, headers: HEADERS };
  }

  const n = estimateSlotCount(candidates);
  const periods = buildSlotPeriods(n);
  const zawalIndex = n === 11 ? 3 : -1;

  const rows: string[][] = [];
  const prevSlots: (string | null)[] = new Array(n).fill(null);

  for (const c of candidates) {
    const resolved = alignRow(c.tokens, periods, prevSlots);
    for (let j = 0; j < n; j++) {
      if (resolved[j]) prevSlots[j] = resolved[j];
    }

    const finalSlots = zawalIndex >= 0 ? resolved.filter((_, i) => i !== zawalIndex) : resolved;
    if (finalSlots.length !== 10 || finalSlots.some((v) => !v)) continue;

    rows.push([c.day, c.date, c.hijri, ...(finalSlots as string[])]);
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
