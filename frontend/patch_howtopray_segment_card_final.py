#!/usr/bin/env python3
"""
Patches app/(tabs)/how-to-pray.tsx (Level-2 segment list):
  1. Replaces the plain order-badge + title row with a card-based row:
     per-type icon, title/subtitle split from "Title / Subtitle" label
     text, a status pill (Required/Optional/Recommended), and a rakah
     count pill.
  2. Adds the matching StyleSheet entries.

Built directly from the file's CURRENT confirmed content (order-badge
list, stepDesc as the last style before the closing brace) — not a
stale earlier snapshot.

Run from the frontend/ directory:
    python3 patch_howtopray_segment_card_final.py
"""
import sys

PATH = "app/(tabs)/how-to-pray.tsx"

EDITS = [
    (
        "Segment list JSX -> card-based row with icon + status pill",
        '''          {selectedPrayer.segments.map((seg, i) => {
            const isTappable = seg.type === "fard" || seg.type === "wajib"; // wajib = Witr, the one non-Fard segment with unique content (Qunut)
            return (
              <Pressable
                key={seg.id}
                testID={`how-to-pray-segment-${seg.id}`}
                onPress={() => isTappable && setSelectedSegment(seg)}
                disabled={!isTappable}
                style={[
                  styles.listRow,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  !isTappable && styles.disabledRow,
                ]}
              >
                <View style={[styles.segmentOrderBadge, { backgroundColor: colors.brandTertiary }]}>
                  <Text style={[styles.segmentOrderText, { color: colors.brand }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listTitle, { color: isTappable ? colors.onSurface : colors.muted }]}>
                    {seg.rakahCount} {seg.labelOverride ?? SEGMENT_TYPE_LABELS[seg.type]}
                  </Text>
                </View>
                {isTappable ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
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
        "Add card/icon/pill styles after stepDesc",
        '''  stepDesc: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19 },
});''',
        '''  stepDesc: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19 },
  segmentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.sm,
  },
  segmentIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  segmentTitle: { fontFamily: FONTS.bold, fontSize: 15 },
  segmentSubtitle: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 1 },
  segmentStatusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    marginTop: 6,
  },
  segmentStatusText: { fontFamily: FONTS.semibold, fontSize: 11 },
  segmentCountBadge: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentCountText: { fontFamily: FONTS.bold, fontSize: 13 },
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

    print(f"\nBoth edits applied successfully to {PATH}")

if __name__ == "__main__":
    main()
