#!/usr/bin/env python3
"""
Patches app/(tabs)/how-to-pray.tsx:
  1. Imports useRouter from expo-router (same pattern already used in
     index.tsx, upload.tsx, settings.tsx, editor.tsx).
  2. Instantiates const router = useRouter() in the component.
  3. Makes the "change in Settings" text a tappable link that navigates
     to /settings, renamed to "Change Setting" and styled in brand color.

Run from the frontend/ directory:
    python3 patch_change_setting_link.py
"""
import sys

PATH = "app/(tabs)/how-to-pray.tsx"

EDITS = [
    (
        "Import useRouter",
        '''import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";''',
        '''import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";''',
    ),
    (
        "Instantiate router",
        '''  const { colors, settings, updateSettings } = useApp();
  const insets = useSafeAreaInsets();''',
        '''  const { colors, settings, updateSettings } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();''',
    ),
    (
        "Make 'change in Settings' text tappable, rename to 'Change Setting'",
        '''            <Text style={[styles.headerSub, { color: colors.onSurfaceTertiary }]}>
              {FIQH_OPTIONS.find((o) => o.key === settings.fiqh)?.label} madhab · change in Settings
            </Text>''',
        '''            <Text style={[styles.headerSub, { color: colors.onSurfaceTertiary }]}>
              {FIQH_OPTIONS.find((o) => o.key === settings.fiqh)?.label} madhab ·{" "}
              <Text
                testID="how-to-pray-change-madhab-link"
                onPress={() => router.push("/settings")}
                style={{ color: colors.brand, fontFamily: FONTS.semibold }}
              >
                Change Setting
              </Text>
            </Text>''',
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
