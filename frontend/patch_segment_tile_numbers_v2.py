#!/usr/bin/env python3
"""
Patches app/(tabs)/how-to-pray.tsx:
  - Removes the per-type icon in each segment card's leading tile,
    replacing it with the plain rakah count number (e.g. "2", "4").
  - Removes the now-unused segmentIconName variable.
  - Adds the segmentIconNumber text style.

Run from the frontend/ directory:
    python3 patch_segment_tile_numbers_v2.py
"""
import sys

PATH = "app/(tabs)/how-to-pray.tsx"

EDITS = [
    (
        "Remove unused segmentIconName variable",
        '''            const segmentIconName =
              seg.type === "fard"
                ? "star"
                : seg.type === "wajib"
                ? "flag"
                : seg.type === "sunnah-muakkadah"
                ? "sparkles"
                : seg.type === "sunnah-ghair-muakkadah"
                ? "leaf-outline"
                : "add-circle-outline";
            const segmentStatusText =''',
        '''            const segmentStatusText =''',
    ),
    (
        "Tile: icon -> rakah count number",
        '''                <View style={[styles.segmentIconWrap, { backgroundColor: colors.brandTertiary }]}>
                  <Ionicons name={segmentIconName} size={18} color={colors.brand} />
                </View>''',
        '''                <View style={[styles.segmentIconWrap, { backgroundColor: colors.brandTertiary }]}>
                  <Text style={[styles.segmentIconNumber, { color: colors.brand }]}>{seg.rakahCount}</Text>
                </View>''',
    ),
    (
        "Add segmentIconNumber style",
        '''  segmentIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },''',
        '''  segmentIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  segmentIconNumber: { fontFamily: FONTS.bold, fontSize: 16 },''',
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
