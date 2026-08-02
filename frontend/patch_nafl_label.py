#!/usr/bin/env python3
"""
Patches src/lib/howToPray.ts:
  - nafl label: "Nafl" -> "Nafl / Optional" (matching the "/ suffix"
    pattern already used for the other segment types).

Run from the frontend/ directory:
    python3 patch_nafl_label.py
"""
import sys

PATH = "src/lib/howToPray.ts"

EDITS = [
    (
        "nafl label suffix",
        '''export const SEGMENT_TYPE_LABELS: Record<SegmentType, string> = {
  "sunnah-muakkadah": "Sunnah (Mu'akkadah) / Emphasized Sunnah",
  "sunnah-ghair-muakkadah": "Sunnah (Ghair Mu'akkadah) / Non Emphasized Sunnah",
  fard: "Fard / Compulsory",
  nafl: "Nafl",
  wajib: "Wajib / Compulsory",
};''',
        '''export const SEGMENT_TYPE_LABELS: Record<SegmentType, string> = {
  "sunnah-muakkadah": "Sunnah (Mu'akkadah) / Emphasized Sunnah",
  "sunnah-ghair-muakkadah": "Sunnah (Ghair Mu'akkadah) / Non Emphasized Sunnah",
  fard: "Fard / Compulsory",
  nafl: "Nafl / Optional",
  wajib: "Wajib / Compulsory",
};''',
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
