import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useAudioPlayer } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";

import { FONTS, RADIUS, SPACING } from "@/src/theme";
import { useApp } from "@/src/context/AppContext";
import { PRAYER_LABELS, PrayerKey, SOUND_OPTIONS } from "@/src/lib/prayer";

export type AlarmSheetRef = { present: (key: PrayerKey) => void };

const beepSource = require("../../assets/sounds/beep.mp3");

const AlarmSettingsSheet = forwardRef<AlarmSheetRef>((_props, ref) => {
  const { colors, configs, setConfig } = useApp();
  const modalRef = useRef<BottomSheetModal>(null);
  const [key, setKey] = useState<PrayerKey>("fajr");
  const player = useAudioPlayer(beepSource);

  useImperativeHandle(ref, () => ({
    present: (k: PrayerKey) => {
      setKey(k);
      modalRef.current?.present();
    },
  }));

  const cfg = configs[key];
  const snapPoints = useMemo(() => ["82%"], []);

  const preview = useCallback(() => {
    try {
      const src =
        cfg?.sound === "custom" && cfg?.customUri ? { uri: cfg.customUri } : beepSource;
      player.replace(src as any);
      player.volume = cfg?.volume ?? 0.8;
      player.seekTo(0);
      player.play();
    } catch {}
  }, [player, cfg?.sound, cfg?.customUri, cfg?.volume]);

  const pickAudio = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setConfig(key, { sound: "custom", customUri: a.uri, customName: a.name });
    } catch {}
  }, [key, setConfig]);

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    [],
  );

  const Row = ({
    icon,
    label,
    right,
  }: {
    icon: string;
    label: string;
    right: React.ReactNode;
  }) => (
    <View style={[styles.row, { borderColor: colors.divider }]}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon as any} size={20} color={colors.brand} />
        <Text style={[styles.rowLabel, { color: colors.onSurface }]}>{label}</Text>
      </View>
      {right}
    </View>
  );

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      backgroundStyle={{ backgroundColor: colors.surface }}
      enablePanDownToClose
    >
      <BottomSheetScrollView
        style={{ backgroundColor: colors.surface }}
        contentContainerStyle={[styles.container, { backgroundColor: colors.surface }]}
      >
        <Text style={[styles.title, { color: colors.onSurface }]} testID="alarm-sheet-title">
          {PRAYER_LABELS[key]} Alarm
        </Text>

        <Row
          icon="alarm-outline"
          label="Enable alarm"
          right={
            <Switch
              testID="alarm-enable-switch"
              value={cfg.enabled}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                setConfig(key, { enabled: v });
              }}
              trackColor={{ true: colors.brand }}
            />
          }
        />

        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>SOUND</Text>
        <View style={styles.soundList}>
          {SOUND_OPTIONS.map((s) => {
            const selected = cfg.sound === s.id;
            return (
              <Pressable
                key={s.id}
                testID={`sound-option-${s.id}`}
                disabled={s.disabled}
                onPress={() => setConfig(key, { sound: s.id })}
                style={[
                  styles.soundItem,
                  {
                    backgroundColor: selected ? colors.brandTertiary : colors.surfaceSecondary,
                    opacity: s.disabled ? 0.5 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={selected ? colors.brand : colors.muted}
                />
                <Text
                  style={[
                    styles.soundLabel,
                    { color: selected ? colors.onBrandTertiary : colors.onSurfaceSecondary },
                  ]}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable testID="preview-sound-btn" onPress={preview} style={[styles.previewBtn, { borderColor: colors.brand }]}>
            <Ionicons name="play" size={16} color={colors.brand} />
            <Text style={[styles.previewText, { color: colors.brand }]}>Preview</Text>
          </Pressable>
        </View>

        {cfg.sound === "custom" ? (
          <View style={styles.customWrap}>
            <Pressable
              testID="upload-mp3-btn"
              onPress={pickAudio}
              style={[styles.uploadBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.brand }]}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={colors.brand} />
              <Text style={[styles.uploadText, { color: colors.brand }]} numberOfLines={1}>
                {cfg.customName ? cfg.customName : "Upload your MP3 file"}
              </Text>
            </Pressable>
            <Text style={[styles.customHint, { color: colors.muted }]}>
              Plays on Preview & alarm. Custom alarm-tone playback requires a device build.
            </Text>
          </View>
        ) : null}

        <Row
          icon="volume-high-outline"
          label="Volume"
          right={
            <Slider
              testID="volume-slider"
              style={{ width: 140 }}
              minimumValue={0}
              maximumValue={1}
              value={cfg.volume}
              minimumTrackTintColor={colors.brand}
              maximumTrackTintColor={colors.surfaceTertiary}
              thumbTintColor={colors.brand}
              onSlidingComplete={(v) => setConfig(key, { volume: v })}
            />
          }
        />

        <Row
          icon="phone-portrait-outline"
          label="Vibration"
          right={
            <Switch
              testID="vibration-switch"
              value={cfg.vibration}
              onValueChange={(v) => setConfig(key, { vibration: v })}
              trackColor={{ true: colors.brand }}
            />
          }
        />

        <Row
          icon="time-outline"
          label="Snooze"
          right={
            <Switch
              testID="snooze-switch"
              value={cfg.snooze}
              onValueChange={(v) => setConfig(key, { snooze: v })}
              trackColor={{ true: colors.brand }}
            />
          }
        />

        <Row
          icon="notifications-outline"
          label="Remind 30 min before"
          right={
            <Switch
              testID="prealarm-switch"
              value={cfg.preAlarm}
              onValueChange={(v) => setConfig(key, { preAlarm: v })}
              trackColor={{ true: colors.brand }}
            />
          }
        />

        <Pressable
          testID="alarm-save-btn"
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            modalRef.current?.dismiss();
          }}
          style={[styles.saveBtn, { backgroundColor: colors.brand }]}
        >
          <Text style={[styles.saveText, { color: colors.onBrandPrimary }]}>Save</Text>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

AlarmSettingsSheet.displayName = "AlarmSettingsSheet";
export default AlarmSettingsSheet;

const styles = StyleSheet.create({
  container: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl },
  title: { fontFamily: FONTS.bold, fontSize: 22, marginBottom: SPACING.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  rowLabel: { fontFamily: FONTS.medium, fontSize: 15 },
  section: { fontFamily: FONTS.semibold, fontSize: 12, marginTop: SPACING.lg, marginBottom: SPACING.sm, letterSpacing: 1 },
  soundList: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  soundItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
  },
  soundLabel: { fontFamily: FONTS.medium, fontSize: 13 },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  previewText: { fontFamily: FONTS.semibold, fontSize: 13 },
  customWrap: { marginTop: SPACING.md },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  uploadText: { fontFamily: FONTS.semibold, fontSize: 14, flex: 1 },
  customHint: { fontFamily: FONTS.regular, fontSize: 11, marginTop: SPACING.sm },
  saveBtn: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  saveText: { fontFamily: FONTS.bold, fontSize: 16 },
});
