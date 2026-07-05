import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

import { useApp } from "@/src/context/AppContext";
import { FONTS, RADIUS, SPACING } from "@/src/theme";
import { distanceToKaabaKm, qiblaBearing } from "@/src/lib/qibla";

const COMPASS = 300;

type PermState = "undetermined" | "granted" | "denied";

export default function QiblaScreen() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();

  const [perm, setPerm] = useState<PermState>("undetermined");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [heading, setHeading] = useState(0);
  const [qibla, setQibla] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingSub = useRef<Location.LocationSubscription | null>(null);
  const wasAligned = useRef(false);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { status, canAskAgain: cAsk } = await Location.requestForegroundPermissionsAsync();
      setCanAskAgain(cAsk);
      if (status !== "granted") {
        setPerm("denied");
        return;
      }
      setPerm("granted");

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      setQibla(qiblaBearing(latitude, longitude));
      setDistance(distanceToKaabaKm(latitude, longitude));

      if (Platform.OS !== "web") {
        headingSub.current = await Location.watchHeadingAsync((h) => {
          const val = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          setHeading(val);
        });
      } else {
        setError("Compass heading is not available on web. Open on your phone for the live compass.");
      }
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Could not get your location.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { status, canAskAgain: cAsk } = await Location.getForegroundPermissionsAsync();
      setCanAskAgain(cAsk);
      if (status === "granted") {
        start();
      } else {
        setPerm(status === "denied" ? "denied" : "undetermined");
      }
    })();
    return () => {
      headingSub.current?.remove();
    };
  }, [start]);

  const qiblaRelative = qibla != null ? (qibla - heading + 360) % 360 : 0;
  const aligned = qibla != null && (qiblaRelative < 6 || qiblaRelative > 354);

  useEffect(() => {
    if (aligned && !wasAligned.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      wasAligned.current = true;
    } else if (!aligned) {
      wasAligned.current = false;
    }
  }, [aligned]);

  const cardinals = [
    { label: "N", angle: 0 },
    { label: "E", angle: 90 },
    { label: "S", angle: 180 },
    { label: "W", angle: 270 },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Qibla</Text>
        <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>
          Face the Kaaba direction using your compass
        </Text>
      </View>

      <View style={styles.body}>
        {perm !== "granted" ? (
          <View style={styles.permWrap}>
            <View style={[styles.permIcon, { backgroundColor: colors.brandTertiary }]}>
              <MaterialCommunityIcons name="compass-outline" size={44} color={colors.brand} />
            </View>
            <Text style={[styles.permTitle, { color: colors.onSurface }]}>Find the Qibla</Text>
            <Text style={[styles.permSub, { color: colors.onSurfaceTertiary }]}>
              We use your location to calculate the exact direction to the Kaaba, and your compass to guide you.
            </Text>
            {perm === "denied" && !canAskAgain ? (
              <Pressable testID="qibla-open-settings" onPress={() => Linking.openSettings()} style={[styles.permBtn, { backgroundColor: colors.brand }]}>
                <Text style={[styles.permBtnText, { color: colors.onBrandPrimary }]}>Open Settings</Text>
              </Pressable>
            ) : (
              <Pressable testID="qibla-enable-btn" onPress={start} style={[styles.permBtn, { backgroundColor: colors.brand }]}>
                <Text style={[styles.permBtnText, { color: colors.onBrandPrimary }]}>Enable Location</Text>
              </Pressable>
            )}
            {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
          </View>
        ) : (
          <>
            <View
              testID="qibla-status"
              style={[
                styles.statusPill,
                { backgroundColor: aligned ? colors.success : colors.surfaceTertiary },
              ]}
            >
              <Ionicons name={aligned ? "checkmark-circle" : "navigate"} size={16} color={aligned ? "#fff" : colors.onSurfaceTertiary} />
              <Text style={[styles.statusText, { color: aligned ? "#fff" : colors.onSurfaceTertiary }]}>
                {aligned ? "Facing the Qibla" : "Turn to align with the Qibla"}
              </Text>
            </View>

            {/* Compass */}
            <View style={[styles.compass, { borderColor: aligned ? colors.success : colors.borderStrong, backgroundColor: colors.surface }]}>
              {/* fixed top indicator (device facing) */}
              <View style={[styles.topPointer, { borderBottomColor: aligned ? colors.success : colors.brand }]} />

              {/* rotating dial with cardinals */}
              <View style={[styles.fill, { transform: [{ rotate: `${-heading}deg` }] }]}>
                {cardinals.map((c) => (
                  <View
                    key={c.label}
                    style={[styles.cardinalWrap, { transform: [{ rotate: `${c.angle}deg` }] }]}
                  >
                    <Text
                      style={[
                        styles.cardinal,
                        { color: c.label === "N" ? colors.error : colors.onSurfaceTertiary },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </View>
                ))}
                {Array.from({ length: 24 }).map((_, i) => (
                  <View key={i} style={[styles.tickWrap, { transform: [{ rotate: `${i * 15}deg` }] }]}>
                    <View style={[styles.tick, { backgroundColor: colors.border, height: i % 6 === 0 ? 14 : 8 }]} />
                  </View>
                ))}
              </View>

              {/* Kaaba marker at the qibla bearing relative to device */}
              <View style={[styles.fill, { transform: [{ rotate: `${qiblaRelative}deg` }] }]} pointerEvents="none">
                <View style={styles.kaabaWrap}>
                  <View style={[styles.kaabaBadge, { backgroundColor: aligned ? colors.success : colors.brand }]}>
                    <MaterialCommunityIcons name="kaaba" size={22} color="#fff" />
                  </View>
                </View>
              </View>

              {/* center readout */}
              <View style={styles.center}>
                <Text style={[styles.centerDeg, { color: colors.onSurface }]} testID="qibla-degrees">
                  {qibla != null ? `${Math.round(qibla)}°` : "--"}
                </Text>
                <Text style={[styles.centerLabel, { color: colors.onSurfaceTertiary }]}>to Qibla</Text>
              </View>
            </View>

            <View style={styles.readRow}>
              <View style={styles.readItem}>
                <Text style={[styles.readValue, { color: colors.onSurface }]}>{Math.round(heading)}°</Text>
                <Text style={[styles.readLabel, { color: colors.onSurfaceTertiary }]}>Heading</Text>
              </View>
              <View style={[styles.readDivider, { backgroundColor: colors.border }]} />
              <View style={styles.readItem}>
                <Text style={[styles.readValue, { color: colors.onSurface }]}>
                  {distance != null ? `${distance.toLocaleString()} km` : "--"}
                </Text>
                <Text style={[styles.readLabel, { color: colors.onSurfaceTertiary }]}>to Mecca</Text>
              </View>
            </View>

            {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: FONTS.bold, fontSize: 26 },
  subtitle: { fontFamily: FONTS.regular, fontSize: 13, marginTop: 2 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  permWrap: { alignItems: "center" },
  permIcon: { width: 96, height: 96, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", marginBottom: SPACING.lg },
  permTitle: { fontFamily: FONTS.bold, fontSize: 20 },
  permSub: { fontFamily: FONTS.regular, fontSize: 14, textAlign: "center", marginTop: SPACING.sm, lineHeight: 20 },
  permBtn: { marginTop: SPACING.xl, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.md, borderRadius: RADIUS.pill },
  permBtnText: { fontFamily: FONTS.bold, fontSize: 15 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
    marginBottom: SPACING.xl,
  },
  statusText: { fontFamily: FONTS.semibold, fontSize: 14 },
  compass: {
    width: COMPASS,
    height: COMPASS,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  fill: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  topPointer: {
    position: "absolute",
    top: -2,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 16,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 5,
  },
  cardinalWrap: { position: "absolute", width: COMPASS, height: COMPASS, alignItems: "center" },
  cardinal: { fontFamily: FONTS.bold, fontSize: 16, marginTop: 12 },
  tickWrap: { position: "absolute", width: COMPASS, height: COMPASS, alignItems: "center" },
  tick: { width: 2, borderRadius: 1, marginTop: 6 },
  kaabaWrap: { position: "absolute", width: COMPASS, height: COMPASS, alignItems: "center" },
  kaabaBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  center: { alignItems: "center" },
  centerDeg: { fontFamily: FONTS.bold, fontSize: 40 },
  centerLabel: { fontFamily: FONTS.medium, fontSize: 13, marginTop: -2 },
  readRow: { flexDirection: "row", alignItems: "center", marginTop: SPACING.xxl },
  readItem: { alignItems: "center", paddingHorizontal: SPACING.xl },
  readValue: { fontFamily: FONTS.bold, fontSize: 20 },
  readLabel: { fontFamily: FONTS.medium, fontSize: 12, marginTop: 2 },
  readDivider: { width: StyleSheet.hairlineWidth, height: 36 },
  errorText: { fontFamily: FONTS.medium, fontSize: 13, textAlign: "center", marginTop: SPACING.lg },
});
