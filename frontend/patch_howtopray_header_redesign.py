#!/usr/bin/env python3
"""
Patches app/(tabs)/how-to-pray.tsx:
  1. Imports: adds Image (react-native) and MaterialCommunityIcons (@expo/vector-icons).
  2. Level-1 header: adds the mosque image beside the title, using a flex
     row (no absolute positioning) so it can't overlap/clip unpredictably.
  3. Disclaimer box: restyled as bordered card with a circular brand-color
     icon badge + bold headline + separate body text (was a single flat
     info-icon-plus-paragraph row).
  4. Daily prayer list icons: replaced the shared "standing-navel" pose
     icon (same for every prayer) with a distinct MaterialCommunityIcons
     glyph per prayer (sunrise/sun/sun/sunset/moon), still on the
     existing colors.brandTertiary tile background — no new colors added.

Run from the frontend/ directory:
    python3 patch_howtopray_header_redesign.py

Each edit has a hard MISMATCH guard: if the expected "old" text isn't
found exactly once, the script aborts with NO changes written.
"""
import sys

PATH = "app/(tabs)/how-to-pray.tsx"

EDITS = [
    (
        "Imports: Image + MaterialCommunityIcons",
        '''import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";''',
        '''import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";''',
    ),
    (
        "Level-1 header: add mosque art",
        '''      <View style={[styles.header, { paddingTop: insets.top + SPACING.md, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>How to Pray</Text>
        <Text style={[styles.headerSub, { color: colors.onSurfaceTertiary }]}>
          {FIQH_OPTIONS.find((o) => o.key === settings.fiqh)?.label} madhab · change in Settings
        </Text>
      </View>''',
        '''      <View style={[styles.header, { paddingTop: insets.top + SPACING.md, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={[styles.title, { color: colors.onSurface }]}>How to Pray</Text>
            <Text style={[styles.headerSub, { color: colors.onSurfaceTertiary }]}>
              {FIQH_OPTIONS.find((o) => o.key === settings.fiqh)?.label} madhab · change in Settings
            </Text>
          </View>
          <Image
            source={require("../../assets/images/mosque-header.png")}
            style={styles.headerMosqueArt}
            resizeMode="contain"
          />
        </View>
      </View>''',
    ),
    (
        "Disclaimer box restyle",
        '''        <View style={[styles.disclaimer, { backgroundColor: colors.brandTertiary }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
          <Text style={[styles.disclaimerText, { color: colors.onSurface }]}>
            This guide reflects commonly-taught basics. For detailed guidance, especially on finer points that vary
            between madhabs, please consult a qualified local scholar or imam.
          </Text>
        </View>''',
        '''        <View style={[styles.disclaimer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.disclaimerIconWrap, { backgroundColor: colors.brand }]}>
            <Ionicons name="information" size={16} color={colors.onBrandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.disclaimerTitle, { color: colors.onSurface }]}>
              This guide reflects commonly-taught basics.
            </Text>
            <Text style={[styles.disclaimerText, { color: colors.onSurfaceTertiary }]}>
              For detailed guidance, especially on finer points that vary between madhabs, please consult a
              qualified local scholar or imam.
            </Text>
          </View>
        </View>''',
    ),
    (
        "Daily prayer list: per-prayer icon instead of shared pose icon",
        '''                  <View style={[styles.listIconWrap, { backgroundColor: colors.brandTertiary }]}>
                    <PrayerPostureIllustration pose="standing-navel" size={44} />
                  </View>''',
        '''                  <View style={[styles.listIconWrap, { backgroundColor: colors.brandTertiary }]}>
                    <MaterialCommunityIcons
                      name={
                        p.key === "fajr"
                          ? "weather-sunset-up"
                          : p.key === "zuhr"
                          ? "weather-sunny"
                          : p.key === "asr"
                          ? "white-balance-sunny"
                          : p.key === "maghrib"
                          ? "weather-sunset-down"
                          : "weather-night"
                      }
                      size={24}
                      color={colors.brand}
                    />
                  </View>''',
    ),
    (
        "Styles: header row/mosque art + disclaimer badge/title",
        '''  headerSub: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2 },''',
        '''  headerSub: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2 },
  headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  headerTextCol: { flex: 1, paddingRight: SPACING.sm },
  headerMosqueArt: { width: 110, height: 110, marginBottom: -SPACING.md },''',
    ),
    (
        "Styles: disclaimer restyle (border + icon badge + title)",
        '''  disclaimer: {
    flexDirection: "row",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xl,
  },
  disclaimerText: { flex: 1, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17 },''',
        '''  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.xl,
  },
  disclaimerIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  disclaimerTitle: { fontFamily: FONTS.bold, fontSize: 14, marginBottom: 2 },
  disclaimerText: { flex: 1, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17 },''',
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
