#!/usr/bin/env python3
"""
Patches app/(tabs)/upload.tsx:
  - Passes the number of days in the current month as expectedTotalDays
    to all three parseTimetablePdfText() call sites (PDF text-layer, PDF
    OCR-fallback, photo import), so a shortfall gets padded with blank
    placeholder days at the end and correctly surfaces the missing-days
    popup — this parameter existed in the parser already but was never
    actually wired up here.

Run from the frontend/ directory:
    python3 patch_wire_expected_days.py
"""
import sys

PATH = "app/(tabs)/upload.tsx"

EDITS = [
    (
        "pickPdf: compute daysInMonth, pass to text-layer parse call",
        '''      let result = parseTimetablePdfText(rawText);''',
        '''      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      let result = parseTimetablePdfText(rawText, daysInMonth);''',
    ),
    (
        "pickPdf: pass daysInMonth to OCR-fallback parse call",
        '''        result = parseTimetablePdfText(ocrText);
        console.log(`[PDF OCR DEBUG] parsed rowCount=${result.rowCount}`);''',
        '''        result = parseTimetablePdfText(ocrText, daysInMonth);
        console.log(`[PDF OCR DEBUG] parsed rowCount=${result.rowCount}`);''',
    ),
    (
        "pickImage: compute daysInMonth, pass to parse call",
        '''      const result = parseTimetablePdfText(ocrText);''',
        '''      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const result = parseTimetablePdfText(ocrText, daysInMonth);''',
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
