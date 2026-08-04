export type PdfTimetableParseResult = {
  csv: string;
  rowCount: number;
  headers: string[];
};

// Accepts ":", ".", or "-" as the hour/minute separator — confirmed real
// OCR output misreads the colon as either (e.g. "10.00", "5-00").
const FULL_TIME_RE = /^\d{1,2}[:.\-]\d{2}$/;
const PARTIAL_TIME_RE = /^:\d{2}$/;
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

function normalizeTime(raw: string): string {
  return raw.replace(/[.\-]/, ":");
}

function toMinutes(raw: string, period: "AM" | "PM"): number {
  const [hStr, mStr] = normalizeTime(raw).split(":");
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
type Candidate = { day: string; hijri: string; tokens: Token[] };

// Finds candidate data rows by shape, not position. The date digit itself
// is deliberately NOT required or trusted here — confirmed real OCR
// output sometimes merges or drops it entirely. Final dates are assigned
// positionally instead (see parseTimetablePdfText) — every real sample
// checked so far starts at day 1 and lists every day with no gaps, so row
// position is actually more reliable than the OCR'd digit.
function extractCandidates(rawText: string): Candidate[] {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Candidate[] = [];

  for (const line of lines) {
    const words = line.split(/\s+/);
    if (words.length < 2) continue;
    if (!DAY_RE.test(words[0])) continue;

    const firstTimeIdx = words.findIndex((w, i) => i > 0 && (FULL_TIME_RE.test(w) || PARTIAL_TIME_RE.test(w)));
    if (firstTimeIdx === -1) continue;

    const tokens: Token[] = [];
    for (const w of words.slice(firstTimeIdx)) {
      if (FULL_TIME_RE.test(w)) tokens.push({ raw: normalizeTime(w), kind: "full" });
      else if (PARTIAL_TIME_RE.test(w)) tokens.push({ raw: w, kind: "partial" });
    }
    if (tokens.length < 5) continue;

    const hijri = words.slice(1, firstTimeIdx).join(" ");
    out.push({ day: words[0].toUpperCase(), hijri, tokens });
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
    if (freq > bestFreq || (freq === bestFreq && n > best)) {
      best = n;
      bestFreq = freq;
    }
  }
  return best;
}

// 10 slots = this app's standard schema. 11 slots = some mosques print a
// separate Zawal/solar-noon time before Zuhr Start — dropped before
// emitting the final row since this app doesn't track it.
function buildSlotPeriods(n: number): ("AM" | "PM")[] {
  const template: ("AM" | "PM")[] = ["AM", "AM", "AM", "PM", "PM", "PM", "PM", "PM", "PM", "PM", "PM"];
  if (n === 10) return ["AM", "AM", "AM", "PM", "PM", "PM", "PM", "PM", "PM", "PM"];
  if (n === 11) return template;
  return Array.from({ length: n }, (_, i) => template[Math.min(i, template.length - 1)]);
}

const ALIGN_TOLERANCE_MIN = 25;

// Aligns a row's tokens against the fixed slot template using a reference
// row (prevSlots — null entries mean "not yet known"). A slot with no
// reference accepts the next token unconditionally; a slot WITH a
// reference only consumes a token if it's a plausible small drift from
// the reference, otherwise the slot is assumed unchanged (carried
// forward) and the token is left for a later slot to try. Partial
// (hour-dropped) tokens are repaired using the reference's hour, or
// discarded if there's no reference yet to repair them with. Direction
// doesn't matter here — this is called for both later rows (reference =
// previous row) and earlier rows (reference = a later row), see
// parseTimetablePdfText.
function alignRow(tokens: Token[], periods: ("AM" | "PM")[], ref: (string | null)[]): (string | null)[] {
  const n = periods.length;
  const resolved: (string | null)[] = new Array(n).fill(null);
  let ti = 0;

  for (let j = 0; j < n; j++) {
    const known = ref[j];
    let consumed = false;

    while (ti < tokens.length && !consumed) {
      const tok = tokens[ti];

      if (tok.kind === "partial") {
        if (known) {
          const hour = known.split(":")[0];
          resolved[j] = `${hour}:${tok.raw.slice(1)}`;
          ti++;
          consumed = true;
        } else {
          ti++;
        }
        continue;
      }

      if (!known) {
        resolved[j] = tok.raw;
        ti++;
        consumed = true;
        continue;
      }

      const candMin = toMinutes(tok.raw, periods[j]);
      const knownMin = toMinutes(known, periods[j]);
      if (Math.abs(candMin - knownMin) <= ALIGN_TOLERANCE_MIN) {
        resolved[j] = tok.raw;
        ti++;
        consumed = true;
      } else {
        break;
      }
    }

    if (!consumed) {
      resolved[j] = known;
    }
  }

  return resolved;
}

/**
 * Parses raw text (from either a real PDF text layer or on-device OCR)
 * into CSV rows.
 *
 * Two things this handles that plain left-to-right parsing can't: rows
 * with repeated values printed as blank cells rather than a visible ditto
 * mark (handled by alignRow's carry-forward), and a corrupted FIRST row —
 * confirmed in a real noisy sample, where the very first row lost a token
 * to misread OCR. Rather than trust row 1 unconditionally as the anchor
 * for every row after it, this finds the first row whose full token count
 * matches the estimated column count (the most trustworthy candidate —
 * rows can lose tokens to OCR noise or omitted repeats, but can't gain
 * extra real ones) and resolves outward from there in both directions.
 *
 * Dates are assigned positionally (row 1 = day 1, row 2 = day 2, ...)
 * rather than trusting OCR'd date digits, which are prone to being
 * merged, dropped, or misread — every real sample checked so far starts
 * at day 1 with no gaps, making row position more reliable than the
 * printed digit.
 */
export function parseTimetablePdfText(rawText: string): PdfTimetableParseResult {
  const candidates = extractCandidates(rawText);
  if (candidates.length === 0) {
    return { csv: [HEADERS.join(",")].join("\n"), rowCount: 0, headers: HEADERS };
  }

  const n = estimateSlotCount(candidates);
  const periods = buildSlotPeriods(n);
  const zawalIndex = n === 11 ? 3 : -1;

  let anchorIdx = candidates.findIndex((c) => c.tokens.length === n);
  if (anchorIdx === -1) {
    let maxLen = -1;
    candidates.forEach((c, i) => {
      if (c.tokens.length > maxLen) {
        maxLen = c.tokens.length;
        anchorIdx = i;
      }
    });
  }

  const resolvedByIdx: ((string | null)[] | null)[] = new Array(candidates.length).fill(null);

  const anchorTokens = candidates[anchorIdx].tokens;
  const anchorResolved: (string | null)[] = new Array(n).fill(null);
  for (let j = 0; j < Math.min(n, anchorTokens.length); j++) {
    anchorResolved[j] = anchorTokens[j].kind === "full" ? anchorTokens[j].raw : null;
  }
  resolvedByIdx[anchorIdx] = anchorResolved;

  // Forward from the anchor.
  {
    const ref = [...anchorResolved];
    for (let i = anchorIdx + 1; i < candidates.length; i++) {
      const resolved = alignRow(candidates[i].tokens, periods, ref);
      for (let j = 0; j < n; j++) if (resolved[j]) ref[j] = resolved[j];
      resolvedByIdx[i] = resolved;
    }
  }

  // Backward from the anchor.
  {
    const ref = [...anchorResolved];
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const resolved = alignRow(candidates[i].tokens, periods, ref);
      for (let j = 0; j < n; j++) if (resolved[j]) ref[j] = resolved[j];
      resolvedByIdx[i] = resolved;
    }
  }

  const rows: string[][] = [];
  candidates.forEach((c, idx) => {
    const resolved = resolvedByIdx[idx];
    if (!resolved) return;
    const finalSlots = zawalIndex >= 0 ? resolved.filter((_, i) => i !== zawalIndex) : resolved;
    if (finalSlots.length !== 10 || finalSlots.some((v) => !v)) return;
    rows.push([c.day, String(idx + 1), c.hijri, ...(finalSlots as string[])]);
  });

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
