#!/usr/bin/env python3
"""
Patches app/(tabs)/upload.tsx:
  - Fixes a bug where an image-only PDF (which correctly extracts as an
    EMPTY STRING, not an error) was incorrectly treated as a hard failure
    before ever reaching the OCR fallback path, because `!rawText` is true
    for both `undefined` and `""`. Now only a genuinely missing result
    (extractText not resolving at all) throws here — an empty string
    proceeds to parseTimetablePdfText, which naturally returns 0 rows and
    triggers the existing OCR fallback.

Run from the frontend/ directory:
    python3 patch_fix_empty_text_bug.py
"""
import sys

PATH = "app/(tabs)/upload.tsx"

EDITS = [
    (
        "Don't throw on empty (but present) extracted text — let it fall through to OCR",
        '''      const rawText = await pdfExtractorRef.current?.extractText(base64);
      if (!rawText) throw new Error("Could not read this PDF's text.");''',
        '''      const rawText = await pdfExtractorRef.current?.extractText(base64);
      // An empty string is a valid result (image-only PDF, no text layer)
      // and should fall through to the OCR fallback below — only a
      // missing/undefined result (the extractor itself failed) is a hard
      // error here.
      if (rawText === undefined || rawText === null) {
        throw new Error("Could not read this PDF's text.");
      }''',
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
