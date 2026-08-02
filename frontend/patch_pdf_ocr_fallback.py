#!/usr/bin/env python3
"""
Patches app/(tabs)/upload.tsx:
  - Imports recognizePageImage from src/lib/ocrExtract.
  - pickPdf(): when text-layer extraction finds zero rows, automatically
    falls back to rendering each page as an image and running on-device
    OCR on it, then re-parses. Only fails with an error if BOTH paths
    find nothing.

Run from the frontend/ directory (after copying in the updated
HiddenPdfExtractor.tsx, pdfExtractHtml.ts, timetablePdfParser.ts, and new
ocrExtract.ts):
    python3 patch_pdf_ocr_fallback.py
"""
import sys

PATH = "app/(tabs)/upload.tsx"

EDITS = [
    (
        "Import recognizePageImage",
        '''import { parseTimetablePdfText } from "@/src/lib/timetablePdfParser";''',
        '''import { parseTimetablePdfText } from "@/src/lib/timetablePdfParser";
import { recognizePageImage } from "@/src/lib/ocrExtract";''',
    ),
    (
        "pickPdf: add OCR fallback when text layer finds nothing",
        '''      setLoadingLabel("Detecting timetable rows…");
      const result = parseTimetablePdfText(rawText);
      if (result.rowCount === 0) {
        throw new Error(
          "Couldn't detect any timetable rows in this PDF. It may use a layout this converter doesn't recognize yet.",
        );
      }
      setPdfResult({ csv: result.csv, rowCount: result.rowCount });''',
        '''      setLoadingLabel("Detecting timetable rows…");
      let result = parseTimetablePdfText(rawText);

      if (result.rowCount === 0) {
        // No usable text layer (e.g. a scanned/photographed poster saved
        // as a PDF) — fall back to rendering each page as an image and
        // running on-device OCR on it instead.
        setLoadingLabel("No readable text found — trying on-device OCR…");
        const pages = await pdfExtractorRef.current?.renderPages(base64);
        if (!pages || pages.length === 0) {
          throw new Error("Couldn't render this PDF's pages for OCR.");
        }
        let ocrText = "";
        for (let i = 0; i < pages.length; i++) {
          setLoadingLabel(`Reading page ${i + 1} of ${pages.length} with OCR…`);
          const pageText = await recognizePageImage(pages[i]);
          ocrText += pageText + "\\n";
        }
        result = parseTimetablePdfText(ocrText);
      }

      if (result.rowCount === 0) {
        throw new Error(
          "Couldn't detect any timetable rows in this PDF, even with OCR. It may use a layout this converter doesn't recognize yet.",
        );
      }
      setPdfResult({ csv: result.csv, rowCount: result.rowCount });''',
    ),
]

def main():
    with open(PATH, "r", encoding="utf-8") as f:
        content = f.read()

    for name, old, new in EDITS:
        count = content.count(old)
        if count != 1:
            print(f"MISMATCH on edit '{name}': expected exactly 1 occurrence of the old text, found {count}.")
            print("Aborting. NO changes have been written to the file.")
            sys.exit(1)
        content = content.replace(old, new, 1)
        print(f"OK: applied '{name}'")

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"\nAll edits applied successfully to {PATH}")

if __name__ == "__main__":
    main()
