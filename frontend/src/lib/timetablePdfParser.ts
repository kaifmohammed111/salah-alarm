export type PdfTimetableParseResult = {
  csv: string;
  rowCount: number;
  headers: string[];
};

const FULL_TIME_RE = /^\d{1,2}[:.\-]\d{2}$/;
const PARTIAL_TIME_RE = /^:\d{2}$/;
const DAY_RE = /^[A-Za-z]{2,6}$/;
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

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

// Scores a raw (possibly OCR-garbled) day abbreviation against each
// canonical weekday by counting matching characters at the same
// position — good enough for the kind of single-letter substitutions or
// truncations confirmed in real OCR output ("SA" for "SAT", "TUF" for
// "TUE"), without needing a full edit-distance implementation.
function matchWeekday(raw: string): number {
  const upper = raw.toUpperCase();
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const canon = WEEKDAYS[i];
    let score = 0;
    for (let k = 0; k < Math.min(upper.length, canon.length); k++) {
      if (upper[k] === canon[k]) score++;
    }
    if (upper.length === canon.length) score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

type Token = { raw: string; kind: "full" | "partial" };
type Candidate = { day: string; hijri: string; tokens: Token[] };

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

function buildSlotPeriods(n: number): ("AM" | "PM")[] {
  const template: ("AM" | "PM")[] = ["AM", "AM", "AM", "PM", "PM", "PM", "PM", "PM", "PM", "PM", "PM"];
  if (n === 10) return ["AM", "AM", "AM", "PM", "PM", "PM", "PM", "PM", "PM", "PM"];
  if (n === 11) return template;
  return Array.from({ length: n }, (_, i) => template[Math.min(i, template.length - 1)]);
}

const ALIGN_TOLERANCE_MIN = 25;

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

function pickAnchorIndex(candidates: Candidate[], n: number): number {
  let idx = candidates.findIndex((c) => c.tokens.length === n && c.tokens.every((t) => t.kind === "full"));
  if (idx !== -1) return idx;

  idx = candidates.findIndex((c) => c.tokens.length === n);
  if (idx !== -1) return idx;

  let maxLen = -1;
  let best = 0;
  candidates.forEach((c, i) => {
    if (c.tokens.length > maxLen) {
      maxLen = c.tokens.length;
      best = i;
    }
  });
  return best;
}

/**
 * Parses raw text (from either a real PDF text layer or on-device OCR)
 * into CSV rows. Both the date AND the day-of-week are derived
 * positionally rather than trusted from OCR text: dates from row index
 * (row 1 = day 1, ...), and weekday from a fixed 7-day cycle anchored to
 * whichever row's day text best matches a canonical weekday — confirmed
 * real OCR output includes truncated/misread day abbreviations ("SA" for
 * "SAT", "TUF" for "TUE") that would otherwise pass straight through
 * uncorrected. Time-of-day values are resolved outward (both forward and
 * backward) from the most trustworthy row — see pickAnchorIndex().
 */
export function parseTimetablePdfText(rawText: string): PdfTimetableParseResult {
  const candidates = extractCandidates(rawText);
  if (candidates.length === 0) {
    return { csv: [HEADERS.join(",")].join("\n"), rowCount: 0, headers: HEADERS };
  }

  const n = estimateSlotCount(candidates);
  const periods = buildSlotPeriods(n);
  const zawalIndex = n === 11 ? 3 : -1;

  const anchorIdx = pickAnchorIndex(candidates, n);

  const weekdayMatchIdx = matchWeekday(candidates[anchorIdx].day);
  const weekdayStart = ((weekdayMatchIdx - anchorIdx) % 7 + 7) % 7;
  const weekdayForRow = (idx: number) => WEEKDAYS[((weekdayStart + idx) % 7 + 7) % 7];

  const resolvedByIdx: ((string | null)[] | null)[] = new Array(candidates.length).fill(null);

  const anchorTokens = candidates[anchorIdx].tokens;
  const anchorResolved: (string | null)[] = new Array(n).fill(null);
  for (let j = 0; j < Math.min(n, anchorTokens.length); j++) {
    anchorResolved[j] = anchorTokens[j].kind === "full" ? anchorTokens[j].raw : null;
  }
  resolvedByIdx[anchorIdx] = anchorResolved;

  {
    const ref = [...anchorResolved];
    for (let i = anchorIdx + 1; i < candidates.length; i++) {
      const resolved = alignRow(candidates[i].tokens, periods, ref);
      for (let j = 0; j < n; j++) if (resolved[j]) ref[j] = resolved[j];
      resolvedByIdx[i] = resolved;
    }
  }

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
    rows.push([weekdayForRow(idx), String(idx + 1), c.hijri, ...(finalSlots as string[])]);
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
