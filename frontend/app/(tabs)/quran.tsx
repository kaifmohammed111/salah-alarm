import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { useFocusEffect } from "@react-navigation/native";
import Slider from "@react-native-community/slider";

import { useApp } from "@/src/context/AppContext";
import { FONTS, RADIUS, SPACING, ThemeColors } from "@/src/theme";
import IslamicPattern from "@/src/components/IslamicPattern";
import {
  Ayah,
  AudioEdition,
  DownloadControl,
  DownloadFailure,
  DownloadProgressInfo,
  SurahMeta,
  createDownloadControl,
  cancelDownload,
  getLastPlayed,
  saveLastPlayed,
  LastPlayed,
  getBackgroundPlaybackEnabled,
  setBackgroundPlaybackEnabled,
  deleteDownloadedQuranAudio,
  deleteSingleSurahAudio,
  downloadQuranAudio,
  estimateDownloadSizeBytes,
  fetchAudioEditions,
  fetchJuzBilingual,
  fetchSurahBilingual,
  fetchWholeQuranBilingual,
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

// ============================================================
// QuranScreen — owns the audio player and all playback state so
// it survives switching between Read and Listen (previously the
// player lived inside ListenTab, which fully unmounts — and
// destroys the native player with it — the instant the user
// switched to Read, even with "Play in Background" on). Now
// playback keeps going regardless of which mode is active, with
// a small mini-player bar shown whenever a track is loaded and
// the full Now Playing screen isn't open.
// ============================================================
export default function QuranScreen() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("read");

  // ---- Browsing data (reciters, Surah list, downloaded editions) ----
  // Lifted here (not just inside ListenTab) because playback-related
  // logic that now lives at this level — resuming last-played, showing
  // the mini-player's title, playSurah's metadata lookup — needs it too.
  const [editions, setEditions] = useState<AudioEdition[] | null>(null);
  const [loadingEditions, setLoadingEditions] = useState(true);
  const [editionsError, setEditionsError] = useState<string | null>(null);
  const [surahList, setSurahList] = useState<SurahMeta[] | null>(null);
  const [downloadedEditions, setDownloadedEditions] = useState<string[]>([]);

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
        setEditionsError("Could not load reciters. Check your connection and try again.");
      } finally {
        setLoadingEditions(false);
      }
    })();
  }, []);

  // ---- Playback state ----
  const [selectedEdition, setSelectedEdition] = useState<AudioEdition | null>(null);
  const [currentSurah, setCurrentSurah] = useState<number | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [backgroundPlaybackEnabled, setBackgroundPlaybackEnabledState] = useState(true);
  const [sleepTimerEndAt, setSleepTimerEndAt] = useState<number | null>(null);
  const [sleepTimerRemainingSec, setSleepTimerRemainingSec] = useState<number | null>(null);
  // "Continue Listening" — remembers the last Surah/reciter/position
  // across app restarts, so the reciter list can offer a resume card.
  const [lastPlayed, setLastPlayed] = useState<LastPlayed | null>(null);
  useEffect(() => {
    getLastPlayed().then(setLastPlayed);
  }, []);

  // Background playback + lock-screen/notification controls use
  // expo-audio's own built-in support (setActiveForLockScreen), rather
  // than a hand-written native module — confirmed via Expo's own
  // documentation to provide a real foreground service, a system
  // notification with controls, and indefinite background playback, all
  // built into the library already used elsewhere in this app (e.g.
  // alarm-ring.tsx).
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const isPlaying = !!status?.playing;

  // Latest status in a ref (not state) so the periodic save below can
  // read the current position without needing to re-create its interval
  // on every position tick (which would effectively defeat a "every 15s"
  // save by resetting the timer continuously).
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    if (!isPlaying || !currentSurah || !selectedEdition) return;
    const interval = setInterval(() => {
      const currentTime = statusRef.current?.currentTime;
      if (currentTime) {
        const meta = (surahList || []).find((s) => s.number === currentSurah);
        saveLastPlayed({
          editionIdentifier: selectedEdition.identifier,
          editionName: selectedEdition.englishName,
          surahNumber: currentSurah,
          surahName: meta?.englishName || `Surah ${currentSurah}`,
          positionSeconds: currentTime,
        });
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [isPlaying, currentSurah, selectedEdition, surahList]);

  useEffect(() => {
    getBackgroundPlaybackEnabled().then(setBackgroundPlaybackEnabledState);
  }, []);
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: backgroundPlaybackEnabled,
      interruptionMode: "doNotMix",
    }).catch((e) => console.warn("setAudioModeAsync failed", e));
  }, [backgroundPlaybackEnabled]);

  // Pauses playback the instant the user switches to a DIFFERENT bottom
  // tab (Home/Alarms/Qibla/Dhikr/More), unless background playback is
  // on. Now scoped to QuranScreen itself (not ListenTab), since
  // QuranScreen is the level that actually corresponds to a real
  // react-navigation focus boundary — switching between Read/Listen
  // internally no longer affects this at all, which is the whole point
  // of lifting playback state up here.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!backgroundPlaybackEnabled) {
          try {
            player.pause();
          } catch {
            // Defensive: expo-audio's own cleanup can release the native
            // player before this runs in some unmount orderings, in
            // which case pause() throws "already released" — nothing to
            // do in that case.
          }
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [backgroundPlaybackEnabled, player]),
  );

  useEffect(() => {
    if (sleepTimerEndAt == null) {
      setSleepTimerRemainingSec(null);
      return;
    }
    const tick = () => {
      const remaining = Math.round((sleepTimerEndAt - Date.now()) / 1000);
      if (remaining <= 0) {
        try {
          player.pause();
        } catch {
          // Same "already released" defensive handling as above.
        }
        setSleepTimerEndAt(null);
        setSleepTimerRemainingSec(null);
      } else {
        setSleepTimerRemainingSec(remaining);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerEndAt, player]);

  const onSetSleepTimer = (minutes: number | null) => {
    setSleepTimerEndAt(minutes == null ? null : Date.now() + minutes * 60000);
  };

  const playSurah = async (surahNumber: number, editionOverride?: AudioEdition) => {
    const edition = editionOverride || selectedEdition;
    if (!edition) return;
    try {
      const downloaded = await isSurahDownloaded(edition.identifier, surahNumber);
      const uri = downloaded
        ? localSurahAudioPath(edition.identifier, surahNumber)
        : mp3QuranSurahUrl(edition.server, surahNumber);
      player.replace({ uri });
      player.play();
      setCurrentSurah(surahNumber);
      const meta = (surahList || []).find((s) => s.number === surahNumber);
      // Registers this player for lock-screen/notification controls with
      // the current Surah's info — must be set to "doNotMix" interruption
      // mode (already configured above) for the OS to correctly associate
      // these controls with this player. Only done when the user has left
      // background playback on.
      if (backgroundPlaybackEnabled) {
        player.setActiveForLockScreen(true, {
          title: meta?.englishName || `Surah ${surahNumber}`,
          artist: edition.englishName,
        });
      } else {
        player.setActiveForLockScreen(false);
      }
      saveLastPlayed({
        editionIdentifier: edition.identifier,
        editionName: edition.englishName,
        surahNumber,
        surahName: meta?.englishName || `Surah ${surahNumber}`,
        positionSeconds: 0,
      });
    } catch (e) {
      console.warn("Quran playSurah failed", e);
    }
  };

  // Lets the user turn background playback (and its lock-screen/
  // notification controls) on or off from the Now Playing screen.
  // Persisted via src/lib/quran.ts so the choice survives app restarts.
  const onToggleBackgroundPlayback = async () => {
    const next = !backgroundPlaybackEnabled;
    setBackgroundPlaybackEnabledState(next);
    await setBackgroundPlaybackEnabled(next);
    if (currentSurah != null && selectedEdition) {
      if (next) {
        const meta = (surahList || []).find((s) => s.number === currentSurah);
        player.setActiveForLockScreen(true, {
          title: meta?.englishName || `Surah ${currentSurah}`,
          artist: selectedEdition.englishName,
        });
      } else {
        player.setActiveForLockScreen(false);
      }
    }
  };

  const openPlayer = (surahNumber: number) => {
    playSurah(surahNumber);
    setShowFullPlayer(true);
  };

  const onResumeLastPlayed = async () => {
    if (!lastPlayed) return;
    const edition = (editions || []).find((e) => e.identifier === lastPlayed.editionIdentifier);
    if (!edition) return;
    setSelectedEdition(edition);
    await playSurah(lastPlayed.surahNumber, edition);
    if (lastPlayed.positionSeconds > 0) {
      player.seekTo(lastPlayed.positionSeconds);
    }
    setShowFullPlayer(true);
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
      if (currentSurah && selectedEdition && status?.currentTime) {
        const meta = (surahList || []).find((s) => s.number === currentSurah);
        saveLastPlayed({
          editionIdentifier: selectedEdition.identifier,
          editionName: selectedEdition.englishName,
          surahNumber: currentSurah,
          surahName: meta?.englishName || `Surah ${currentSurah}`,
          positionSeconds: status.currentTime,
        });
      }
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

  const currentSurahMeta = (surahList || []).find((s) => s.number === currentSurah);

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

      {/* Both tabs stay mounted permanently (display toggling only, not
          conditional rendering) — switching mode used to fully unmount
          whichever tab wasn't active, wiping ReadTab's in-memory
          wholeQuran cache every time and forcing a re-read of a large
          cached JSON blob from storage on every switch back. Now that
          state survives for the lifetime of the screen, matching the
          "load once" design fetchWholeQuranBilingual already intended. */}
      <View style={{ flex: 1, display: mode === "read" ? "flex" : "none" }}>
        <ReadTab colors={colors} insets={insets} />
      </View>
      <View style={{ flex: 1, display: mode === "listen" ? "flex" : "none" }}>
        <ListenTab
          colors={colors}
          insets={insets}
          editions={editions}
          loadingEditions={loadingEditions}
          editionsError={editionsError}
          surahList={surahList}
          downloadedEditions={downloadedEditions}
          setDownloadedEditions={setDownloadedEditions}
          selectedEdition={selectedEdition}
          setSelectedEdition={setSelectedEdition}
          currentSurah={currentSurah}
          lastPlayed={lastPlayed}
          onResumeLastPlayed={onResumeLastPlayed}
          openPlayer={openPlayer}
        />
      </View>

      {/* Mini-player bar: visible in EITHER mode whenever a track is
          loaded and the full player isn't open — this is the whole point
          of lifting playback state up to this level. Tapping it opens
          the full Now Playing screen. */}
      {currentSurah && selectedEdition && !showFullPlayer ? (
        <Pressable
          testID="quran-mini-player"
          onPress={() => setShowFullPlayer(true)}
          style={[styles.miniPlayer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}
        >
          <View style={[styles.miniPlayerIcon, { backgroundColor: colors.brandTertiary }]}>
            <Ionicons name="musical-notes" size={16} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.miniPlayerTitle, { color: colors.onSurface }]} numberOfLines={1}>
              {currentSurahMeta?.englishName || `Surah ${currentSurah}`}
            </Text>
            <Text style={[styles.miniPlayerSub, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
              {selectedEdition.englishName}
            </Text>
          </View>
          <Pressable
            testID="quran-mini-player-toggle"
            onPress={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
            hitSlop={10}
            style={styles.miniPlayerPlayBtn}
          >
            <Ionicons name={isPlaying ? "pause" : "play"} size={22} color={colors.brand} />
          </Pressable>
        </Pressable>
      ) : null}

      {/* Full Now Playing screen — rendered as an overlay independent of
          mode, so it can be opened whether the user is on Read or
          Listen, and reached from either the mini-player or normal
          Listen-tab browsing. */}
      {showFullPlayer && selectedEdition && currentSurah ? (
        <View style={StyleSheet.absoluteFill}>
          <NowPlayingScreen
            selectedEdition={selectedEdition}
            surahMeta={currentSurahMeta}
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
            onBack={() => setShowFullPlayer(false)}
            backgroundPlaybackEnabled={backgroundPlaybackEnabled}
            onToggleBackgroundPlayback={onToggleBackgroundPlayback}
            sleepTimerRemainingSec={sleepTimerRemainingSec}
            onSetSleepTimer={onSetSleepTimer}
          />
        </View>
      ) : null}
    </View>
  );
}

function ReadTab({ colors, insets }: { colors: ThemeColors; insets: Insets }) {
  const [browseBy, setBrowseBy] = useState<BrowseBy>("surah");
  const [surahList, setSurahList] = useState<SurahMeta[] | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<{ type: BrowseBy; number: number } | null>(null);
  // Holds the ENTIRE Quran (Arabic + English), not just the selected
  // Surah/Juz — loaded once (cached after) so the page reader below lets
  // the user swipe freely across all 604 pages from any starting point,
  // rather than being boxed into just the Surah/Juz they opened.
  const [wholeQuran, setWholeQuran] = useState<{ arabic: Ayah[]; english: Ayah[] } | null>(null);
  const [loadingWholeQuran, setLoadingWholeQuran] = useState(false);
  const [wholeQuranError, setWholeQuranError] = useState<string | null>(null);
  const pagerRef = useRef<FlatList<any>>(null);

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

  const [wholeQuranProgress, setWholeQuranProgress] = useState<{ done: number; total: number } | null>(null);
  const [waitingForConnection, setWaitingForConnection] = useState(false);

  const ensureWholeQuranLoaded = async () => {
    if (wholeQuran) return;
    setWholeQuranError(null);
    setLoadingWholeQuran(true);
    setWholeQuranProgress({ done: 0, total: 114 });
    setWaitingForConnection(false);
    try {
      const data = await fetchWholeQuranBilingual((info) => {
        setWholeQuranProgress({ done: info.done, total: info.total });
        setWaitingForConnection(info.waitingForConnection);
      });
      setWholeQuran(data);
    } catch (e) {
      console.warn("fetchWholeQuranBilingual failed", e);
      setWholeQuranError("Could not load the Quran text. Check your connection and try again.");
    } finally {
      setLoadingWholeQuran(false);
      setWaitingForConnection(false);
    }
  };

  const openSurah = (n: number) => {
    setSelected({ type: "surah", number: n });
    ensureWholeQuranLoaded();
  };

  const openJuz = (n: number) => {
    setSelected({ type: "juz", number: n });
    ensureWholeQuranLoaded();
  };

  // Groups the flat, sequentially-ordered ayah list into actual Mushaf
  // pages using each ayah's real `page` field from the API — a single
  // pass works because page numbers only ever increase moving forward.
  const pages = useMemo(() => {
    if (!wholeQuran) return [];
    const result: { pageNumber: number; arabic: Ayah[]; english: Ayah[] }[] = [];
    let current: { pageNumber: number; arabic: Ayah[]; english: Ayah[] } | null = null;
    for (let i = 0; i < wholeQuran.arabic.length; i++) {
      const a = wholeQuran.arabic[i];
      const en = wholeQuran.english[i];
      // Defensive: skip anything malformed rather than crash, even though
      // fetchWholeQuranBilingual now filters these out at the source too
      // (belt-and-suspenders, and covers any already-cached data from
      // before that fix existed).
      if (!a || typeof a.page !== "number") continue;
      if (!current || current.pageNumber !== a.page) {
        current = { pageNumber: a.page, arabic: [], english: [] };
        result.push(current);
      }
      current.arabic.push(a);
      current.english.push(en);
    }
    return result;
  }, [wholeQuran]);

  // Which page to open on: the page of the first ayah matching the
  // selected Surah or Juz. From there the user can keep swiping through
  // the rest of the Quran freely — there's no separate "whole Quran"
  // entry point by design; Surah/Juz selection is just a jump-to-page.
  const targetPageIndex = useMemo(() => {
    if (!selected || !wholeQuran || pages.length === 0) return 0;
    const firstMatch = wholeQuran.arabic.find((a) =>
      selected.type === "surah" ? a?.surah?.number === selected.number : a?.juz === selected.number,
    );
    if (!firstMatch) return 0;
    const idx = pages.findIndex((p) => p.pageNumber === firstMatch.page);
    return idx >= 0 ? idx : 0;
  }, [selected, wholeQuran, pages]);

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
        {loadingWholeQuran ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={colors.brand} />
            <Text style={[styles.pageLoadingText, { color: colors.onSurfaceTertiary }]}>
              {waitingForConnection
                ? "Waiting for connection\u2026"
                : `Preparing full Quran text${"\n"}(one-time setup — instant after this)`}
            </Text>
            {wholeQuranProgress ? (
              <>
                <View
                  style={[
                    styles.downloadProgressTrack,
                    { backgroundColor: colors.surfaceTertiary, marginTop: SPACING.md, width: 200 },
                  ]}
                >
                  <View
                    style={[
                      styles.downloadProgressFill,
                      {
                        width: `${Math.round((wholeQuranProgress.done / wholeQuranProgress.total) * 100)}%`,
                        backgroundColor: colors.brand,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.pageLoadingText, { color: colors.onSurfaceTertiary, marginTop: SPACING.xs }]}>
                  {wholeQuranProgress.done}/{wholeQuranProgress.total} Surahs
                </Text>
              </>
            ) : null}
          </View>
        ) : wholeQuranError ? (
          <View style={styles.centerFill}>
            <Text style={[styles.errorText, { color: colors.error }]}>{wholeQuranError}</Text>
          </View>
        ) : pages.length > 0 ? (
          <FlatList
            key={`${selected.type}-${selected.number}`}
            ref={pagerRef}
            testID="quran-page-pager"
            style={{ flex: 1 }}
            data={pages}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => String(item.pageNumber)}
            initialScrollIndex={targetPageIndex}
            getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                pagerRef.current?.scrollToIndex({ index: info.index, animated: false });
              }, 50);
            }}
            renderItem={({ item }) => (
              <ScrollView
                style={{ width: SCREEN_W }}
                contentContainerStyle={{ padding: SPACING.xl, paddingBottom: insets.bottom + SPACING.xxxl }}
              >
                <Text style={[styles.pageNumberLabel, { color: colors.onSurfaceTertiary }]}>
                  Page {item.pageNumber} of 604
                </Text>
                {item.arabic.map((a, i) => {
                  const en = item.english[i];
                  const showSurahHeader = i === 0 || item.arabic[i - 1].surah.number !== a.surah.number;
                  return (
                    <React.Fragment key={a.number}>
                      {showSurahHeader ? (
                        <Text style={[styles.juzSurahHeader, { color: colors.brand }]}>{a.surah.englishName}</Text>
                      ) : null}
                      <View style={styles.pageAyahBlock}>
                        <Text style={[styles.pageArabicText, { color: colors.onSurface }]}>
                          {a.text}
                          <Text style={[styles.pageAyahMarker, { color: colors.brand }]}> ({a.numberInSurah})</Text>
                        </Text>
                        <Text style={[styles.pageEnglishText, { color: colors.onSurfaceTertiary }]}>{en?.text}</Text>
                      </View>
                    </React.Fragment>
                  );
                })}
              </ScrollView>
            )}
          />
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
  backgroundPlaybackEnabled,
  onToggleBackgroundPlayback,
  sleepTimerRemainingSec,
  onSetSleepTimer,
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
  backgroundPlaybackEnabled: boolean;
  onToggleBackgroundPlayback: () => void;
  sleepTimerRemainingSec: number | null;
  onSetSleepTimer: (minutes: number | null) => void;
}) {
  const [sleepTimerModalOpen, setSleepTimerModalOpen] = useState(false);
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

      <View style={playerStyles.backRow}>
        <Pressable testID="quran-player-back" onPress={onBack} style={playerStyles.backRowLeft}>
          <Ionicons name="chevron-down" size={24} color="rgba(255,255,255,0.85)" />
          <Text style={playerStyles.backText} numberOfLines={1}>
            {selectedEdition.englishName}
          </Text>
        </Pressable>
        {/* Background-playback toggle: headset icon + label, gold when on
            (audio keeps playing + shows lock-screen/notification controls
            after leaving the tab/app) or muted when off (playback pauses,
            at the same position, the instant the user switches tabs).
            Persisted via src/lib/quran.ts. */}
        <Pressable
          testID="quran-toggle-background-playback"
          onPress={onToggleBackgroundPlayback}
          hitSlop={10}
          style={playerStyles.backgroundToggleBtn}
        >
          <Ionicons
            name="headset"
            size={16}
            color={backgroundPlaybackEnabled ? "#E8B84B" : "rgba(255,255,255,0.5)"}
          />
          <Text
            style={[
              playerStyles.backgroundToggleText,
              { color: backgroundPlaybackEnabled ? "#E8B84B" : "rgba(255,255,255,0.5)" },
            ]}
            numberOfLines={1}
          >
            Play in Background
          </Text>
        </Pressable>
      </View>

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
        <Pressable
          testID="quran-sleep-timer-btn"
          onPress={() => setSleepTimerModalOpen(true)}
          style={playerStyles.sleepTimerBtn}
        >
          <Ionicons
            name="timer-outline"
            size={16}
            color={sleepTimerRemainingSec != null ? "#E8B84B" : "rgba(255,255,255,0.5)"}
          />
          <Text
            style={[
              playerStyles.sleepTimerText,
              { color: sleepTimerRemainingSec != null ? "#E8B84B" : "rgba(255,255,255,0.5)" },
            ]}
          >
            {sleepTimerRemainingSec != null ? `Sleep in ${formatTime(sleepTimerRemainingSec)}` : "Sleep Timer"}
          </Text>
        </Pressable>
      </Animated.View>
      <Modal
        visible={sleepTimerModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSleepTimerModalOpen(false)}
      >
        <Pressable style={playerStyles.sleepModalBackdrop} onPress={() => setSleepTimerModalOpen(false)}>
          <View style={playerStyles.sleepModalSheet}>
            <Text style={playerStyles.sleepModalTitle}>Sleep Timer</Text>
            {[5, 10, 15, 30, 45, 60].map((mins) => (
              <Pressable
                key={mins}
                testID={`quran-sleep-timer-${mins}`}
                onPress={() => {
                  onSetSleepTimer(mins);
                  setSleepTimerModalOpen(false);
                }}
                style={playerStyles.sleepModalOption}
              >
                <Text style={playerStyles.sleepModalOptionText}>{mins} minutes</Text>
              </Pressable>
            ))}
            {sleepTimerRemainingSec != null ? (
              <Pressable
                testID="quran-sleep-timer-off"
                onPress={() => {
                  onSetSleepTimer(null);
                  setSleepTimerModalOpen(false);
                }}
                style={playerStyles.sleepModalOption}
              >
                <Text style={[playerStyles.sleepModalOptionText, { color: "#E8918A" }]}>Turn off</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

type ListenView = "reciters" | "surahs";

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// ListenTab now only owns browsing/downloads UI — all playback state
// (player, currentSurah, shuffle/repeat, background/sleep-timer
// settings) lives in QuranScreen and is passed down as props, so
// playback survives switching to Read.
function ListenTab({
  colors,
  insets,
  editions,
  loadingEditions,
  editionsError,
  surahList,
  downloadedEditions,
  setDownloadedEditions,
  selectedEdition,
  setSelectedEdition,
  currentSurah,
  lastPlayed,
  onResumeLastPlayed,
  openPlayer,
}: {
  colors: ThemeColors;
  insets: Insets;
  editions: AudioEdition[] | null;
  loadingEditions: boolean;
  editionsError: string | null;
  surahList: SurahMeta[] | null;
  downloadedEditions: string[];
  setDownloadedEditions: (v: string[]) => void;
  selectedEdition: AudioEdition | null;
  setSelectedEdition: (e: AudioEdition | null) => void;
  currentSurah: number | null;
  lastPlayed: LastPlayed | null;
  onResumeLastPlayed: () => void;
  openPlayer: (surahNumber: number) => void;
}) {
  const [view, setView] = useState<ListenView>("reciters");
  const [downloadedSurahSet, setDownloadedSurahSet] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(114);
  const [downloadEta, setDownloadEta] = useState<number | null>(null);
  // Fractional progress (0..1) within the single file currently being
  // downloaded — lets the percentage bar move continuously between
  // whole-file completions instead of freezing on slow connections.
  const [currentFileFraction, setCurrentFileFraction] = useState(0);
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
      setCurrentFileFraction(0);
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
            setCurrentFileFraction(info.currentFileFraction);
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
      setCurrentFileFraction(0);
    }
  };

  const cancelCurrentDownload = () => {
    if (downloadControlRef.current) {
      // pauseAsync() actually interrupts the in-flight network request
      // now, instead of only setting a flag checked between files (which
      // is what made Cancel feel "stuck" until the current file finished
      // on its own).
      cancelDownload(downloadControlRef.current);
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
                  : `Downloading… ${downloadDone}/${downloadTotal} · ${Math.round(((downloadDone + currentFileFraction) / Math.max(1, downloadTotal)) * 100)}%${
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
                    width: `${Math.min(100, Math.round(((downloadDone + currentFileFraction) / Math.max(1, downloadTotal)) * 100))}%`,
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
              {/* Retries exactly the Surahs that failed, in one tap —
                  reuses the same confirm-dialog entry point as every other
                  download trigger (per-row, Download All, Download
                  Selected), so it gets the network-choice prompt and size
                  estimate for free. */}
              <Pressable
                testID="quran-retry-failed"
                onPress={() => {
                  const retryNumbers = failures.map((f) => f.surah);
                  setShowFailureDetails(false);
                  requestDownloadConfirm(retryNumbers, null);
                }}
                style={[styles.selectionDownloadBtn, { backgroundColor: colors.brand, marginTop: SPACING.md }]}
              >
                <Ionicons name="refresh-outline" size={16} color="#fff" />
                <Text style={styles.downloadBtnText}>
                  Retry {failures.length} Failed Surah{failures.length > 1 ? "s" : ""}
                </Text>
              </Pressable>
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
      ) : editionsError ? (
        <View style={styles.centerFill}>
          <Text style={[styles.errorText, { color: colors.error }]}>{editionsError}</Text>
        </View>
      ) : (
        <>
          {lastPlayed ? (
            <Pressable
              testID="quran-resume-last-played"
              onPress={onResumeLastPlayed}
              style={[styles.resumeCard, { backgroundColor: colors.brandTertiary, borderColor: colors.border }]}
            >
              <Ionicons name="play-circle" size={32} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.resumeLabel, { color: colors.onSurfaceTertiary }]}>Continue Listening</Text>
                <Text style={[styles.resumeTitle, { color: colors.onSurface }]} numberOfLines={1}>
                  {lastPlayed.surahName}
                </Text>
                <Text style={[styles.resumeSub, { color: colors.onSurfaceTertiary }]} numberOfLines={1}>
                  {lastPlayed.editionName}
                </Text>
              </View>
            </Pressable>
          ) : null}
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
  miniPlayer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  miniPlayerIcon: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  miniPlayerTitle: { fontFamily: FONTS.semibold, fontSize: 14 },
  miniPlayerSub: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 1 },
  miniPlayerPlayBtn: { padding: SPACING.xs },
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
  resumeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    margin: SPACING.lg,
    marginBottom: 0,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resumeLabel: { fontFamily: FONTS.semibold, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  resumeTitle: { fontFamily: FONTS.bold, fontSize: 16, marginTop: 2 },
  resumeSub: { fontFamily: FONTS.regular, fontSize: 13, marginTop: 1 },
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
  pageLoadingText: { fontFamily: FONTS.medium, fontSize: 13, textAlign: "center", marginTop: SPACING.md, lineHeight: 19 },
  pageNumberLabel: { fontFamily: FONTS.semibold, fontSize: 12, textAlign: "center", marginBottom: SPACING.lg },
  pageAyahBlock: { marginBottom: SPACING.lg },
  pageArabicText: { fontSize: 24, lineHeight: 42, textAlign: "right" },
  pageAyahMarker: { fontFamily: FONTS.bold, fontSize: 14 },
  pageEnglishText: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, marginTop: SPACING.sm },
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
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxxl,
    paddingBottom: SPACING.md,
  },
  backRowLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1, marginRight: SPACING.sm, minWidth: 0 },
  backgroundToggleBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.xs },
  backgroundToggleText: { fontFamily: FONTS.semibold, fontSize: 11 },
  sleepTimerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    marginTop: SPACING.lg,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  sleepTimerText: { fontFamily: FONTS.semibold, fontSize: 12 },
  sleepModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  sleepModalSheet: {
    backgroundColor: "#0F211D",
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    width: 260,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(232,184,75,0.25)",
  },
  sleepModalTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: "#fff",
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  sleepModalOption: {
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  sleepModalOptionText: { fontFamily: FONTS.medium, fontSize: 15, color: "#fff", textAlign: "center" },
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
