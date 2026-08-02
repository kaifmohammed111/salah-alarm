#!/usr/bin/env python3
"""
Patches app/(tabs)/how-to-pray.tsx:
  - Adds a small status pill under each segment card's title/subtitle:
      sunnah-muakkadah      -> "Recommended but optional upon good reasoning"
      sunnah-ghair-muakkadah -> "Optional"
      nafl                   -> "Optional"
      fard, wajib             -> "Required"
    Uses the existing colors.brandTertiary/colors.brand pair (same
    colors already used elsewhere in this file) — no new colors added.
  - Adds the matching segmentStatusBadge/segmentStatusText styles.

Run from the frontend/ directory (after patch_howtopray_card_redesign.py
has already been applied, since this edit builds on that card layout):
    python3 patch_segment_status_pill.py
"""
import sys

PATH = "app/(tabs)/how-to-pray.tsx"

EDITS = [
    (
        "Add segmentStatusText logic + status pill JSX",
        '''          {selectedPrayer.segments.map((seg, i) => {
            const isTappable = seg.type === "fard" || seg.type === "wajib"; // wajib = Witr, the one non-Fard segment with unique content (Qunut)
            const fullLabel = seg.labelOverride ?? SEGMENT_TYPE_LABELS[seg.type];
            const [segmentTitleText, segmentSubtitleText] = fullLabel.split(" / ");
            const segmentIconName =
              seg.type === "fard"
                ? "star"
                : seg.type === "wajib"
                ? "flag"
                : seg.type === "sunnah-muakkadah"
                ? "sparkles"
                : seg.type === "sunnah-ghair-muakkadah"
                ? "leaf-outline"
                : "add-circle-outline";
            return (
              <Pressable
                key={seg.id}
                testID={`how-to-pray-segment-${seg.id}`}
                onPress={() => isTappable && setSelectedSegment(seg)}
                disabled={!isTappable}
                style={[
                  styles.segmentCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  !isTappable && styles.disabledRow,
                ]}
              >
                <View style={[styles.segmentIconWrap, { backgroundColor: colors.brandTertiary }]}>
                  <Ionicons name={segmentIconName} size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.segmentTitle, { color: isTappable ? colors.onSurface : colors.muted }]}>
                    {segmentTitleText}
                  </Text>
                  {segmentSubtitleText ? (
                    <Text style={[styles.segmentSubtitle, { color: colors.onSurfaceTertiary }]}>{segmentSubtitleText}</Text>
                  ) : null}
                </View>
                <View style={[styles.segmentCountBadge, { backgroundColor: colors.brandTertiary }]}>
                  <Text style={[styles.segmentCountText, { color: colors.brand }]}>{seg.rakahCount}</Text>
                </View>
                {isTappable ? (
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 4 }} />
                ) : null}
              </Pressable>
            );
          })}''',
        '''          {selectedPrayer.segments.map((seg, i) => {
            const isTappable = seg.type === "fard" || seg.type === "wajib"; // wajib = Witr, the one non-Fard segment with unique content (Qunut)
            const fullLabel = seg.labelOverride ?? SEGMENT_TYPE_LABELS[seg.type];
            const [segmentTitleText, segmentSubtitleText] = fullLabel.split(" / ");
            const segmentIconName =
              seg.type === "fard"
                ? "star"
                : seg.type === "wajib"
                ? "flag"
                : seg.type === "sunnah-muakkadah"
                ? "sparkles"
                : seg.type === "sunnah-ghair-muakkadah"
                ? "leaf-outline"
                : "add-circle-outline";
            const segmentStatusText =
              seg.type === "sunnah-muakkadah"
                ? "Recommended but optional upon good reasoning"
                : seg.type === "sunnah-ghair-muakkadah"
                ? "Optional"
                : seg.type === "nafl"
                ? "Optional"
                : "Required"; // fard, wajib
            return (
              <Pressable
                key={seg.id}
                testID={`how-to-pray-segment-${seg.id}`}
                onPress={() => isTappable && setSelectedSegment(seg)}
                disabled={!isTappable}
                style={[
                  styles.segmentCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  !isTappable && styles.disabledRow,
                ]}
              >
                <View style={[styles.segmentIconWrap, { backgroundColor: colors.brandTertiary }]}>
                  <Ionicons name={segmentIconName} size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.segmentTitle, { color: isTappable ? colors.onSurface : colors.muted }]}>
                    {segmentTitleText}
                  </Text>
                  {segmentSubtitleText ? (
                    <Text style={[styles.segmentSubtitle, { color: colors.onSurfaceTertiary }]}>{segmentSubtitleText}</Text>
                  ) : null}
                  <View style={[styles.segmentStatusBadge, { backgroundColor: colors.brandTertiary }]}>
                    <Text style={[styles.segmentStatusText, { color: colors.brand }]}>{segmentStatusText}</Text>
                  </View>
                </View>
                <View style={[styles.segmentCountBadge, { backgroundColor: colors.brandTertiary }]}>
                  <Text style={[styles.segmentCountText, { color: colors.brand }]}>{seg.rakahCount}</Text>
                </View>
                {isTappable ? (
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 4 }} />
                ) : null}
              </Pressable>
            );
          })}''',
    ),
    (
        "Add segmentStatusBadge/segmentStatusText styles",
        '''  segmentCountText: { fontFamily: FONTS.bold, fontSize: 13 },
});''',
        '''  segmentCountText: { fontFamily: FONTS.bold, fontSize: 13 },
  segmentStatusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    marginTop: 6,
  },
  segmentStatusText: { fontFamily: FONTS.semibold, fontSize: 11 },
});''',
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
