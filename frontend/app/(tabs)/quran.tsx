import React, { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import {
  Ayah,
  AudioEdition,
  SurahMeta,
  deleteDownloadedQuranAudio,
  downloadFullQuranAudio,
  fetchAudioEditions,
  fetchJuzBilingual,
  fetchSurahBilingual,
  fetchSurahList,
  getDownloadedEditions,
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

// Dedicated immersive "Now Playing" screen — deliberately uses its own
// fixed dark + gold Islamic-inspired palette regardless of the app's
// light/dark theme setting, similar precedent to how alarm-ring.tsx always
// uses its own fixed gradient rather than the app theme.
function NowPlayingScreen({
  selectedEdition,
  surahMeta,
  status,
  player,
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
  status: any;
  player: any;
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
    if (status?.playing) {
      artRotation.value = withRepeat(
        withTiming(artRotation.value + 360, { duration: 20000, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(artRotation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.playing]);
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
            <LinearGradient colors={["#2A6E60", "#0F332C"]} style={playerStyles.art}>
              <Ionicons name="disc-outline" size={72} color="rgba(255,255,255,0.85)" />
            </LinearGradient>
          </Animated.View>
        </View>

        <Text style={playerStyles.arabic}>{surahMeta?.name}</Text>
        <Text style={playerStyles.title}>{surahMeta?.englishName}</Text>
        <Text style={playerStyles.sub}>{selectedEdition.englishName}</Text>

        <Slider
          style={playerStyles.slider}
          minimumValue={0}
          maximumValue={status?.duration || 0}
          value={status?.currentTime || 0}
          minimumTrackTintColor="#E8B84B"
          maximumTrackTintColor="rgba(255,255,255,0.2)"
          thumbTintColor="#E8B84B"
          onSlidingComplete={(v: number) => player.seekTo(v)}
        />
        <View style={playerStyles.timeRow}>
          <Text style={playerStyles.timeText}>{formatTime(status?.currentTime || 0)}</Text>
          <Text style={playerStyles.timeText}>{formatTime(status?.duration || 0)}</Text>
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
                <Ionicons name={status?.playing ? "pause" : "play"} size={32} color="#0B1E1B" />
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

function ListenTab({ colors, insets }: { colors: ThemeColors; insets: Insets }) {
  const [view, setView] = useState<ListenView>("reciters");
  const [editions, setEditions] = useState<AudioEdition[] | null>(null);
  const [loadingEditions, setLoadingEditions] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedEdition, setSelectedEdition] = useState<AudioEdition | null>(null);
  const [surahList, setSurahList] = useState<SurahMeta[] | null>(null);
  const [downloadedEditions, setDownloadedEditions] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(0);
  const [downloadWarning, setDownloadWarning] = useState<string | null>(null);
  const [currentSurah, setCurrentSurah] = useState<number | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  // NOTE: this is the first place in the app that initializes an audio
  // player with no source at mount time, loading a real source later via
  // .replace() — the only other usage of expo-audio in this codebase
  // (alarm-ring.tsx) always initializes with a real bundled sound file.
  // This is expo-audio's documented pattern for a "reactive" player whose
  // source isn't known until later, but it's worth a real on-device check
  // here specifically, since it's genuinely new ground for this app.
  const player = useAudioPlayer(null);
  // NOTE: also genuinely new ground — useAudioPlayerStatus is expo-audio's
  // documented hook for reactive playback status (currentTime, duration,
  // playing, didJustFinish), used here to drive the scrubber, time
  // readouts, and auto-advance/repeat-on-finish logic. Worth confirming
  // on-device that the exact field names below match what's returned.
  const status = useAudioPlayerStatus(player);

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
    if (status?.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  // Auto-advance to the next Surah when the current one finishes, unless
  // Repeat is on, in which case the same Surah restarts from the beginning
  // instead.
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

  const pausePlayback = () => {
    try {
      player.pause();
    } catch {}
  };

  const startFullDownload = async () => {
    if (!selectedEdition) return;
    setDownloading(true);
    setDownloadDone(0);
    setDownloadWarning(null);
    try {
      const { failedSurahs } = await downloadFullQuranAudio(selectedEdition, (done) => setDownloadDone(done));
      const updated = await markEditionDownloaded(selectedEdition.identifier);
      setDownloadedEditions(updated);
      if (failedSurahs.length > 0) {
        setDownloadWarning(
          `${failedSurahs.length} Surah${failedSurahs.length > 1 ? "s" : ""} couldn't be downloaded (will stream instead): ${failedSurahs.join(", ")}`,
        );
      }
    } catch (e) {
      console.warn("Quran full download failed", e);
      setDownloadWarning("Download failed. Check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  };

  const removeDownload = async () => {
    if (!selectedEdition) return;
    await deleteDownloadedQuranAudio(selectedEdition.identifier);
    const updated = await unmarkEditionDownloaded(selectedEdition.identifier);
    setDownloadedEditions(updated);
  };

  // Full-screen "Now Playing" audio player.
  if (view === "player" && selectedEdition && currentSurah) {
    const surahMeta = (surahList || []).find((s) => s.number === currentSurah);
    return (
      <NowPlayingScreen
        selectedEdition={selectedEdition}
        surahMeta={surahMeta}
        status={status}
        player={player}
        shuffle={shuffle}
        repeat={repeat}
        onToggleShuffle={() => setShuffle((v) => !v)}
        onToggleRepeat={() => setRepeat((v) => !v)}
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
            pausePlayback();
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
              <Text style={[styles.listSub, { color: colors.onSurfaceTertiary }]}>
                Downloading… {downloadDone}/114
              </Text>
            ) : isDownloaded ? (
              <Text style={[styles.listSub, { color: colors.success }]}>Downloaded for offline listening</Text>
            ) : (
              <Text style={[styles.listSub, { color: colors.onSurfaceTertiary }]}>Streams online — download for offline</Text>
            )}
          </View>
          {downloading ? (
            <ActivityIndicator color={colors.brand} />
          ) : isDownloaded ? (
            <Pressable testID="quran-remove-download" onPress={removeDownload} style={styles.downloadIconBtn}>
              <Ionicons name="trash-outline" size={20} color={colors.muted} />
            </Pressable>
          ) : (
            <Pressable
              testID="quran-start-download"
              onPress={startFullDownload}
              style={[styles.downloadBtn, { backgroundColor: colors.brand }]}
            >
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={styles.downloadBtnText}>Download All</Text>
            </Pressable>
          )}
        </View>

        {downloadWarning ? (
          <View style={[styles.warningBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={[styles.warningText, { color: colors.error }]}>{downloadWarning}</Text>
          </View>
        ) : null}

        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + SPACING.xxxl }}>
          {(surahList || []).map((s) => {
            const isCurrent = currentSurah === s.number;
            return (
              <Pressable
                key={s.number}
                testID={`quran-play-${s.number}`}
                onPress={() => openPlayer(s.number)}
                style={[styles.listRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.listNumBadge, { backgroundColor: isCurrent ? colors.brand : colors.brandTertiary }]}>
                  {isCurrent ? (
                    <Ionicons name="volume-high" size={16} color="#fff" />
                  ) : (
                    <Text style={[styles.listNumText, { color: colors.brand }]}>{s.number}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listTitle, { color: colors.onSurface }]}>{s.englishName}</Text>
                  <Text style={[styles.listSub, { color: colors.onSurfaceTertiary }]}>{s.numberOfAyahs} ayahs</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
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
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + SPACING.xxxl }}>
          {(editions || []).map((e) => (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: FONTS.bold, fontSize: 26, marginBottom: SPACING.md },
  modeSwitch: { flexDirection: "row", borderRadius: RADIUS.md, padding: 4 },
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
