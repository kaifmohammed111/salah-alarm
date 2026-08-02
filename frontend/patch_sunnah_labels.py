#!/usr/bin/env python3
"""
Patches src/lib/howToPray.ts:
  - "sunnah-muakkadah" label: "... / Important Sunnah" -> "... / Emphasized Sunnah"
  - "sunnah-ghair-muakkadah" label: adds " / Non Emphasized Sunnah"

Run from the frontend/ directory:
    python3 patch_sunnah_labels.py

Hard MISMATCH guard: if the expected "old" text isn't found exactly once,
the script aborts with NO changes written.
"""
import sys

PATH = "src/lib/howToPray.ts"

EDITS = [
    (
        "sunnah-muakkadah + sunnah-ghair-muakkadah labels",
        '''  "sunnah-muakkadah": "Sunnah (Mu'akkadah) / Important Sunnah",
  "sunnah-ghair-muakkadah": "Sunnah (Ghair Mu'akkadah)",''',
        '''  "sunnah-muakkadah": "Sunnah (Mu'akkadah) / Emphasized Sunnah",
  "sunnah-ghair-muakkadah": "Sunnah (Ghair Mu'akkadah) / Non Emphasized Sunnah",''',
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
