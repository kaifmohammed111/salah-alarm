import React, { useEffect, useRef } from "react";
import { AppState, BackHandler, StyleSheet, Text, View, Vibration } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAudioPlayer } from "expo-audio";

import { FONTS, SPACING } from "@/src/theme";
import SwipeToDismiss from "@/src/components/SwipeToDismiss";
import { clearAlarmNotifications } from "@/src/lib/alarm";

const HERO_BG = "#20403B";
const beepSource = require("../assets/sounds/beep.mp3");
const SOUND_SOURCES: Record<string, any> = {
  beep: require("../assets/sounds/beep.mp3"),
  short_adhan: require("../assets/sounds/iqamat.mp3"),
  full_adhan: require("../assets/sounds/azan.mp3"),
};

export default function AlarmRingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    label?: string;
    sound?: string;
    customUri?: string;
    pre?: string;
  }>();

  const label = (params.label as string) || "Prayer";
  const pre = parseInt((params.pre as string) || "0", 10);
  const player = useAudioPlayer(beepSource);
  const dismissedRef = useRef(false);

  const stopAll = () => {
    try {
      player.pause();
    } catch {}
    try {
      Vibration.cancel();
    } catch {}
  };

  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    stopAll();
    clearAlarmNotifications();
    router.replace("/");
  };

  // Start audio (once) + vibration on mount.
  useEffect(() => {
    try {
      const sound = (params.sound as string) || "beep";
      const src =
        sound === "custom" && params.customUri
          ? { uri: params.customUri as string }
          : SOUND_SOURCES[sound] || beepSource;
      player.replace(src);
      player.volume = 1;
      player.seekTo(0);
      player.play();
      Vibration.vibrate([0, 600, 400, 600, 400, 600], false);
    } catch {}
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any hardware button / screen-off (power, home) backgrounds the app → silence.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") stopAll();
    });
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      dismiss();
      return true;
    });
    return () => {
      sub.remove();
      back.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: HERO_BG }]}>
      <LinearGradient
        colors={["#2C5750", "#20403B", "#132925"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, { paddingTop: insets.top + SPACING.xxxl }]}>
        <View style={styles.iconWrap}>
          <Ionicons name="alarm" size={64} color="#FFFFFF" />
        </View>
        <Text style={styles.kicker}>{pre > 0 ? `In ${pre} minutes` : "It's time for"}</Text>
        <Text style={styles.prayer} testID="alarm-ring-label">
          {label}
        </Text>
        <Text style={styles.sub}>{pre > 0 ? `${label} prayer is approaching` : `${label} prayer`}</Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.xl }]}>
        <SwipeToDismiss label="Slide to dismiss" onDismiss={dismiss} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignItems: "center", paddingHorizontal: SPACING.xl },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xxl,
  },
  kicker: { fontFamily: FONTS.medium, fontSize: 16, color: "rgba(255,255,255,0.75)" },
  prayer: { fontFamily: FONTS.bold, fontSize: 52, color: "#FFFFFF", marginTop: SPACING.sm },
  sub: { fontFamily: FONTS.regular, fontSize: 15, color: "rgba(255,255,255,0.7)", marginTop: SPACING.sm },
  footer: { paddingHorizontal: SPACING.xl },
});
