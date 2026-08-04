import TextRecognition from "@react-native-ml-kit/text-recognition";
import * as FileSystem from "expo-file-system/legacy";

type Frame = { left: number; top: number; width: number; height: number };
type MlKitElement = { text: string; frame: Frame };
type MlKitLine = { text: string; frame: Frame; elements: MlKitElement[] };
type MlKitBlock = { text: string; frame: Frame; lines: MlKitLine[] };
type MlKitResult = { text: string; blocks: MlKitBlock[] };

type PositionedWord = { text: string; x: number; y: number; width: number };

// Reconstructs left-to-right, top-to-bottom row text from ML Kit's
// positioned word-level results. EXPERIMENTAL column-awareness: a
// multi-column poster (e.g. a timetable next to an unrelated donation/dua
// side-panel) confirmed real case where naive Y-position-only clustering
// glues unrelated side-panel text onto timetable rows that happen to sit
// at the same page height. This looks for a genuinely large horizontal
// gap in word positions — much bigger than normal word-spacing, and not
// right at the page edge (which would just be margin) — and if found,
// treats it as a column boundary, reconstructing each column's lines
// independently before combining. If no such gap is found, this behaves
// identically to the previous single-pass version.
function reconstructLinesFromElements(elements: PositionedWord[]): string {
  if (elements.length === 0) return "";

  const centers = elements.map((e) => e.x + e.width / 2).sort((a, b) => a - b);
  const minX = centers[0];
  const maxX = centers[centers.length - 1];
  const span = maxX - minX;

  let splitX: number | null = null;
  if (span > 0 && centers.length > 4) {
    const gaps: { gap: number; at: number }[] = [];
    for (let i = 1; i < centers.length; i++) {
      gaps.push({ gap: centers[i] - centers[i - 1], at: (centers[i] + centers[i - 1]) / 2 });
    }
    const sortedGaps = [...gaps].map((g) => g.gap).sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] || 1;
    const biggest = gaps.reduce((a, b) => (b.gap > a.gap ? b : a));
    const relativePos = (biggest.at - minX) / span;
    // Require the gap to be dramatically bigger than typical word-spacing
    // AND to sit well away from either edge, so this only fires for a
    // real column gutter, not ordinary spacing or page margin.
    if (biggest.gap > medianGap * 6 && relativePos > 0.2 && relativePos < 0.8) {
      splitX = biggest.at;
    }
  }

  const columns: PositionedWord[][] =
    splitX === null
      ? [elements]
      : [
          elements.filter((e) => e.x + e.width / 2 < (splitX as number)),
          elements.filter((e) => e.x + e.width / 2 >= (splitX as number)),
        ];

  return columns
    .map((colElements) => linesFromColumn(colElements))
    .filter((text) => text.length > 0)
    .join("\n");
}

function linesFromColumn(elements: PositionedWord[]): string {
  const sorted = [...elements].sort((a, b) => a.y - b.y);
  const TOLERANCE = 12; // OCR bounding boxes are noisier than PDF text coords
  const lines: (typeof sorted)[] = [];
  let current: typeof sorted = [];
  let currentY: number | null = null;
  for (const el of sorted) {
    if (current.length === 0 || currentY === null || Math.abs(el.y - currentY) > TOLERANCE) {
      current = [];
      currentY = el.y;
      lines.push(current);
    }
    current.push(el);
  }
  return lines
    .map((line) =>
      line
        .sort((a, b) => a.x - b.x)
        .map((e) => e.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((l) => l.length > 0)
    .join("\n");
}

// Writes a base64 PNG to a temp file (ML Kit's API needs a real file URI,
// not a raw base64 string) and runs on-device OCR — genuinely offline, no
// network call, no server.
export async function recognizePageImage(base64Png: string): Promise<string> {
  const tmpPath = `${FileSystem.cacheDirectory}pdf-ocr-page-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  await FileSystem.writeAsStringAsync(tmpPath, base64Png, { encoding: FileSystem.EncodingType.Base64 });
  try {
    const result = (await TextRecognition.recognize(tmpPath)) as MlKitResult;
    const elements: PositionedWord[] = [];
    for (const block of result.blocks || []) {
      for (const line of block.lines || []) {
        for (const el of line.elements || []) {
          elements.push({ text: el.text, x: el.frame.left, y: el.frame.top, width: el.frame.width });
        }
      }
    }
    return reconstructLinesFromElements(elements);
  } finally {
    FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
  }
}
