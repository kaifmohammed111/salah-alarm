import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";

import { FONTS, RADIUS, SPACING } from "@/src/theme";
import { useApp } from "@/src/context/AppContext";
import { PRAYER_LABELS, PRE_ALARM_PRESETS, PrayerKey, SOUND_OPTIONS } from "@/src/lib/prayer";

export type AlarmSheetRef = { present: (key: PrayerKey) => void };

// Memoized so the app's 1-second ticking clock (which re-renders the sheet)
// never re-applies the `value` prop mid-drag — that was snapping the thumb back.
// It owns its drag state and only reports the final value on release.
type VolumeSliderProps = {
  initial: number;
  onCommit: (v: number) => void;
  minColor: string;
  maxColor: string;
  thumbColor: string;
  onSlideStart?: () => void;
  onSlideEnd?: () => void;
};

const VolumeSlider = React.memo(function VolumeSlider({
  initial,
  onCommit,
  minColor,
  maxColor,
  thumbColor,
  onSlideStart,
  onSlideEnd,
}: VolumeSliderProps) {
  const [v, setV] = useState(initial);
  const [text, setText] = useState(String(Math.round(initial * 100)));
  useEffect(() => {
    setV(initial);
    setText(String(Math.round(initial * 100)));
  }, [initial]);

  const commitFromText = (raw: string) => {
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    const clamped = isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
    const nv = clamped / 100;
    setV(nv);
    setText(String(clamped));
    onCommit(nv);
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
      <Slider
        testID="volume-slider"
        style={{ width: 170, height: 40 }}
        minimumValue={0}
        maximumValue={1}
        step={0.05}
        value={v}
        minimumTrackTintColor={minColor}
        maximumTrackTintColor={maxColor}
        thumbTintColor={thumbColor}
        onSlidingStart={() => onSlideStart?.()}
        onValueChange={(nv) => {
          setV(nv);
          setText(String(Math.round(nv * 100)));
        }}
        onSlidingComplete={(nv) => {
          setV(nv);
          setText(String(Math.round(nv * 100)));
          onCommit(nv);
          onSlideEnd?.();
        }}
      />
      <TextInput
        testID="volume-input"
        value={text}
        onChangeText={setText}
        onEndEditing={() => commitFromText(text)}
        onSubmitEditing={() => commitFromText(text)}
        keyboardType="number-pad"
        maxLength={3}
        style={{
          width: 44,
          textAlign: "center",
          fontSize: 13,
          fontFamily: "System",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: maxColor,
          borderRadius: 6,
          paddingVertical: 4,
          color: thumbColor,
        }}
      />
    </View>
  );
});

const beepSource = require("../../assets/sounds/beep.mp3");
const SOUND_SOURCES: Record<string, any> = {
  beep: require("../../assets/sounds/beep.mp3"),
  short_adhan: require("../../assets/sounds/iqamat.mp3"),
  full_adhan: require("../../assets/sounds/azan.mp3"),
};

// Defined at module level (not inside AlarmSettingsSheet) so its component
// identity stays stable across renders. Defining it inline inside the sheet
// caused React to fully unmount + remount every Row (and its children, like
// the volume slider) on every re-render — including the once-per-second
// re-renders triggered by AppContext's ticking clock — which reset the
// slider's drag position mid-interaction.
type RowProps = {
  colors: any;
  icon: string;
  label: string;
  right: React.ReactNode;
};
const Row = ({ colors, icon, label, right }: RowProps) => (
  <View style={[styles.row, { borderColor: colors.divider }]}>
    <View style={styles.rowLeft}>
      <Ionicons name={icon as any} size={20} color={colors.brand} />
      <Text style={[styles.rowLabel, { color: colors.onSurface }]}>{label}</Text>
    </View>
    {right}
  </View>
);

const AlarmSettingsSheet = forwardRef<AlarmSheetRef>((_props, ref) => {
  const { colors, configs, setConfig, settings } = useApp();
  const modalRef = useRef<BottomSheetModal>(null);
  const [key, setKey] = useState<PrayerKey>("fajr");
  const player = useAudioPlayer(beepSource);
  // Explicit preview flag so the button label doesn't flicker with raw playback status.
  const [previewing, setPreviewing] = useState(false);

  useImperativeHandle(ref, () => ({
    present: (k: PrayerKey) => {
      setKey(k);
      setPreviewing(false);
      modalRef.current?.present();
    },
  }));

  const cfg = configs[key];
  const snapPoints = useMemo(() => ["82%"], []);
  const status = useAudioPlayerStatus(player);

  // Stable commit callback (identity never changes) so the memoized VolumeSlider
  // is not re-created by the ticking-clock re-renders.
  const commitRef = useRef((_v: number) => {});
  commitRef.current = (v: number) => setConfig(key, { volume: v });
  const onVolCommit = useCallback((v: number) => commitRef.current(v), []);

  // Clear the "playing" flag when a short clip finishes on its own.
  useEffect(() => {
    if (status?.didJustFinish) setPreviewing(false);
  }, [status?.didJustFinish]);

  const stopPreview = useCallback(() => {
    setPreviewing(false);
    try {
      player.pause();
      player.seekTo(0);
    } catch {}
  }, [player]);

  const preview = useCallback(() => {
    try {
      let src: any;
      if (cfg?.sound === "custom" && cfg?.customUri) {
        src = { uri: cfg.customUri };
      } else {
        src = SOUND_SOURCES[cfg?.sound] || beepSource;
      }
      player.replace(src);
      player.volume = cfg?.volume ?? 0.8;
      player.seekTo(0);
      player.play();
      setPreviewing(true);
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

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={snapPoints}
      onDismiss={stopPreview}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      backgroundStyle={{ backgroundColor: colors.surface }}
      enableContentPanningGesture={false}
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
          colors={colors}
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
          <Pressable
            testID="preview-sound-btn"
            onPress={previewing ? stopPreview : preview}
            style={[
              styles.previewBtn,
              { borderColor: previewing ? colors.error : colors.brand },
            ]}
          >
            <Ionicons name={previewing ? "stop" : "play"} size={16} color={previewing ? colors.error : colors.brand} />
            <Text style={[styles.previewText, { color: previewing ? colors.error : colors.brand }]}>
              {previewing ? "Stop" : "Preview"}
            </Text>
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
              Plays on Preview here, and as your full alarm sound in the built app.
            </Text>
            <View style={[styles.warningBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.warning || "#D97706" }]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warning || "#D97706"} />
              <Text style={[styles.warningText, { color: colors.onSurfaceSecondary }]}>
                Custom sounds use your phone's media volume, not the notification volume. Built-in sounds
                (Beep, Short Adhan, Full Adhan) always follow your notification volume for more reliable alarms.
              </Text>
            </View>
          </View>
        ) : null}

        <Row
          colors={colors}
          icon="volume-high-outline"
          label="Volume"
          right={
            <VolumeSlider
              initial={cfg.volume}
              onCommit={onVolCommit}
              minColor={colors.brand}
              maxColor={colors.surfaceTertiary}
              thumbColor={colors.brand}
            />
          }
        />

        <Row
          colors={colors}
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
          colors={colors}
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

        <Text style={[styles.section, { color: colors.onSurfaceTertiary }]}>PRE-ALARM (RING EARLY)</Text>
        <Text style={[styles.preHint, { color: colors.muted }]}>
          {cfg.preAlarmMinutes > 0
            ? `Rings ${cfg.preAlarmMinutes} min before ${settings.preAlarmAnchor} time`
            : "Off — only rings at prayer time"}
        </Text>
        <View style={styles.preRow}>
          {PRE_ALARM_PRESETS.map((m) => {
            const selected = cfg.preAlarmMinutes === m;
            return (
              <Pressable
                key={m}
                testID={`prealarm-${m}`}
                onPress={() => setConfig(key, { preAlarmMinutes: m })}
                style={[
                  styles.preChip,
                  { backgroundColor: selected ? colors.brand : colors.surfaceSecondary },
                ]}
              >
                <Text style={[styles.preChipText, { color: selected ? "#fff" : colors.onSurfaceSecondary }]}>
                  {m === 0 ? "Off" : `${m} min`}
                </Text>
              </Pressable>
            );
          })}
          <TextInput
            testID="prealarm-custom"
            value={cfg.preAlarmMinutes && !PRE_ALARM_PRESETS.includes(cfg.preAlarmMinutes) ? String(cfg.preAlarmMinutes) : ""}
            onChangeText={(t) => {
              const n = parseInt(t.replace(/[^0-9]/g, ""), 10);
              setConfig(key, { preAlarmMinutes: isNaN(n) ? 0 : Math.min(n, 180) });
            }}
            placeholder="Custom"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={3}
            style={[
              styles.preInput,
              { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, borderColor: colors.border },
            ]}
          />
        </View>

        <Pressable
          testID="alarm-save-btn"
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            stopPreview();
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
  warningBox: {
    flexDirection: "row",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: SPACING.sm,
    alignItems: "flex-start",
  },
  warningText: { fontFamily: FONTS.regular, fontSize: 12, flex: 1, lineHeight: 17 },
  preHint: { fontFamily: FONTS.regular, fontSize: 12, marginBottom: SPACING.sm },
  preRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: SPACING.sm },
  preChip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
  },
  preChipText: { fontFamily: FONTS.semibold, fontSize: 13 },
  preInput: {
    minWidth: 84,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: FONTS.semibold,
    fontSize: 13,
    textAlign: "center",
  },
  saveBtn: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  saveText: { fontFamily: FONTS.bold, fontSize: 16 },
});
