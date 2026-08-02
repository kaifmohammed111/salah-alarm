#!/usr/bin/env python3
"""
Patches src/lib/howToPray.ts:
  1. Adds an optional `labelOverride` field to the PrayerSegment type.
  2. Updates SEGMENT_TYPE_LABELS text (Fard/Sunnah-Muakkadah/Wajib -> "... / X").
  3. Sets labelOverride on Isha's Witr segment to "Witr (Wajib) / Compulsory".

Run from the frontend/ directory:
    python3 patch_howtopray_labels.py

Each edit has a hard MISMATCH guard: if the expected "old" text isn't found
exactly once, the script aborts with NO changes written, rather than
silently corrupting the file.
"""
import sys

PATH = "src/lib/howToPray.ts"

EDITS = [
    (
        "PrayerSegment type: add labelOverride field",
        '''export type PrayerSegment = {
  id: string;
  type: SegmentType;
  rakahCount: number;''',
        '''export type PrayerSegment = {
  id: string;
  type: SegmentType;
  rakahCount: number;
  // Optional display-label override for a specific segment instance —
  // used when the generic SEGMENT_TYPE_LABELS text for this segment's
  // `type` isn't specific enough (e.g. Isha's Witr is type "wajib" but
  // should read "Witr (Wajib) / Compulsory" instead of the generic
  // "Wajib / Compulsory" label). Rendering code must prefer this over
  // SEGMENT_TYPE_LABELS[type] when present.
  labelOverride?: string;''',
    ),
    (
        "SEGMENT_TYPE_LABELS: update Fard/Sunnah-Muakkadah/Wajib text",
        '''export const SEGMENT_TYPE_LABELS: Record<SegmentType, string> = {
  "sunnah-muakkadah": "Sunnah (Mu'akkadah)",
  "sunnah-ghair-muakkadah": "Sunnah (Ghair Mu'akkadah)",
  fard: "Fard",
  nafl: "Nafl",
  wajib: "Wajib",
};''',
        '''export const SEGMENT_TYPE_LABELS: Record<SegmentType, string> = {
  "sunnah-muakkadah": "Sunnah (Mu'akkadah) / Important Sunnah",
  "sunnah-ghair-muakkadah": "Sunnah (Ghair Mu'akkadah)",
  fard: "Fard / Compulsory",
  nafl: "Nafl",
  wajib: "Wajib / Compulsory",
};''',
    ),
    (
        "Isha Witr segment: add labelOverride",
        '''      { id: "isha-witr", type: "wajib", rakahCount: 3, audibleRakahs: [1, 2, 3], qunutInFinalRakah: true },''',
        '''      { id: "isha-witr", type: "wajib", rakahCount: 3, audibleRakahs: [1, 2, 3], qunutInFinalRakah: true, labelOverride: "Witr (Wajib) / Compulsory" },''',
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

    print(f"\nAll 3 edits applied successfully to {PATH}")

if __name__ == "__main__":
    main()
