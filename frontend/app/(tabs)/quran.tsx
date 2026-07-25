import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Slider from "@react-native-community/slider";

import { useApp } from "@/src/context/AppContext";
import { FONTS, RADIUS, SPACING, ThemeColors } from "@/src/theme";
import IslamicPattern from "@/src/components/IslamicPattern";
import { startMediaSession, stopMediaSession, subscribeMediaSessionEvents, updateMediaSessionState } from "@/src/lib/quranMediaSession";
import {
  Ayah,
  AudioEdition,
  DownloadControl,
  DownloadFailure,
  DownloadProgressInfo,
  SurahMeta,
  createDownloadControl,
  deleteDownloadedQuranAudio,
  deleteSingleSurahAudio,
  downloadQuranAudio,
  estimateDownloadSizeBytes,
  fetchAudioEditions,
  fetchJuzBilingual,
  fetchSurahBilingual,
  fetchSurahList,
  formatBytes,
  getDownloadedEditions,
  getDownloadedSurahSet,
  hasInternetConnection,
  isOnWifi,
  isSurahDownloaded,
  localSurahAudioPath,
  markEditionDownloaded,
  mp3QuranSurahUrl,
  unmarkEditionDownloaded,
} from "@/src/lib/quran";

type Mode = "read" | "listen";
type BrowseBy = "surah" | "juz";
type Insets = ReturnType<typeof useSafeAreaInsets>;

export default function QuranScreen() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("read");

  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Quran</Text>
        <View style={[styles.modeSwitch, { backgroundColor: colors.surfaceSecondary }]}>
          <Pressable
            testID="quran-mode-read"
            onPress={() => setMode("read")}
            style={[styles.modeBtn, mode === "read" && { backgroundColor: colors.brand }]}
          >
            <Ionicons name="book-outline" size={16} color={mode === "read" ? "#fff" : colors.onSurfaceSecondary} />
            <Text style={[styles.modeBtnText, { color: mode === "read" ? "#fff" : colors.onSurfaceSecondary }]}>Read</Text>
          </Pressable>
          <Pressable
            testID="quran-mode-listen"
            onPress={() => setMode("listen")}
            style={[styles.modeBtn, mode === "listen" && { backgroundColor: colors.brand }]}
          >
            <Ionicons name="headset-outline" size={16} color={mode === "listen" ? "#fff" : colors.onSurfaceSecondary} />
            <Text style={[styles.modeBtnText, { color: mode === "listen" ? "#fff" : colors.onSurfaceSecondary }]}>Listen</Text>
          </Pressable>
        </View>
      </View>

      {mode === "read" ? <ReadTab colors={colors} insets={insets} /> : <ListenTab colors={colors} insets={insets} />}
    </View>
  );
}

function ReadTab({ colors, insets }: { colors: ThemeColors; insets: Insets }) {
  const [browseBy, setBrowseBy] = useState<BrowseBy>("surah");
  const [surahList, setSurahList] = useState<SurahMeta[] | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<{ type: BrowseBy; number: number } | null>(null);
  const [ayahs, setAyahs] = useState<{ arabic: Ayah[]; english: Ayah[] } | null>(null);
  const [loadingAyahs, setLoadingAyahs] = useState(false);
  const [ayahError, setAyahError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchSurahList();
        setSurahList(list);
      } catch {
        setListError("Could not load the Surah list. Check your connection and try again.");
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  const openSurah = async (n: number) => {
    setSelected({ type: "surah", number: n });
    setAyahs(null);
    setAyahError(null);
    setLoadingAyahs(true);
    try {
      const data = await fetchSurahBilingual(n);
      setAyahs(data);
    } catch {
      setAyahError("Could not load this Surah. Check your connection and try again.");
    } finally {
      setLoadingAyahs(false);
    }
  };

  const openJuz = async (n: number) => {
    setSelected({ type: "juz", number: n });
    setAyahs(null);
    setAyahError(null);
    setLoadingAyahs(true);
    try {
      const data = await fetchJuzBilingual(n);
      setAyahs(data);
    } catch {
      setAyahError("Could not load this Juz. Check your connection and try again.");
    } finally {
      setLoadingAyahs(false);
    }
  };

  if (selected) {
    return (
      <View style={{ flex: 1 }}>
        <Pressable
          testID="quran-read-back"
          onPress={() => setSelected(null)}
          style={[styles.backRow, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.brand} />
          <Text style={[styles.backText, { color: colors.brand }]}>
            {selected.type === "surah" ? "All Surahs" : "All Juz"}
          </Text>
        </Pressable>
        {loadingAyahs ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : ayahError ? (
          <View style={styles.centerFill}>
            <Text style={[styles.errorText, { color: colors.error }]}>{ayahError}</Text>
          </View>
        ) : ayahs ? (
          <ScrollView contentContainerStyle={{ padding: SPACING.xl, paddingBottom: insets.bottom + SPACING.xxxl }}>
            {ayahs.arabic.map((a, i) => {
              const en = ayahs.english[i];
              const showSurahHeader =
                selected.type === "juz" && (i === 0 || ayahs.arabic[i - 1].surah.number !== a.surah.number);
              return (
                <React.Fragment key={a.number}>
                  {showSurahHeader ? (
                    <Text style={[styles.juzSurahHeader, { color: colors.brand }]}>{a.surah.englishName}</Text>
                  ) : null}
                  <View style={[styles.ayahCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.ayahNumBadge, { backgroundColor: colors.brandTertiary }]}>
                      <Text style={[styles.ayahNumText, { color: colors.brand }]}>{a.numberInSurah}</Text>
                    </View>
                    <Text style={[styles.ayahArabic, { color: colors.onSurface }]}>{a.text}</Text>
                    <Text style={[styles.ayahEnglish, { color: colors.onSurfaceTertiary }]}>{en?.text}</Text>
                  </View>
                </React.Fragment>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.browseSwitchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary }]}>
          <Pressable
            testID="quran-browse-surah"
            onPress={() => setBrowseBy("surah")}
            style={[styles.segmentItem, browseBy === "surah" && { backgroundColor: colors.brand }]}
          >
            <Text style={[styles.segmentText, { color: browseBy === "surah" ? "#fff" : colors.onSurfaceSecondary }]}>
              By Surah
            </Text>
          </Pressable>
          <Pressable
            testID="quran-browse-juz"
            onPress={() => setBrowseBy("juz")}
            style={[styles.segmentItem, browseBy === "juz" && { backgroundColor: colors.brand }]}
          >
            <Text style={[styles.segmentText, { color: browseBy === "juz" ? "#fff" : colors.onSurfaceSecondary }]}>
              By Juz
            </Text>
          </Pressable>
        </View>
      </View>
      {loadingList ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : listError ? (
        <View style={styles.centerFill}>
          <Text style={[styles.errorText, { color: colors.error }]}>{listError}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + SPACING.xxxl }}>
          {browseBy === "surah"
            ? (surahList || []).map((s) => (
                <Pressable
                  key={s.number}
                  testID={`quran-surah-${s.number}`}
                  onPress={() => openSurah(s.number)}
                  style={[styles.listRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.listNumBadge, { backgroundColor: colors.brandTertiary }]}>
                    <Text style={[styles.listNumText, { color: colors.brand }]}>{s.number}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listTitle, { color: colors.onSurface }]}>{s.englishName}</Text>
                    <Text style={[styles.listSub, { color: colors.onSurfaceTertiary }]}>
                      {s.englishNameTranslation} · {s.numberOfAyahs} ayahs · {s.revelationType}
                    </Text>
                  </View>
                  <Text style={[styles.listArabicName, { color: colors.onSurfaceSecondary }]}>{s.name}</Text>
                </Pressable>
              ))
            : Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                <Pressable
                  key={j}
                  testID={`quran-juz-${j}`}
                  onPress={() => openJuz(j)}
                  style={[styles.listRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.listNumBadge, { backgroundColor: colors.brandTertiary }]}>
                    <Text style={[styles.listNumText, { color: colors.brand }]}>{j}</Text>
                  </View>
                  <Text style={[styles.listTitle, { color: colors.onSurface }]}>Juz {j}</Text>
                </Pressable>
              ))}
        </ScrollView>
      )}
    </View>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const BISMILLAH = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";

// A vinyl-record-style disc: dark gradient body, thin groove rings, and a
// circular paper "label" in the center carrying the Bismillah in Arabic —
// this mirrors how a real vinyl record's label actually looks (plain
// circle with centered text), rather than attempting to curve text around
// the disc's edge, which RN has no native support for and would require
// fragile hand-built character-by-character rotation.
function VinylDisc({ size }: { size: number }) {
  const grooveFractions = [0.94, 0.84, 0.74, 0.64];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}>
      <LinearGradient
        colors={["#1A1A1A", "#0A0A0A", "#000000"]}
        style={{ position: "absolute", width: size, height: size, borderRadius: size / 2 }}
      />
      {grooveFractions.map((f) => {
        const g = f * size;
        return (
          <View
            key={f}
            style={{
              position: "absolute",
              width: g,
              height: g,
              borderRadius: g / 2,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.07)",
            }}
          />
        );
      })}
      <View
        style={{
          width: size * 0.42,
          height: size * 0.42,
          borderRadius: (size * 0.42) / 2,
          backgroundColor: "#F5D98A",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: "#C9971F",
          paddingHorizontal: size * 0.03,
        }}
      >
        <Text
          style={{ fontSize: size * 0.075, color: "#0B1E1B", textAlign: "center" }}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {BISMILLAH}
        </Text>
      </View>
      <View
        style={{
          position: "absolute",
          width: size * 0.045,
          height: size * 0.045,
          borderRadius: (size * 0.045) / 2,
          backgroundColor: "#000",
        }}
      />
    </View>
  );
}

// Dedicated immersive "Now Playing" screen — deliberately uses its own
// fixed dark + gold Islamic-inspired palette regardless of the app's
// light/dark theme setting, similar precedent to how alarm-ring.tsx always
// uses its own fixed gradient rather than the app theme.
function NowPlayingScreen({
  selectedEdition,
  surahMeta,
  isPlaying,
  position,
  duration,
  onSeek,
  shuffle,
  repeat,
  onToggleShuffle,
  onToggleRepeat,
  onPrev,
  onNext,
  onTogglePlayPause,
  onBack,
}: {
  selectedEdition: AudioEdition;
  surahMeta: SurahMeta | undefined;
  isPlaying: boolean;
  position: number;
  duration: number;
  onSeek: (v: number) => void;
  shuffle: boolean;
  repeat: boolean;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlayPause: () => void;
  onBack: () => void;
}) {
  // Entrance: fade + slide up on mount.
  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });
  }, []);
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 24 }],
  }));

  // Album art: slow continuous rotation while playing, like a record —
  // stops smoothly wherever it is (via cancelAnimation) rather than
  // resetting, when paused.
  const artRotation = useSharedValue(0);
  useEffect(() => {
    if (isPlaying) {
      artRotation.value = withRepeat(
        withTiming(artRotation.value + 360, { duration: 20000, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(artRotation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);
  const artStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${artRotation.value}deg` }] }));

  // Spring-scale press feedback for the transport buttons.
  const playBtnScale = useSharedValue(1);
  const prevScale = useSharedValue(1);
  const nextScale = useSharedValue(1);
  const playBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: playBtnScale.value }] }));
  const prevStyle = useAnimatedStyle(() => ({ transform: [{ scale: prevScale.value }] }));
  const nextStyle = useAnimatedStyle(() => ({ transform: [{ scale: nextScale.value }] }));

  // Shuffle/repeat: animated highlight-pill fill on toggle, rather than an
  // instant color swap.
  const shuffleFill = useSharedValue(shuffle ? 1 : 0);
  const repeatFill = useSharedValue(repeat ? 1 : 0);
  useEffect(() => {
    shuffleFill.value = withTiming(shuffle ? 1 : 0, { duration: 220 });
  }, [shuffle, shuffleFill]);
  useEffect(() => {
    repeatFill.value = withTiming(repeat ? 1 : 0, { duration: 220 });
  }, [repeat, repeatFill]);
  const shuffleStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(232,184,75,${shuffleFill.value * 0.22})`,
  }));
  const repeatStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(232,184,75,${repeatFill.value * 0.22})`,
  }));

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={["#0A2E29", "#0B1E1B", "#050D0B"]} style={StyleSheet.absoluteFill} />
      <IslamicPattern width={SCREEN_W} height={SCREEN_H} color="#E8B84B" opacity={0.045} />

      <Pressable testID="quran-player-back" onPress={onBack} style={playerStyles.backRow}>
        <Ionicons name="chevron-down" size={24} color="rgba(255,255,255,0.85)" />
        <Text style={playerStyles.backText} numberOfLines={1}>
          {selectedEdition.englishName}
        </Text>
      </Pressable>

      <Animated.View style={[playerStyles.body, entranceStyle]}>
        <View style={playerStyles.artWrap}>
          <View style={playerStyles.artGlowOuter} />
          <View style={playerStyles.artGlowInner} />
          <Animated.View style={artStyle}>
            <VinylDisc size={168} />
          </Animated.View>
        </View>

        <Text style={playerStyles.arabic}>{surahMeta?.name}</Text>
        <Text style={playerStyles.title}>{surahMeta?.englishName}</Text>
        <Text style={playerStyles.sub}>{selectedEdition.englishName}</Text>

        <Slider
          style={playerStyles.slider}
          minimumValue={0}
          maximumValue={duration || 0}
          value={position || 0}
          minimumTrackTintColor="#E8B84B"
          maximumTrackTintColor="rgba(255,255,255,0.2)"
          thumbTintColor="#E8B84B"
          onSlidingComplete={(v: number) => onSeek(v)}
        />
        <View style={playerStyles.timeRow}>
          <Text style={playerStyles.timeText}>{formatTime(position || 0)}</Text>
          <Text style={playerStyles.timeText}>{formatTime(duration || 0)}</Text>
        </View>

        <View style={playerStyles.controls}>
          <Animated.View style={[playerStyles.togglePill, shuffleStyle]}>
            <Pressable testID="quran-shuffle-btn" onPress={onToggleShuffle} style={playerStyles.sideBtn}>
              <Ionicons name="shuffle" size={20} color={shuffle ? "#E8B84B" : "rgba(255,255,255,0.5)"} />
            </Pressable>
          </Animated.View>

          <Pressable
            testID="quran-prev-btn"
            onPressIn={() => (prevScale.value = withSpring(0.85))}
            onPressOut={() => (prevScale.value = withSpring(1))}
            onPress={onPrev}
          >
            <Animated.View style={[playerStyles.secondaryBtn, prevStyle]}>
              <Ionicons name="play-skip-back" size={26} color="#fff" />
            </Animated.View>
          </Pressable>

          <Pressable
            testID="quran-play-pause-btn"
            onPressIn={() => (playBtnScale.value = withSpring(0.9))}
            onPressOut={() => (playBtnScale.value = withSpring(1))}
            onPress={onTogglePlayPause}
          >
            <Animated.View style={[playerStyles.mainBtnWrap, playBtnStyle]}>
              <LinearGradient colors={["#F5D98A", "#C9971F"]} style={playerStyles.mainBtn}>
                <Ionicons name={isPlaying ? "pause" : "play"} size={32} color="#0B1E1B" />
              </LinearGradient>
            </Animated.View>
          </Pressable>

          <Pressable
            testID="quran-next-btn"
            onPressIn={() => (nextScale.value = withSpring(0.85))}
            onPressOut={() => (nextScale.value = withSpring(1))}
            onPress={onNext}
          >
            <Animated.View style={[playerStyles.secondaryBtn, nextStyle]}>
              <Ionicons name="play-skip-forward" size={26} color="#fff" />
            </Animated.View>
          </Pressable>

          <Animated.View style={[playerStyles.togglePill, repeatStyle]}>
            <Pressable testID="quran-repeat-btn" onPress={onToggleRepeat} style={playerStyles.sideBtn}>
              <Ionicons name="repeat" size={20} color={repeat ? "#E8B84B" : "rgba(255,255,255,0.5)"} />
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

type ListenView = "reciters" | "surahs" | "player";

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function ListenTab({ colors, insets }: { colors: ThemeColors; insets: Insets }) {
  const [view, setView] = useState<ListenView>("reciters");
  const [editions, setEditions] = useState<AudioEdition[] | null>(null);
  const [loadingEditions, setLoadingEditions] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedEdition, setSelectedEdition] = useState<AudioEdition | null>(null);
  const [surahList, setSurahList] = useState<SurahMeta[] | null>(null);
  const [downloadedEditions, setDownloadedEditions] = useState<string[]>([]);
  const [downloadedSurahSet, setDownloadedSurahSet] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(114);
  const [downloadEta, setDownloadEta] = useState<number | null>(null);
  const [waitingForConnection, setWaitingForConnection] = useState(false);
  const downloadControlRef = useRef<DownloadControl | null>(null);
  const [downloadingSurah, setDownloadingSurah] = useState<number | null>(null);
  const [failures, setFailures] = useState<DownloadFailure[]>([]);
  const [showFailureDetails, setShowFailureDetails] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedSurahs, setSelectedSurahs] = useState<Set<number>>(new Set());
  const [reciterSearch, setReciterSearch] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{ surahNumbers: number[]; title: string; sizeLabel: string } | null>(
    null,
  );
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [currentSurah, setCurrentSurah] = useState<number | null>(null);

  // Actual audio playback stays on expo-audio (already used elsewhere in
  // this app, e.g. alarm-ring.tsx, and proven to work fine for playback
  // itself). The custom native MediaSessionModule (see
  // src/lib/quranMediaSession.ts) is a SEPARATE piece that only owns the
  // system notification / lock-screen controls and forwards button
  // presses back here as events — it doesn't do any playback itself. This
  // two-piece split exists specifically because react-native-track-player
  // (which bundles both concerns into one library) turned out to be
  // incompatible with this project's New Architecture setup.
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const isPlaying = !!status?.playing;

  useEffect(() => {
    (async () => {
      try {
        const [eds, surahs, downloaded] = await Promise.all([
          fetchAudioEditions(),
          fetchSurahList(),
          getDownloadedEditions(),
        ]);
        setEditions(eds);
        setSurahList(surahs);
        setDownloadedEditions(downloaded);
      } catch {
        setListError("Could not load reciters. Check your connection and try again.");
      } finally {
        setLoadingEditions(false);
      }
    })();
  }, []);

  const playSurah = async (surahNumber: number) => {
    if (!selectedEdition) return;
    try {
      const downloaded = await isSurahDownloaded(selectedEdition.identifier, surahNumber);
      const uri = downloaded
        ? localSurahAudioPath(selectedEdition.identifier, surahNumber)
        : mp3QuranSurahUrl(selectedEdition.server, surahNumber);
      player.replace({ uri });
      player.play();
      setCurrentSurah(surahNumber);
      const meta = (surahList || []).find((s) => s.number === surahNumber);
      startMediaSession(meta?.englishName || `Surah ${surahNumber}`, selectedEdition.englishName, true, 0, 0);
    } catch (e) {
      console.warn("Quran playSurah failed", e);
    }
  };

  const openPlayer = (surahNumber: number) => {
    playSurah(surahNumber);
    setView("player");
  };

  const handleNext = () => {
    if (!currentSurah) return;
    let next: number;
    if (shuffle) {
      // Avoid immediately repeating the same Surah when picking randomly.
      do {
        next = Math.floor(Math.random() * 114) + 1;
      } while (next === currentSurah);
    } else {
      next = currentSurah >= 114 ? 1 : currentSurah + 1;
    }
    playSurah(next);
  };

  const handlePrev = () => {
    if (!currentSurah) return;
    // Previous always steps back sequentially, regardless of shuffle —
    // shuffle affects what comes next/on-finish, not a "history" stack.
    const prev = currentSurah <= 1 ? 114 : currentSurah - 1;
    playSurah(prev);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handleToggleShuffle = () => {
    setShuffle((v) => !v);
  };

  const handleToggleRepeat = () => {
    setRepeat((v) => !v);
  };

  // Auto-advance to the next Surah when the current one finishes, unless
  // Repeat is on, in which case the same Surah restarts from the
  // beginning instead.
  useEffect(() => {
    if (!status?.didJustFinish) return;
    if (repeat) {
      player.seekTo(0);
      player.play();
    } else {
      handleNext();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.didJustFinish]);

  // Keep the system notification / lock-screen media session in sync with
  // actual playback state — position ticks a few times a second via
  // useAudioPlayerStatus, each tick refreshes the notification's
  // scrubber/play-pause state.
  useEffect(() => {
    if (!currentSurah) return;
    updateMediaSessionState(isPlaying, (status?.currentTime || 0) * 1000, (status?.duration || 0) * 1000);
  }, [currentSurah, isPlaying, status?.currentTime, status?.duration]);

  // Subscribe once to remote-control events (notification taps, lock
  // screen, Bluetooth/headset buttons) and forward them to the real
  // expo-audio player / existing next-prev logic.
  useEffect(() => {
    const unsubscribe = subscribeMediaSessionEvents({
      onPlay: () => player.play(),
      onPause: () => player.pause(),
      onNext: () => handleNext(),
      onPrevious: () => handlePrev(),
      onSeekTo: (positionSeconds) => player.seekTo(positionSeconds),
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pausePlayback = () => {
    try {
      player.pause();
    } catch {}
  };

  const refreshDownloadedSurahs = async () => {
    if (!selectedEdition) return;
    const set = await getDownloadedSurahSet(selectedEdition.identifier);
    setDownloadedSurahSet(set);
  };

  // Load which individual Surahs are already downloaded whenever the
  // Surahs screen for a reciter is opened.
  useEffect(() => {
    if (view === "surahs" && selectedEdition) {
      refreshDownloadedSurahs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedEdition]);

  const confirmOnline = async (): Promise<boolean> => {
    const online = await hasInternetConnection();
    if (!online) {
      Alert.alert("No internet connection", "Please connect to the internet and try again.");
    }
    return online;
  };

  // Single entry point for every download trigger (per-row button,
  // "Download All", and "Download Selected") — shows the confirmation
  // dialog with a title, an estimated size (fetched async, starts as
  // "Calculating…"), and the two network-choice buttons.
  const requestDownloadConfirm = async (surahNumbers: number[], singleName: string | null) => {
    if (!selectedEdition) return;
    const title =
      singleName != null
        ? `Download "${singleName}"`
        : surahNumbers.length === 114
          ? "Download All 114 Surahs"
          : `Download ${surahNumbers.length} Surahs`;
    setConfirmDialog({ surahNumbers, title, sizeLabel: "Calculating size…" });
    const estBytes = await estimateDownloadSizeBytes(selectedEdition.server, surahNumbers);
    setConfirmDialog((prev) =>
      prev && prev.surahNumbers === surahNumbers
        ? { ...prev, sizeLabel: estBytes != null ? `Approx. ${formatBytes(estBytes)}` : "Size unavailable" }
        : prev,
    );
  };

  const proceedDownload = async (wifiOnly: boolean) => {
    if (!confirmDialog || !selectedEdition) return;
    const surahNumbers = confirmDialog.surahNumbers;
    setConfirmDialog(null);

    if (wifiOnly) {
      const onWifi = await isOnWifi();
      if (!onWifi) {
        Alert.alert(
          "Wi-Fi not connected",
          "You're not connected to Wi-Fi right now. Connect to Wi-Fi, then tap Download again to continue.",
        );
        return;
      }
    } else {
      if (!(await confirmOnline())) return;
    }

    const isSingle = surahNumbers.length === 1;
    const control = createDownloadControl();
    downloadControlRef.current = control;
    if (isSingle) {
      setDownloadingSurah(surahNumbers[0]);
    } else {
      setDownloading(true);
      setDownloadDone(0);
      setDownloadTotal(surahNumbers.length);
      setDownloadEta(null);
      setWaitingForConnection(false);
    }
    setFailures([]);
    try {
      const { failures: fails, cancelled } = await downloadQuranAudio(
        selectedEdition,
        surahNumbers,
        (info: DownloadProgressInfo) => {
          if (!isSingle) {
            setDownloadDone(info.done);
            setDownloadEta(info.etaSeconds);
            setWaitingForConnection(info.waitingForConnection);
          }
        },
        control,
      );
      if (!cancelled) {
        setFailures(fails);
        if (surahNumbers.length === 114) {
          const updated = await markEditionDownloaded(selectedEdition.identifier);
          setDownloadedEditions(updated);
        }
        setSelectMode(false);
        setSelectedSurahs(new Set());
      }
      // Refresh regardless of cancellation — whatever completed before
      // cancelling should still show as downloaded.
      await refreshDownloadedSurahs();
    } catch (e) {
      console.warn("Quran download failed", e);
      Alert.alert("Download failed", "Check your connection and try again.");
    } finally {
      downloadControlRef.current = null;
      setWaitingForConnection(false);
      setDownloadingSurah(null);
      setDownloading(false);
    }
  };

  const cancelCurrentDownload = () => {
    if (downloadControlRef.current) {
      downloadControlRef.current.cancelled = true;
    }
  };

  const removeDownload = async () => {
    if (!selectedEdition) return;
    await deleteDownloadedQuranAudio(selectedEdition.identifier);
    const updated = await unmarkEditionDownloaded(selectedEdition.identifier);
    setDownloadedEditions(updated);
    setDownloadedSurahSet(new Set());
  };

  const removeSingleSurah = async (surahNumber: number) => {
    if (!selectedEdition) return;
    await deleteSingleSurahAudio(selectedEdition.identifier, surahNumber);
    await refreshDownloadedSurahs();
  };

  const toggleSurahSelected = (surahNumber: number) => {
    setSelectedSurahs((prev) => {
      const next = new Set(prev);
      if (next.has(surahNumber)) next.delete(surahNumber);
      else next.add(surahNumber);
      return next;
    });
  };

  // Full-screen "Now Playing" audio player.
  if (view === "player" && selectedEdition && currentSurah) {
    const surahMeta = (surahList || []).find((s) => s.number === currentSurah);
    return (
      <NowPlayingScreen
        selectedEdition={selectedEdition}
        surahMeta={surahMeta}
        isPlaying={isPlaying}
        position={status?.currentTime || 0}
        duration={status?.duration || 0}
        onSeek={(v) => player.seekTo(v)}
        shuffle={shuffle}
        repeat={repeat}
        onToggleShuffle={handleToggleShuffle}
        onToggleRepeat={handleToggleRepeat}
        onPrev={handlePrev}
        onNext={handleNext}
        onTogglePlayPause={togglePlayPause}
        onBack={() => setView("surahs")}
      />
    );
  }

  if (view === "surahs" && selectedEdition) {
    const isDownloaded = downloadedEditions.includes(selectedEdition.identifier);
    return (
      <View style={{ flex: 1 }}>
        <Pressable
          testID="quran-listen-back"
          onPress={() => {
            setView("reciters");
            setSelectedEdition(null);
            // Deliberately NOT pausing playback here — the whole point of
            // this feature is that listening continues in the background
            // while browsing elsewhere in the app (or another app
            // entirely), so navigating back to the reciter list shouldn't
            // stop it either. Picking a different reciter's Surah later
            // will naturally replace the current playback via playSurah.
          }}
          style={[styles.backRow, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.brand} />
          <Text style={[styles.backText, { color: colors.brand }]}>All Reciters</Text>
        </Pressable>

        <View style={[styles.downloadBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.listTitle, { color: colors.onSurface }]}>{selectedEdition.englishName}</Text>
            {downloading ? (
              <Text style={[styles.listSub, { color: waitingForConnection ? colors.error : colors.onSurfaceTertiary }]}>
                {waitingForConnection
                  ? "No connection — will resume automatically once reconnected"
                  : `Downloading… ${downloadDone}/${downloadTotal} · ${Math.round((downloadDone / Math.max(1, downloadTotal)) * 100)}%${
                      downloadEta != null ? ` · Est. ${formatEta(downloadEta)} remaining` : " · Estimating time…"
                    }`}
              </Text>
            ) : isDownloaded ? (
              <Text style={[styles.listSub, { color: colors.success }]}>Downloaded for offline listening</Text>
            ) : (
              <Text style={[styles.listSub, { color: colors.onSurfaceTertiary }]}>Streams online — download for offline</Text>
            )}
          </View>
          {!downloading ? (
            <Pressable
              testID="quran-select-mode-toggle"
              onPress={() => {
                setSelectMode((v) => !v);
                setSelectedSurahs(new Set());
              }}
              style={styles.selectModeBtn}
            >
              <Ionicons name={selectMode ? "close" : "checkbox-outline"} size={20} color={colors.brand} />
            </Pressable>
          ) : null}
          {downloading ? (
            <Pressable testID="quran-cancel-download" onPress={cancelCurrentDownload} style={styles.downloadIconBtn}>
              <Ionicons name="close-circle-outline" size={22} color={colors.error} />
            </Pressable>
          ) : isDownloaded ? (
            <Pressable testID="quran-remove-download" onPress={removeDownload} style={styles.downloadIconBtn}>
              <Ionicons name="trash-outline" size={20} color={colors.muted} />
            </Pressable>
          ) : (
            <Pressable
              testID="quran-start-download"
              onPress={() => requestDownloadConfirm(Array.from({ length: 114 }, (_, i) => i + 1), null)}
              style={[styles.downloadBtn, { backgroundColor: colors.brand }]}
            >
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={styles.downloadBtnText}>Download All</Text>
            </Pressable>
          )}
        </View>

        {downloading && !waitingForConnection ? (
          <View style={[styles.downloadProgressWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={[styles.downloadProgressTrack, { backgroundColor: colors.surfaceTertiary }]}>
              <View
                style={[
                  styles.downloadProgressFill,
                  {
                    width: `${Math.min(100, Math.round((downloadDone / Math.max(1, downloadTotal)) * 100))}%`,
                    backgroundColor: colors.brand,
                  },
                ]}
              />
            </View>
          </View>
        ) : null}

        {failures.length > 0 ? (
          <View style={[styles.warningBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={[styles.warningText, { color: colors.error }]}>
              {failures.length} Surah{failures.length > 1 ? "s" : ""} couldn't be downloaded (will stream instead)
            </Text>
            <Pressable testID="quran-view-failures" onPress={() => setShowFailureDetails(true)}>
              <Text style={[styles.warningDetailsLink, { color: colors.brand }]}>Details</Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + (selectMode && selectedSurahs.size > 0 ? 90 : SPACING.xxxl) }}>
          {(surahList || []).map((s) => {
            const isCurrent = currentSurah === s.number;
            const isRowDownloaded = downloadedSurahSet.has(s.number);
            const isRowDownloading = downloadingSurah === s.number;
            const isSelected = selectedSurahs.has(s.number);
            return (
              <Pressable
                key={s.number}
                testID={`quran-play-${s.number}`}
                onPress={() => (selectMode ? toggleSurahSelected(s.number) : openPlayer(s.number))}
                style={[styles.listRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                {selectMode ? (
                  <Ionicons
                    name={isSelected ? "checkbox" : "square-outline"}
                    size={24}
                    color={isSelected ? colors.brand : colors.muted}
                  />
                ) : (
                  <View style={[styles.listNumBadge, { backgroundColor: isCurrent ? colors.brand : colors.brandTertiary }]}>
                    {isCurrent ? (
                      <Ionicons name="volume-high" size={16} color="#fff" />
                    ) : (
                      <Text style={[styles.listNumText, { color: colors.brand }]}>{s.number}</Text>
                    )}
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listTitle, { color: colors.onSurface }]}>{s.englishName}</Text>
                  <Text style={[styles.listSub, { color: colors.onSurfaceTertiary }]}>{s.numberOfAyahs} ayahs</Text>
                </View>
                {selectMode ? (
                  isRowDownloaded ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  ) : null
                ) : isRowDownloading ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : isRowDownloaded ? (
                  <Pressable
                    testID={`quran-remove-surah-${s.number}`}
                    onPress={() => removeSingleSurah(s.number)}
                    hitSlop={10}
                    style={styles.rowDownloadBtn}
                  >
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  </Pressable>
                ) : (
                  <Pressable
                    testID={`quran-download-surah-${s.number}`}
                    onPress={() => requestDownloadConfirm([s.number], s.englishName)}
                    hitSlop={10}
                    style={styles.rowDownloadBtn}
                  >
                    <Ionicons name="download-outline" size={20} color={colors.muted} />
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {selectMode && selectedSurahs.size > 0 ? (
          <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + SPACING.sm }]}>
            <Text style={[styles.selectionCount, { color: colors.onSurface }]}>{selectedSurahs.size} selected</Text>
            <Pressable
              testID="quran-download-selected"
              onPress={() => {
                const names = (surahList || []).find((s) => s.number === Array.from(selectedSurahs)[0])?.englishName;
                requestDownloadConfirm(Array.from(selectedSurahs), selectedSurahs.size === 1 ? names || null : null);
              }}
              style={[styles.selectionDownloadBtn, { backgroundColor: colors.brand }]}
            >
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={styles.downloadBtnText}>Download Selected</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Download confirmation dialog: title, estimated size, and the
            two network-choice options — a centered dialog rather than a
            bottom sheet, to read as a confirmation prompt. */}
        <Modal
          visible={!!confirmDialog}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmDialog(null)}
        >
          <Pressable style={styles.confirmBackdrop} onPress={() => setConfirmDialog(null)}>
            <View style={[styles.confirmSheet, { backgroundColor: colors.surface }]}>
              <Text style={[styles.confirmTitle, { color: colors.onSurface }]} numberOfLines={2}>
                {confirmDialog?.title}
              </Text>
              <Text style={[styles.confirmSize, { color: colors.onSurfaceTertiary }]}>{confirmDialog?.sizeLabel}</Text>

              <Pressable
                testID="quran-confirm-any-network"
                onPress={() => proceedDownload(false)}
                style={[styles.confirmBtn, { backgroundColor: colors.brand }]}
              >
                <Text style={styles.confirmBtnTitle}>Download now</Text>
                <Text style={styles.confirmBtnSub}>Uses any available connection — data charges may apply</Text>
              </Pressable>

              <Pressable
                testID="quran-confirm-wifi-only"
                onPress={() => proceedDownload(true)}
                style={[styles.confirmBtnSecondary, { borderColor: colors.border }]}
              >
                <Text style={[styles.confirmBtnTitleSecondary, { color: colors.onSurface }]}>Wi-Fi only</Text>
                <Text style={[styles.confirmBtnSub, { color: colors.onSurfaceTertiary }]}>
                  Only download while connected to Wi-Fi
                </Text>
              </Pressable>

              <Pressable testID="quran-confirm-cancel" onPress={() => setConfirmDialog(null)} style={styles.confirmCancelBtn}>
                <Text style={[styles.confirmCancelText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        <Modal
          visible={showFailureDetails}
          transparent
          animationType="slide"
          onRequestClose={() => setShowFailureDetails(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setShowFailureDetails(false)}>
            {/* Plain View, no responder-claiming — see the dhikr totals
                modal fix earlier in this project for why: claiming the
                touch responder here would block the ScrollView below from
                ever getting its own scroll gesture. */}
            <View style={[styles.modalSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + SPACING.lg }]}>
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Download issues</Text>
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {failures.map((f) => {
                  const meta = (surahList || []).find((s) => s.number === f.surah);
                  return (
                    <View key={f.surah} style={[styles.failureRow, { borderBottomColor: colors.divider }]}>
                      <Text style={[styles.failureTitle, { color: colors.onSurface }]}>
                        {meta?.englishName || `Surah ${f.surah}`}
                      </Text>
                      <Text style={[styles.failureReason, { color: colors.onSurfaceTertiary }]}>{f.reason}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {loadingEditions ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : listError ? (
        <View style={styles.centerFill}>
          <Text style={[styles.errorText, { color: colors.error }]}>{listError}</Text>
        </View>
      ) : (
        <>
          <View style={[styles.reciterSearchWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Ionicons name="search-outline" size={18} color={colors.muted} />
            <TextInput
              testID="quran-reciter-search"
              value={reciterSearch}
              onChangeText={setReciterSearch}
              placeholder="Search reciters…"
              placeholderTextColor={colors.muted}
              style={[styles.reciterSearchInput, { color: colors.onSurface }]}
            />
            {reciterSearch.length > 0 ? (
              <Pressable testID="quran-reciter-search-clear" onPress={() => setReciterSearch("")} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + SPACING.xxxl }}>
            {(editions || [])
              .filter((e) => e.englishName.toLowerCase().includes(reciterSearch.trim().toLowerCase()))
              .map((e) => (
                <Pressable
                  key={e.identifier}
                  testID={`quran-reciter-${e.identifier}`}
                  onPress={() => {
                    setSelectedEdition(e);
                    setView("surahs");
                  }}
                  style={[styles.listRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.listNumBadge, { backgroundColor: colors.brandTertiary }]}>
                    <Ionicons name="mic-outline" size={16} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listTitle, { color: colors.onSurface }]}>{e.englishName}</Text>
                  </View>
                  {downloadedEditions.includes(e.identifier) ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  )}
                </Pressable>
              ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: FONTS.bold, fontSize: 26, marginBottom: SPACING.md },
  modeSwitch: { flexDirection: "row", borderRadius: RADIUS.md, padding: 4 },
  reciterSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reciterSearchInput: { flex: 1, fontFamily: FONTS.regular, fontSize: 14, paddingVertical: SPACING.xs },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  modeBtnText: { fontFamily: FONTS.semibold, fontSize: 13 },
  browseSwitchWrap: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  segment: { flexDirection: "row", borderRadius: RADIUS.md, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, alignItems: "center" },
  segmentText: { fontFamily: FONTS.semibold, fontSize: 13 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  errorText: { fontFamily: FONTS.medium, fontSize: 14, textAlign: "center" },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backText: { fontFamily: FONTS.semibold, fontSize: 14 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.sm,
  },
  listNumBadge: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  listNumText: { fontFamily: FONTS.bold, fontSize: 13 },
  listTitle: { fontFamily: FONTS.semibold, fontSize: 15 },
  listSub: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 1 },
  listArabicName: { fontSize: 18, fontFamily: FONTS.medium },
  juzSurahHeader: { fontFamily: FONTS.bold, fontSize: 15, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  ayahCard: { borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.lg, marginBottom: SPACING.md },
  ayahNumBadge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: SPACING.sm },
  ayahNumText: { fontFamily: FONTS.bold, fontSize: 12 },
  ayahArabic: { fontSize: 24, lineHeight: 42, textAlign: "right" },
  ayahEnglish: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, marginTop: SPACING.md },
  downloadBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
  },
  downloadBtnText: { fontFamily: FONTS.bold, fontSize: 12, color: "#fff" },
  downloadIconBtn: { padding: SPACING.sm },
  rowDownloadBtn: { padding: SPACING.xs },
  warningDetailsLink: { fontFamily: FONTS.bold, fontSize: 12 },
  downloadProgressWrap: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  downloadProgressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  downloadProgressFill: { height: "100%", borderRadius: 3 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(120,120,120,0.4)",
    alignSelf: "center",
    marginBottom: SPACING.md,
  },
  modalTitle: { fontFamily: FONTS.bold, fontSize: 18, marginBottom: SPACING.md },
  failureRow: { paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  failureTitle: { fontFamily: FONTS.semibold, fontSize: 14 },
  failureReason: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2 },
  selectModeBtn: { padding: SPACING.sm, marginRight: SPACING.xs },
  selectionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selectionCount: { fontFamily: FONTS.semibold, fontSize: 14 },
  selectionDownloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  confirmSheet: {
    width: "100%",
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
  },
  confirmTitle: { fontFamily: FONTS.bold, fontSize: 18, textAlign: "center" },
  confirmSize: { fontFamily: FONTS.medium, fontSize: 13, textAlign: "center", marginTop: SPACING.xs, marginBottom: SPACING.xl },
  confirmBtn: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  confirmBtnTitle: { fontFamily: FONTS.bold, fontSize: 15, color: "#fff", textAlign: "center" },
  confirmBtnSub: { fontFamily: FONTS.regular, fontSize: 11, color: "rgba(255,255,255,0.85)", textAlign: "center", marginTop: 2 },
  confirmBtnSecondary: {
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  confirmBtnTitleSecondary: { fontFamily: FONTS.bold, fontSize: 15, textAlign: "center" },
  confirmCancelBtn: { paddingVertical: SPACING.sm, alignItems: "center" },
  confirmCancelText: { fontFamily: FONTS.semibold, fontSize: 14 },
  warningBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  warningText: { fontFamily: FONTS.regular, fontSize: 12, flex: 1 },
  playerBody: { flex: 1, alignItems: "center", padding: SPACING.xl, paddingTop: SPACING.xxxl },
  playerArt: {
    width: 180,
    height: 180,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xxl,
  },
  playerArabic: { fontSize: 26, marginBottom: 2 },
  playerTitle: { fontFamily: FONTS.bold, fontSize: 20, textAlign: "center" },
  playerSub: { fontFamily: FONTS.medium, fontSize: 14, marginTop: 4, marginBottom: SPACING.xxl },
  playerSlider: { width: "100%", height: 40 },
  playerTimeRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: -SPACING.xs },
  playerTimeText: { fontFamily: FONTS.medium, fontSize: 12 },
  playerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.md,
  },
  playerSideBtn: { padding: SPACING.sm },
  playerSecondaryBtn: { padding: SPACING.sm },
  playerMainBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
});

// Dedicated stylesheet for NowPlayingScreen — separate from the main
// `styles` above since this screen uses its own fixed dark+gold palette
// baked directly into these styles, rather than the app's theme colors.
const playerStyles = StyleSheet.create({
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxxl,
    paddingBottom: SPACING.md,
  },
  backText: { fontFamily: FONTS.semibold, fontSize: 14, color: "rgba(255,255,255,0.85)", flexShrink: 1 },
  body: { flex: 1, alignItems: "center", padding: SPACING.xl, paddingTop: SPACING.lg },
  artWrap: { alignItems: "center", justifyContent: "center", marginBottom: SPACING.xxl },
  artGlowOuter: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(232,184,75,0.06)",
  },
  artGlowInner: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "rgba(232,184,75,0.1)",
  },
  art: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(232,184,75,0.35)",
  },
  arabic: { fontSize: 26, color: "#F5F1E6", marginBottom: 2 },
  title: { fontFamily: FONTS.bold, fontSize: 20, color: "#FFFFFF", textAlign: "center" },
  sub: { fontFamily: FONTS.medium, fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 4, marginBottom: SPACING.xxl },
  slider: { width: "100%", height: 40 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: -SPACING.xs },
  timeText: { fontFamily: FONTS.medium, fontSize: 12, color: "rgba(255,255,255,0.6)" },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.sm,
  },
  togglePill: { borderRadius: RADIUS.pill },
  sideBtn: { padding: SPACING.sm },
  secondaryBtn: { padding: SPACING.sm },
  mainBtnWrap: { borderRadius: 40 },
  mainBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
