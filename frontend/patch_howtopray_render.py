#!/usr/bin/env python3
"""
Patches app/(tabs)/how-to-pray.tsx so both places that render a segment's
label prefer `segment.labelOverride` when present, falling back to the
generic SEGMENT_TYPE_LABELS[type] text otherwise.

Run from the frontend/ directory:
    python3 patch_howtopray_render.py

Each edit has a hard MISMATCH guard: if the expected "old" text isn't found
exactly once, the script aborts with NO changes written.
"""
import sys

PATH = "app/(tabs)/how-to-pray.tsx"

EDITS = [
    (
        "Header line: selectedSegment label",
        '''            {selectedPrayer.label} · {SEGMENT_TYPE_LABELS[selectedSegment.type]} ({selectedSegment.rakahCount} Rakahs)''',
        '''            {selectedPrayer.label} · {selectedSegment.labelOverride ?? SEGMENT_TYPE_LABELS[selectedSegment.type]} ({selectedSegment.rakahCount} Rakahs)''',
    ),
    (
        "List row: seg label",
        '''                    {seg.rakahCount} {SEGMENT_TYPE_LABELS[seg.type]}''',
        '''                    {seg.rakahCount} {seg.labelOverride ?? SEGMENT_TYPE_LABELS[seg.type]}''',
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

    print(f"\nBoth edits applied successfully to {PATH}")

if __name__ == "__main__":
    main()
