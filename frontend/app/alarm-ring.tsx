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

// Ignore AppState transitions within this window after mount — waking from a
// locked/off screen via full-screen intent can briefly report "background" or
// "inactive" during the OS wake animation, which would otherwise instantly
// silence the alarm before the user ever hears it.
const APP_STATE_GRACE_MS = 2000;

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
  const mountedAtRef = useRef(Date.now());

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

  // Start audio (once) + vibration on mount. Built-in sounds (beep/short_adhan/
  // full_adhan) now play automatically via their native notification channel,
  // so JS playback here is only needed for custom user-uploaded sounds.
  useEffect(() => {
    mountedAtRef.current = Date.now();
    try {
      const sound = (params.sound as string) || "beep";
      if (sound === "custom" && params.customUri) {
        player.replace({ uri: params.customUri as string });
        player.volume = 1;
        player.seekTo(0);
        player.play();
        console.log("ALARM RING: audio play() called (custom)");
      } else {
        console.log("ALARM RING: skipping JS audio, native channel sound handles it", sound);
      }
      Vibration.vibrate([0, 600, 400, 600, 400, 600], false);
    } catch (e) {
      console.log("ALARM RING: audio setup failed", e);
    }
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any hardware button / screen-off (power, home) backgrounds the app → silence.
  // Ignore transitions that happen immediately after mount, since waking from a
  // locked screen can briefly report a non-"active" state during the OS's own
  // wake/composite animation, not a real user-initiated backgrounding.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const elapsed = Date.now() - mountedAtRef.current;
      if (elapsed < APP_STATE_GRACE_MS) {
        console.log("ALARM RING: ignoring early AppState change", state, elapsed);
        return;
      }
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
