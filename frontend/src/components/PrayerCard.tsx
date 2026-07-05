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
  time: string;
  status: PrayerStatus;
  config: AlarmConfig;
  colors: ThemeColors;
  is24h: boolean;
  asrMethod: "hanafi" | "shafi";
  onPress: () => void;
  onToggleSound: () => void;
};

export default function PrayerCard({
  prayerKey,
  time,
  status,
  config,
  colors,
  is24h,
  asrMethod,
  onPress,
  onToggleSound,
}: Props) {
  const isCurrent = status === "current";
  const isPast = status === "past";
  const isSunrise = prayerKey === "sunrise";

  const bg = isCurrent ? colors.brandPrimary : colors.surface;
  const primaryText = isCurrent ? colors.onBrandPrimary : colors.onSurface;
  const secondaryText = isCurrent ? "rgba(255,255,255,0.75)" : colors.onSurfaceTertiary;

  let label = PRAYER_LABELS[prayerKey];
  if (prayerKey === "asr") label = `Asr (${asrMethod === "hanafi" ? "Hanafi" : "Shafi"})`;
  if (prayerKey === "isha") label = "Isha";

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
            {
              backgroundColor: isCurrent
                ? "rgba(255,255,255,0.18)"
                : colors.brandTertiary,
            },
          ]}
        >
          <Ionicons
            name={PRAYER_ICONS[prayerKey] as any}
            size={20}
            color={isCurrent ? colors.onBrandPrimary : colors.brand}
          />
        </View>
        <View>
          <Text style={[styles.name, { color: primaryText }]}>{label}</Text>
          {isCurrent ? (
            <Text style={[styles.badge, { color: secondaryText }]}>Up next</Text>
          ) : isSunrise ? (
            <Text style={[styles.badge, { color: secondaryText }]}>No alarm</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.right}>
        <Text style={[styles.time, { color: primaryText }]}>{formatTime(time, is24h)}</Text>
        <Pressable
          testID={`prayer-sound-${prayerKey}`}
          onPress={isSunrise ? undefined : onToggleSound}
          hitSlop={10}
          style={styles.soundBtn}
        >
          <Ionicons
            name={
              isSunrise
                ? "volume-mute-outline"
                : soundOn
                ? "volume-high"
                : "volume-mute-outline"
            }
            size={22}
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
      </View>
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
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontFamily: FONTS.semibold, fontSize: 16 },
  badge: { fontFamily: FONTS.medium, fontSize: 12, marginTop: 2 },
  right: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  time: { fontFamily: FONTS.bold, fontSize: 17 },
  soundBtn: { padding: SPACING.xs },
});
