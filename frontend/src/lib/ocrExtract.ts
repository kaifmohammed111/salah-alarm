import TextRecognition from "@react-native-ml-kit/text-recognition";
import * as FileSystem from "expo-file-system/legacy";

type Frame = { left: number; top: number; width: number; height: number };
type MlKitElement = { text: string; frame: Frame };
type MlKitLine = { text: string; frame: Frame; elements: MlKitElement[] };
type MlKitBlock = { text: string; frame: Frame; lines: MlKitLine[] };
type MlKitResult = { text: string; blocks: MlKitBlock[] };

// Reconstructs left-to-right, top-to-bottom row text from ML Kit's
// positioned word-level results — the same Y-cluster/X-sort approach
// already used for real PDF text layers (see pdfExtractHtml.ts), applied
// here to OCR output instead, so both extraction paths feed the exact
// same downstream parser (timetablePdfParser.ts).
function reconstructLines(elements: { text: string; x: number; y: number }[]): string {
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
// network call, no server: Google ML Kit's text recognizer ships its model
// on-device as part of the native module, same offline guarantee as the
// PDF text-layer path.
export async function recognizePageImage(base64Png: string): Promise<string> {
  const tmpPath = `${FileSystem.cacheDirectory}pdf-ocr-page-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  await FileSystem.writeAsStringAsync(tmpPath, base64Png, { encoding: FileSystem.EncodingType.Base64 });
  try {
    const result = (await TextRecognition.recognize(tmpPath)) as MlKitResult;
    const elements: { text: string; x: number; y: number }[] = [];
    for (const block of result.blocks || []) {
      for (const line of block.lines || []) {
        for (const el of line.elements || []) {
          elements.push({ text: el.text, x: el.frame.left, y: el.frame.top });
        }
      }
    }
    return reconstructLines(elements);
  } finally {
    FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
  }
}
