import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useApp } from "@/src/context/AppContext";
import { FONTS, RADIUS, SPACING } from "@/src/theme";
import PrayerPostureIllustration from "@/src/components/PrayerPostureIllustration";
import {
  DailyPrayerInfo,
  FIQH_OPTIONS,
  Fiqh,
  PRAYER_CATEGORIES,
  PrayerSegment,
  SEGMENT_TYPE_LABELS,
  buildSegmentSteps,
  getDailyPrayersForFiqh,
} from "@/src/lib/howToPray";

export default function HowToPrayScreen() {
  const { colors, settings, updateSettings } = useApp();
  const insets = useSafeAreaInsets();
  const [selectedPrayer, setSelectedPrayer] = useState<DailyPrayerInfo | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<PrayerSegment | null>(null);

  const steps = useMemo(() => (selectedSegment ? buildSegmentSteps(selectedSegment) : []), [selectedSegment]);
  // Explicitly scoped by fiqh — see getDailyPrayersForFiqh() for why
  // this isn't just a flat constant.
  const dailyPrayers = settings.fiqh ? getDailyPrayersForFiqh(settings.fiqh) : [];

  // First-time-only madhab prompt — shown until the user makes a choice,
  // never again after that (changing it later happens via Settings, not
  // by re-showing this prompt).
  if (!settings.fiqh) {
    return (
      <View style={[styles.root, { backgroundColor: colors.surfaceSecondary, paddingTop: insets.top + SPACING.xxl }]}>
        <View style={{ padding: SPACING.xl, flex: 1, justifyContent: "center" }}>
          <Ionicons name="book-outline" size={48} color={colors.brand} style={{ alignSelf: "center", marginBottom: SPACING.lg }} />
          <Text style={[styles.promptTitle, { color: colors.onSurface }]}>Choose Your Madhab</Text>
          <Text style={[styles.promptSub, { color: colors.onSurfaceTertiary }]}>
            This lets How to Pray show details specific to your school of thought, like hand position. You can
            change this later in Settings.
          </Text>
          {FIQH_OPTIONS.map((opt) => {
            const isAvailable = opt.key === "hanafi";
            return (
              <Pressable
                key={opt.key}
                testID={`how-to-pray-choose-fiqh-${opt.key}`}
                onPress={() => isAvailable && updateSettings({ fiqh: opt.key as Fiqh })}
                disabled={!isAvailable}
                style={[
                  styles.promptOption,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  !isAvailable && { opacity: 0.5 },
                ]}
              >
                <Text style={[styles.promptOptionText, { color: colors.onSurface }]}>{opt.label}</Text>
                {isAvailable ? (
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                ) : (
                  <Text style={[styles.comingSoonInline, { color: colors.muted }]}>Coming Soon</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  // Level 3: step-by-step detail for the selected (Fard) segment.
  if (selectedPrayer && selectedSegment) {
    return (
      <View style={[styles.root, { backgroundColor: colors.surfaceSecondary }]}>
        <View style={[styles.header, { paddingTop: insets.top + SPACING.md, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable testID="how-to-pray-back-to-segments" onPress={() => setSelectedSegment(null)} style={styles.backRow} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={colors.brand} />
            <Text style={[styles.backText, { color: colors.brand }]}>{selectedPrayer.label}</Text>
          </Pressable>
          <Text style={[styles.detailTitle, { color: colors.onSurface }]}>
            {selectedPrayer.label} · {selectedSegment.labelOverride ?? SEGMENT_TYPE_LABELS[selectedSegment.type]} ({selectedSegment.rakahCount} Rakahs)
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + SPACING.xxxl }}>
          {steps.map((step, i) => (
            <View key={step.id} style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.stepIllustration}>
                <PrayerPostureIllustration pose={step.pose} size={90} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepNum, { color: colors.brand }]}>STEP {i + 1}</Text>
                <Text style={[styles.stepTitle, { color: colors.onSurface }]}>{step.title}</Text>
                <Text style={[styles.stepDesc, { color: colors.onSurfaceTertiary }]}>{step.description}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // Level 2: list of segments (Sunnah / Fard / Nafl / Witr) for the
  // selected prayer time. Only Fard opens the full illustrated
  // walkthrough — the others are listed (so the full daily structure is
  // visible) but not tappable, since only Fard has step content built
  // out right now.
  if (selectedPrayer) {
    return (
      <View style={[styles.root, { backgroundColor: colors.surfaceSecondary }]}>
        <View style={[styles.header, { paddingTop: insets.top + SPACING.md, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable testID="how-to-pray-back-to-prayers" onPress={() => setSelectedPrayer(null)} style={styles.backRow} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={colors.brand} />
            <Text style={[styles.backText, { color: colors.brand }]}>All Prayers</Text>
          </Pressable>
          <Text style={[styles.detailTitle, { color: colors.onSurface }]}>{selectedPrayer.label}</Text>
          <Text style={[styles.headerSub, { color: colors.onSurfaceTertiary }]}>
            Each part is prayed as its own complete unit, one after another — tap Fard for the full walkthrough
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + SPACING.xxxl }}>
          {selectedPrayer.segments.map((seg, i) => {
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
          })}
        </ScrollView>
      </View>
    );
  }

  // Level 1: category list (Daily Prayers, plus Coming Soon categories).
  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>How to Pray</Text>
        <Text style={[styles.headerSub, { color: colors.onSurfaceTertiary }]}>
          {FIQH_OPTIONS.find((o) => o.key === settings.fiqh)?.label} madhab · change in Settings
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: insets.bottom + SPACING.xxxl }}>
        <View style={[styles.disclaimer, { backgroundColor: colors.brandTertiary }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
          <Text style={[styles.disclaimerText, { color: colors.onSurface }]}>
            This guide reflects commonly-taught basics. For detailed guidance, especially on finer points that vary
            between madhabs, please consult a qualified local scholar or imam.
          </Text>
        </View>

        {PRAYER_CATEGORIES.map((cat) => (
          <View key={cat.key}>
            <Text style={[styles.sectionLabel, { color: colors.onSurfaceTertiary }]}>{cat.label.toUpperCase()}</Text>
            {cat.key === "daily" ? (
              dailyPrayers.map((p) => (
                <Pressable
                  key={p.key}
                  testID={`how-to-pray-${p.key}`}
                  onPress={() => setSelectedPrayer(p)}
                  style={[styles.listRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.listIconWrap, { backgroundColor: colors.brandTertiary }]}>
                    <PrayerPostureIllustration pose="standing-navel" size={44} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listTitle, { color: colors.onSurface }]}>{p.label}</Text>
                    <Text style={[styles.listSub, { color: colors.onSurfaceTertiary }]}>
                      {p.segments.map((s) => s.rakahCount).join(" + ")} rakahs across {p.segments.length} parts
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              ))
            ) : (
              <View style={[styles.listRow, styles.disabledRow, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                <View style={[styles.listIconWrap, { backgroundColor: colors.surface }]}>
                  <Ionicons name="time-outline" size={20} color={colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listTitle, { color: colors.muted }]}>{cat.label}</Text>
                </View>
                <View style={[styles.comingSoonBadge, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.comingSoonBadgeText, { color: colors.muted }]}>Coming Soon</Text>
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: FONTS.bold, fontSize: 26 },
  headerSub: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2 },
  promptTitle: { fontFamily: FONTS.bold, fontSize: 24, textAlign: "center", marginBottom: SPACING.sm },
  promptSub: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: SPACING.xl },
  promptOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.sm,
  },
  promptOptionText: { fontFamily: FONTS.semibold, fontSize: 16 },
  comingSoonInline: { fontFamily: FONTS.semibold, fontSize: 11 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: SPACING.sm },
  backText: { fontFamily: FONTS.semibold, fontSize: 14 },
  detailTitle: { fontFamily: FONTS.bold, fontSize: 22 },
  disclaimer: {
    flexDirection: "row",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xl,
  },
  disclaimerText: { flex: 1, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17 },
  sectionLabel: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 0.5, marginBottom: SPACING.sm, marginTop: SPACING.lg },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.sm,
  },
  disabledRow: { opacity: 0.6 },
  listIconWrap: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  segmentOrderBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  segmentOrderText: { fontFamily: FONTS.bold, fontSize: 14 },
  listTitle: { fontFamily: FONTS.bold, fontSize: 16 },
  listSub: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 1 },
  comingSoonBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.pill },
  comingSoonBadgeText: { fontFamily: FONTS.semibold, fontSize: 10 },
  stepCard: {
    flexDirection: "row",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.md,
    alignItems: "center",
  },
  stepIllustration: { width: 90, alignItems: "center", justifyContent: "center" },
  stepNum: { fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 0.5 },
  stepTitle: { fontFamily: FONTS.bold, fontSize: 15, marginTop: 2, marginBottom: 4 },
  stepDesc: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19 },
});
