#!/usr/bin/env python3
"""
Patches app/(tabs)/upload.tsx:
  - Adds console.log output of the raw OCR text (and page count) so we
    can see exactly what ML Kit read and how row-reconstruction grouped
    it, visible via `adb logcat` — needed to diagnose why only some rows
    parsed correctly rather than guessing blind.

Temporary diagnostic — safe to remove once the real cause is found.

Run from the frontend/ directory:
    python3 patch_ocr_debug_logging.py
"""
import sys

PATH = "app/(tabs)/upload.tsx"

EDITS = [
    (
        "Log raw OCR text for debugging",
        '''        let ocrText = "";
        for (let i = 0; i < pages.length; i++) {
          setLoadingLabel(`Reading page ${i + 1} of ${pages.length} with OCR…`);
          const pageText = await recognizePageImage(pages[i]);
          ocrText += pageText + "\\n";
        }
        result = parseTimetablePdfText(ocrText);''',
        '''        console.log(`[PDF OCR DEBUG] rendered ${pages.length} page(s)`);
        let ocrText = "";
        for (let i = 0; i < pages.length; i++) {
          setLoadingLabel(`Reading page ${i + 1} of ${pages.length} with OCR…`);
          const pageText = await recognizePageImage(pages[i]);
          console.log(`[PDF OCR DEBUG] --- page ${i + 1} raw text (${pageText.length} chars) ---`);
          console.log(pageText);
          ocrText += pageText + "\\n";
        }
        result = parseTimetablePdfText(ocrText);
        console.log(`[PDF OCR DEBUG] parsed rowCount=${result.rowCount}`);''',
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

    print(f"\nEdit applied successfully to {PATH}")

if __name__ == "__main__":
    main()
