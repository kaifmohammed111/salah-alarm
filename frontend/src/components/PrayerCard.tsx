import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { FONTS, RADIUS, SPACING, ThemeColors } from "@/src/theme";
import {
  AlarmConfig,
  PRAYER_ICONS,
  PRAYER_LABELS,
  PrayerKey,
  PrayerStatus,
  formatTime,
} from "@/src/lib/prayer";

type Props = {
  prayerKey: PrayerKey;
  startTime: string;
  jamaatTime: string | null; // null for sunrise
  status: PrayerStatus;
  config: AlarmConfig;
  colors: ThemeColors;
  is24h: boolean;
  onPress: () => void;
  onToggleSound: () => void;
};

export default function PrayerCard({
  prayerKey,
  startTime,
  jamaatTime,
  status,
  config,
  colors,
  is24h,
  onPress,
  onToggleSound,
}: Props) {
  const isCurrent = status === "current";
  const isPast = status === "past";
  const isSunrise = prayerKey === "sunrise";

  const bg = isCurrent ? colors.brandPrimary : colors.surface;
  const primaryText = isCurrent ? colors.onBrandPrimary : colors.onSurface;
  const labelText = isCurrent ? "rgba(255,255,255,0.7)" : colors.muted;
  const valueText = isCurrent ? colors.onBrandPrimary : colors.onSurfaceSecondary;

  const label = PRAYER_LABELS[prayerKey];

  const soundOn = !isSunrise && config.enabled;

  return (
    <Pressable
      testID={`prayer-card-${prayerKey}`}
      onPress={isSunrise ? undefined : onPress}
      style={[
        styles.card,
        { backgroundColor: bg, borderColor: colors.border },
        isCurrent && styles.cardCurrent,
        isPast && { opacity: 0.5, backgroundColor: colors.surfaceSecondary },
        !isCurrent && !isPast && styles.shadow,
      ]}
    >
      <View style={styles.left}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: isCurrent ? "rgba(255,255,255,0.18)" : colors.brandTertiary },
          ]}
        >
          <Ionicons
            name={PRAYER_ICONS[prayerKey] as any}
            size={20}
            color={isCurrent ? colors.onBrandPrimary : colors.brand}
          />
        </View>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: primaryText }]}>{label}</Text>
            {isCurrent ? (
              <View style={styles.upNext}>
                <Text style={styles.upNextText}>UP NEXT</Text>
              </View>
            ) : null}
          </View>

          {isSunrise ? (
            <View style={styles.timeRow}>
              <Text style={[styles.timeLabel, { color: labelText }]}>Sunrise</Text>
              <Text style={[styles.timeValue, { color: valueText }]}>
                {formatTime(startTime, is24h)}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.timeRow}>
                <Text style={[styles.timeLabel, { color: labelText }]}>Start</Text>
                <Text style={[styles.timeValue, { color: valueText }]}>
                  {formatTime(startTime, is24h)}
                </Text>
              </View>
              <View style={styles.timeRow}>
                <Text style={[styles.timeLabel, { color: labelText }]}>Jamaat</Text>
                <Text style={[styles.timeValueStrong, { color: primaryText }]}>
                  {formatTime(jamaatTime || "", is24h)}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      <Pressable
        testID={`prayer-sound-${prayerKey}`}
        onPress={isSunrise ? undefined : onToggleSound}
        hitSlop={10}
        style={styles.soundBtn}
      >
        <Ionicons
          name={isSunrise ? "volume-mute-outline" : soundOn ? "volume-high" : "volume-mute-outline"}
          size={24}
          color={
            isSunrise
              ? colors.muted
              : isCurrent
              ? colors.onBrandPrimary
              : soundOn
              ? colors.brand
              : colors.muted
          }
        />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardCurrent: {
    borderWidth: 0,
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  shadow: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  left: { flexDirection: "row", alignItems: "center", gap: SPACING.md, flex: 1 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: 4 },
  name: { fontFamily: FONTS.bold, fontSize: 17 },
  upNext: {
    backgroundColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  upNextText: { fontFamily: FONTS.bold, fontSize: 9, color: "#fff", letterSpacing: 0.5 },
  timeRow: { flexDirection: "row", alignItems: "center", marginTop: 1 },
  timeLabel: { fontFamily: FONTS.medium, fontSize: 12, width: 54 },
  timeValue: { fontFamily: FONTS.semibold, fontSize: 14 },
  timeValueStrong: { fontFamily: FONTS.bold, fontSize: 15 },
  soundBtn: { padding: SPACING.xs, marginLeft: SPACING.sm },
});
