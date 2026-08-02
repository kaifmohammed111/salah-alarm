#!/usr/bin/env python3
"""
Patches app/(tabs)/how-to-pray.tsx:
  - Removes the right-side rakah-count pill (segmentCountBadge) from
    each segment card, since the count is now shown in the left tile.
  - Leaves the segmentCountBadge/segmentCountText style definitions in
    place (unused but harmless) to minimize the diff.

Run from the frontend/ directory:
    python3 patch_remove_count_pill.py
"""
import sys

PATH = "app/(tabs)/how-to-pray.tsx"

EDITS = [
    (
        "Remove right-side count pill JSX",
        '''                <View style={[styles.segmentCountBadge, { backgroundColor: colors.brandTertiary }]}>
                  <Text style={[styles.segmentCountText, { color: colors.brand }]}>{seg.rakahCount}</Text>
                </View>
                {isTappable ? (
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 4 }} />
                ) : null}''',
        '''                {isTappable ? (
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 4 }} />
                ) : null}''',
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
