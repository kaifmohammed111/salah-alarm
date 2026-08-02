# Architecture

## Tech Stack

- **React Native / Expo SDK 54**, React Native 0.81.5, Expo Router (file-based routing under `app/`), New Architecture enabled (`newArchEnabled: true` in `app.json`).
- **Notifee** (`@notifee/react-native`) — alarm scheduling/notifications, chosen for reliable background/killed-app alarm delivery on Android, including full-screen intent. **Now archived/unmaintained by its authors as of this session** — still working and in use, but see `known-issues.md` for what that means for future work and the one known unresolved limitation (full-screen swipe UI not auto-appearing while the phone is locked).
- **react-native-reanimated** — all animations (bead sliding, splash entrance, Now Playing screen, Qibla rotation).
- **expo-audio** — all audio playback in the app: alarm sounds (`alarm-ring.tsx`) and Quran audio (see "Quran Feature" below). This is the *only* audio library in the app — a `react-native-track-player` integration was attempted and fully removed; see `known-issues.md`. **Background playback with lock-screen/notification controls is confirmed working** (this was the single open item at the end of the prior session; see `current-status.md`).
- **expo-location** — GPS for "calculate by location."
- **adhan** (npm) — the 25 prayer-time calculation methods, run entirely client-side.
- **tz-lookup** (npm) — resolves an IANA timezone from lat/lon so calculated times display correctly for the *location's* timezone rather than the device's.
- **AsyncStorage**, wrapped by `src/utils/storage.ts` — the only persistence layer.
- **expo-device** — OEM/brand detection, used to surface manufacturer-specific battery/autostart instructions.
- **expo-network** — connectivity checking (Quran download confirmation flow).
- **@react-native-community/slider** — used for the alarm volume slider and the Quran audio scrubber.
- **expo-linear-gradient**, **@expo/vector-icons (Ionicons)** — used throughout.
- **react-native-safe-area-context** — insets everywhere.
- **react-native-svg** (15.12.1) — added this session for the How to Pray feature's original SVG posture illustrations. **The component now uses real images instead** (see "How to Pray Feature" below), so this dependency is currently unused by any live code, but was deliberately left installed rather than uninstalled (removing a native dependency carries its own risk for no real benefit — it's harmless sitting unused).
- **react-native-google-mobile-ads**, pinned to the **exact** version `16.3.4` (no caret — this exact-pin is load-bearing, see `known-issues.md`) — AdMob banner + interstitial ads.
- Local builds via **EAS CLI's `--local` flag**, run inside **WSL2 Ubuntu** — cloud builds are not used (free tier exhausted).

There is **no backend, no database, no API endpoints** in the traditional sense. Two *external, third-party, read-only* APIs are consumed by the Quran feature (see below), and Google's AdMob SDK is integrated for ads — these are the closest things to "APIs" in this project, and none is under this project's control.

## Project Structure

```
frontend/
  app/
    _layout.tsx              root layout: alarm gate, battery exemption prompt,
                              immersive nav bar, alarm-ring route config
    (tabs)/
      _layout.tsx             7-tab bar: Home / Qibla / Dhikr / Quran / Timetable /
                               How to Pray / Settings. Also owns: unsaved-Settings
                               navigation guard, the adaptive banner ad (renders
                               below the Tabs navigator on every screen), and the
                               tab-switch-triggered interstitial ad (2-min cooldown)
      index.tsx                Home screen; live countdown; monthly calendar view;
                                widget-push effect
      qibla.tsx                  Qibla compass (vibration scoped via useFocusEffect)
      dhikr.tsx                   Tasbih/Dhikr counter
      quran.tsx                    Read + Listen (see "Quran Feature" below) —
                                    the largest single screen file in the app.
                                    QuranScreen owns ALL player state; both Read
                                    and Listen tabs stay permanently mounted
                                    (display-toggled, not unmounted) so playback
                                    survives switching modes and the Read tab's
                                    in-memory cache isn't lost
      upload.tsx                   Timetable: CSV import + calculate-by-location
      how-to-pray.tsx               How to Pray guide (see dedicated section below)
      settings.tsx                  Draft-based settings, OEM battery instructions,
                                     madhab picker, widget style, alarm strength
    alarm-ring.tsx             Full-screen alarm ring UI, gestureEnabled:false
    editor.tsx                 Manual prayer-time entry/edit screen
    onboarding.tsx              First-launch flow: choose location method
                                 (GPS/manual/CSV), calculation method, Asr madhab
  src/
    context/
      AppContext.tsx          Settings, timetable, config — main global state.
                               See "Settings Type Shape" below for the current
                               full field list.
      NowContext.tsx          Separate 1-second clock tick (see rationale below)
    lib/
      prayer.ts               prayerTime(), startJamaat(), nextPrayerInfo(),
                               timeToDate(), countdownString(), PRAYER_ORDER
      calculate.ts             25 calculation methods via adhan-js, tz-lookup
                                integration, device clock drift check
      alarm.ts                  Notifee scheduling + foreground/background
                                 event handlers, pending-alarm AsyncStorage recovery,
                                 strongAlarmNotification (ongoing + longer vibration)
      csv.ts                     Flexible CSV timetable parser
      dhikr.ts                    Built-in DHIKR_LIST + DhikrItem type
      widget.ts                    JS → native bridge for the home screen widget
      quran.ts                     Al Quran Cloud + MP3Quran.net API client,
                                    download manager with cancel/resume, connectivity,
                                    background playback, sleep timer, Continue Listening,
                                    reciter name overrides
      howToPray.ts                  How to Pray content/step-generation engine
                                     (see dedicated section below)
      hijri.ts, moon.ts, quotes.ts  supporting utilities
    utils/
      storage.ts               Thin AsyncStorage wrapper used everywhere
      settingsGuard.ts          Shared mutable ref letting the tab bar intercept
                                 navigation away from unsaved Settings
    components/
      AlarmSettingsSheet.tsx   Per-alarm volume/sound bottom sheet
      PrayerCard.tsx            Displays a single prayer's time; also the ONLY
                                 alarm-config entry point now (see below)
      PrayerPostureIllustration.tsx  How to Pray posture images (real photos/
                                       illustrations, not the original SVG — see
                                       dedicated section below)
      Starfield.tsx              Twinkling-stars + moon background (alarm ring)
      CustomSplashOverlay.tsx    3-phase splash animation
      IslamicPattern.tsx          Tiled 8-point-star geometric background (Quran player)
      TimeField.tsx                Time input with keyboard-avoiding auto-scroll
    hooks/
      use-keyboard-height.ts    Real keyboard height tracking (Android edge-to-edge fix)
    theme.ts                 FONTS / RADIUS / SPACING design tokens
  plugins/
    withHomeWidget.js         Generates ALL native widget code at prebuild
                              (Kotlin providers, XML layouts, vector drawables).
                              **Grid and Clock only now — the Arc design was
                              removed** (Settings' widget-style picker only
                              offers Grid/Clock; a legacy "arc" saved value
                              auto-migrates to "grid" at load time)
    withLockScreenModule.js    Generates LockScreenModule.kt — dynamic
                                lock-screen bypass, alarm-ring screen only
    withAlarmActivity.js        turnScreenOn manifest config on MainActivity.
                                 ALSO generates a separate, unused AlarmActivity.kt
                                 + manifest entry (showWhenLocked/turnScreenOn set
                                 statically) — built this session as an attempted
                                 fix for a full-screen-timing issue, but Notifee was
                                 never successfully pointed at it (see known-issues.md
                                 — the attempt broke notification-tap and was
                                 reverted). The Activity itself is harmless dead
                                 code left in place; DO NOT re-point
                                 fullScreenAction/pressAction's launchActivity at
                                 it without first finding verified evidence of the
                                 correct string format Notifee expects
    withAlarmSounds.js            Copies alarm sound assets to res/raw
  assets/
    images/                   Branding: icon, adaptive-icon, splash, kaaba icon;
                              also the 10 How to Pray posture images
                              (prayer-pose-*.png, flat in this same directory,
                              matching this project's existing flat-not-nested
                              asset convention)
  index.js                  True module-scope registration point — see
                             "Registration-order" rationale below
```

## Settings Type Shape (current, full)

```ts
type Settings = {
  is24h: boolean;
  themeMode: ThemeMode;
  asrMethod: "hanafi" | "shafi";              // Asr shadow-length CALCULATION only
  showSunrise: boolean;
  preAlarmAnchor: "start" | "jamaat";         // alarm PRE-notification timing
  alarmBackground: AlarmBackgroundStyle;       // "default"|"nightsky"|"ocean"|"sunset"|"forest"|"royal"|"playful"|"kids" (8 total)
  countdownAnchor: "start" | "jamaat";         // DISPLAY countdown only (home + widget)
  widgetStyle: "grid" | "clock";               // "arc" REMOVED — legacy saved "arc" auto-migrates to "grid"
  strongAlarmNotification: boolean;             // ongoing (non-swipeable) + longer vibration pattern
  fiqh: "hanafi" | "shafii" | "maliki" | "hanbali" | null;  // How to Pray madhab. null = not
                                                              // yet chosen, triggers a one-time
                                                              // first-launch prompt. NOT the
                                                              // same concept as asrMethod above —
                                                              // this governs full prayer-performance
                                                              // detail (hand position, Wudu, etc.),
                                                              // asrMethod only governs one
                                                              // calculation's shadow-length rule.
  illustrationGender: "male" | "female";        // How to Pray figure gender preference.
                                                  // SETTING ONLY — both currently render
                                                  // identically; a real distinction is a
                                                  // planned follow-up once gender-specific
                                                  // illustrations are generated
};
```

Note that `asrMethod` and `fiqh` are two genuinely different concepts that share superficial similarity (both are "which school of thought") — do not conflate them when making changes. `asrMethod` only ever affects one specific calculation rule (when Asr time begins, based on shadow length: Hanafi vs. Shafi'i/Maliki/Hanbali). `fiqh` governs the much broader "How to Pray" content (hand position while standing, the full Sunnah/Fard/Nafl/Wajib breakdown per prayer, Wudu when it's built, etc.) and is currently Hanafi-only (the other three madhabs are visible-but-disabled in the UI, both in the first-launch prompt and in Settings).

## Key Architectural Decisions & Why

### 1. `now` (live clock) is split into its own `NowContext`
Originally `AppContext` held a `now` field ticking every second, which caused the **entire app tree** to re-render every second — including screens with no visible clock, like the Alarm Settings sheet, whose volume slider was glitching/remounting because of this. Splitting `now` into a separate `NowContext`, used only by screens (`index.tsx`, `upload.tsx`, `editor.tsx`) that actually display a live clock, fixed this. `AppContext` itself only ticks a `dateOfMonth` value every 60 seconds, sufficient for today-row lookups.

### 2. Settings and the Timetable editor are draft-based
Both hold local `draft` state that's only committed via an explicit Save action, with a Discard/unsaved-changes warning intercepting navigation away (via `settingsGuard.ts`'s shared ref, checked by the tab bar's `screenListeners`). Deliberate UX choice to prevent silent, unintended setting changes. The Timetable editor deliberately **stays on the page** after saving (previously auto-navigated away, which was jarring) — the "Saved!" button label reverts after ~2 seconds.

### 3. Alarm scheduling vs. countdown display are deliberately decoupled
`prayerTime()` in `prayer.ts` uses a fixed, non-configurable per-prayer `ALARM_SOURCE` mapping for actual alarm-ring scheduling — this is intentionally untouched by `settings.countdownAnchor`, which only affects what the visual countdown (home screen hero + widget) displays. There is a **separate** `settings.preAlarmAnchor` field governing alarm pre-notification timing specifically. Do not conflate these three concepts when making changes here.

### 4. Lock-screen bypass is dynamic, not static (on MainActivity)
Early on, `android:showWhenLocked` was set statically in the manifest, meaning the app could bypass the lock screen any time it launched — a real security/privacy concern for normal app use. Fixed via `LockScreenModule` (native module, generated by `withLockScreenModule.js`), which toggles `FLAG_SHOW_WHEN_LOCKED` programmatically, **only** while `alarm-ring.tsx` is actually mounted. This remains the live, correct mechanism. (An unused `AlarmActivity` with a *statically*-set `showWhenLocked` was also generated this session, but Notifee was never successfully pointed at it — see `known-issues.md`. It has no launcher intent-filter, so it's inert/unreachable, and doesn't reintroduce the original security concern.)

### 5. Alarm dismiss-loop fix
`BackHandler.exitApp()` alone does not reliably kill the JS process on all devices — the app could reopen with the ring screen still as the "current route" (process cached, not truly restarted). Fix: `dismiss()` is `async`, awaits `clearAlarmNotifications()` + `clearPendingAlarm()`, calls `router.replace('/')` **first**, then `BackHandler.exitApp()`. The `alarm-ring` route also has `gestureEnabled:false` on its `Stack.Screen` to stop the OS back-swipe gesture from competing with the in-app swipe-to-dismiss gesture when an alarm fires while the app is already in the foreground.

### 6. Home screen widget: all native code generated by one config plugin
Rather than hand-writing and maintaining native Android files directly, `withHomeWidget.js` contains the Kotlin source, XML layouts, and vector drawables as template strings, written out at Expo prebuild time. This keeps the "native half" of the widget entirely version-controlled and regeneratable, and is why `rm -rf android` before rebuilding is required whenever this plugin changes.

The widget's JS↔native contract (`src/lib/widget.ts` → native `WidgetModule.updateWidgetData()`) is deliberately **display-only**: JS computes and formats everything (including per-row timestamps), and the native side just renders it. The one exception is the widget's *autonomous* "what's next" recomputation (below).

Payload shape: `{ nextLabel, nextTime, nextTimestamp, rows: [{label, time, timestamp}], nextIndex, style, tomorrowFajrTimestamp, anchor }`. Rows always include all 6 canonical prayers regardless of the in-app "show sunrise" setting, for widget layout consistency. `anchor` ("start"|"jamaat") controls whether the countdown label reads "...Start" or "...Jamaat".

**Two selectable designs now (Grid and Clock)** — the Arc design was removed entirely this session, both from the plugin (no more `WIDGET_PROVIDER_KT`/separate Arc rendering path) and from Settings' picker. Clock was merged into the SAME `SalahWidgetProvider` as a third `isClock` render mode (rather than staying a separate `SalahClockWidgetProvider`), so there's now just one provider handling both remaining styles:
- **Grid**: two-column layout, 6 prayers with custom icons, big next-time + live countdown at top.
- **Clock**: standard 24h dial (12 top, 6 left, 18 right, 24 bottom), gradient-filled face, single arrow pointing at the current prayer (updates only when a new prayer becomes current, not continuously), gold dots + labels at each prayer's position, translucent gold sector from current to next prayer.

### 7. Widget Chronometer for live countdown, not JS pushes
Android widgets can't be pushed to by the app more than the OS's own ~30-minute `onUpdate()` floor allows. A native `Chronometer` view gives a live, ticking countdown without any JS involvement after the initial `base` timestamp is set.

Two non-obvious fixes were required:
- **Chronometer showed a stray leading "-"** despite `isCountDown=true` on some devices — the combined 4-argument `setChronometer(id, base, format, isCountDown)` call doesn't reliably apply the countdown direction everywhere. Calling the separate, dedicated `setChronometerCountDown(id, true)` method as well is the documented workaround, and both are now called together.
- **`base` must be clamped to always be comfortably in the future** relative to `elapsedRealtime()` at the moment the Kotlin code runs — small timing discrepancies between when JS computed "now" and when native code actually executes could otherwise produce a technically-negative duration.

### 8. Widget autonomously recomputes "next prayer" — does not trust stale JS-pushed fields
`updateWidget()` (native, Kotlin) recomputes "next" **fresh, every time it runs** — scanning all 6 stored `rows[].timestamp` values against current wall-clock time and picking the first still-future one — rather than trusting a single precomputed field. Runs on:
1. Android's own periodic `onUpdate()` (hard OS-enforced floor of ~30 minutes; no app can make this faster).
2. A `refreshWidget()` native method, called from `registerBackgroundAlarmHandler` every time an alarm actually fires — piggybacking on the alarm system's already-precise wake timing.

Falls back to `tomorrowFajrTimestamp` once all of today's rows have passed. This mechanism is confirmed correct and working (root cause of an earlier bug here was a JS registration-order issue, not this Kotlin logic — see `known-issues.md`).

### 9. Widget icon path data: circles and straight lines only
Hard-learned rule after two separate crescent-moon icon failures (see `known-issues.md`'s "Vector Icon Path Data" section for the full story). **Hand-authored Android vector path data should only ever use the simple, verifiable two-arc full-circle formula** (`M{cx-r},{cy} a{r},{r} 0 1,0 {2r},0 a{r},{r} 0 1,0 -{2r},0`) **plus straight lines**; anything more visually complex should come from a properly-exported source (Google's Material Symbols, "Android XML" export), not derived from memory or general SVG intuition.

### 10. `KeyboardAvoidingView` behavior is `undefined` on Android, `"padding"` on iOS
`behavior="height"` on Android manually shrinks the container via JS, which conflicts with Android's own native `adjustResize` window behavior and fails to restore the layout properly once the keyboard closes. The fix is to not apply any RN-driven behavior on Android at all.

**A second, related issue surfaced later**: `edgeToEdgeEnabled: true` (app.json) makes Android's native `windowSoftInputMode=adjustResize` itself unreliable, meaning even the above fix isn't always sufficient to leave room to scroll a bottom field above the keyboard. The actual fix layered on top: `src/hooks/use-keyboard-height.ts` tracks real keyboard height via `Keyboard.addListener`, and screens with forms (`editor.tsx`, `upload.tsx`) add that tracked height to their `ScrollView`'s `paddingBottom` (Android only).

### 11. Dhikr counter: distance-along-path bead positioning, not raw x/y animation
React Native has no native `Path`/`PathMeasure` equivalent to Jetpack Compose's. The bead string/loop is manually sampled (an oval with a deliberate ~11%-of-circumference gap at the bottom, matching how a real physical tasbih's string ends) into a distance→point lookup table (~240 samples). Every bead's screen position is derived by looking up **distance along that table**, never by directly interpolating x/y coordinates. All beads share one `offset` shared value — `beadIndex × spacing + offset` — guaranteeing constant spacing at all times.

### 12. Dhikr: per-phrase persistent session counts, separate from lifetime totals
Two independent counters per phrase:
- **Session count** (`sessionCounts: Record<phraseId, number>`, plain React state, not persisted across restarts) — switching phrases no longer resets progress; only Reset clears the *currently selected* phrase.
- **Lifetime total** (`totals: Record<phraseId, number>`, persisted via `storage`, key `dhikr.totals`) — increments on every count regardless of session, **never** touched by Reset. Viewable via a dedicated modal.

### 13. Custom dhikr phrases
Stored as `DhikrItem[]` under storage key `dhikr.custom`, merged with the built-in `DHIKR_LIST` into a single `fullList` used everywhere in the screen. Added/deleted via a dedicated Add-Dhikr modal.

### 14. Registration-order: anything needing to run headless must be at true module scope in `index.js`
Notifee's background event handler needs to be registered somewhere guaranteed to run on **every** JS engine boot, including a fully-headless invocation against a killed process — not somewhere that depends on React's component tree actually mounting (e.g. inside `app/_layout.tsx`, which is an Expo Router route file that only executes when the app actually renders). `index.js` at true top-level, before `import "expo-router/entry"`, is the only place guaranteed to run in every path.

### 15. Splash screen: 3-phase animation
`CustomSplashOverlay.tsx` — Phase 1 (mount): fade+scale entrance (~550ms, `Easing.out(Easing.cubic)`). Phase 2 (idle): slow breathing pulse (scale 1.0↔1.03, 1400ms each side). Phase 3 (exit): pulse stopped, parallel fade-out + scale-up "expanding dissolve" (~420ms, `Easing.in(Easing.cubic)`).

### 16. CSV timetable format & backup removal
`src/lib/csv.ts` flexibly parses a CSV with columns like Day/Date/Hijri/Fajr Start/Fajr Jamaat/Sunrise/Zuhr Start/Zuhr Jamaat/Asr Start/Asr Jamaat/Maghrib/Isha Start/Isha Jamaat — Ramadan timetables are auto-detected via presence of "Sehri End"/"Iftari" columns. A downloadable blank CSV template exists (`src/lib/csvTemplate.ts`), written via `expo-file-system/legacy` + shared via `expo-sharing`. A prior "Backup timetable / Restore timetable" feature was deliberately **removed entirely**.

### 17. `expo-file-system` legacy import required
SDK 54's `expo-file-system` v19 moved the old function-based API (`cacheDirectory`, `writeAsStringAsync`, `EncodingType`, `documentDirectory`, `downloadAsync`, `getInfoAsync`, `deleteAsync`, `makeDirectoryAsync`) to `expo-file-system/legacy`. **All file-system code in this project imports from `/legacy`**, not the bare package — using the bare import produces `undefined` errors at the point of use.

### 18. First-launch onboarding flow
`app/onboarding.tsx`, gated by an `OnboardingGate` component inside `_layout.tsx` (`ready && !timetable && pathname not in ["/onboarding","/upload"]`, `gestureEnabled:false`). Step 1: choose "Calculate for my location" or "Import a CSV file." Step 2 (calculate path): GPS or manual-coordinates toggle, calculation method picker, Asr madhab picker, then generates one month via `generateTimetableForMonth()` + `saveTimetable()`. Permission-denied is handled with a custom modal (not `Alert.alert`) matching the app's own visual style, with an "Open Settings" button via `Linking.openSettings()` — this same custom-modal pattern is reused in `upload.tsx` for the same permission-denied case.

### 19. Streak feature — built, then fully removed
A prayer-confirmation streak feature (`src/lib/streaks.ts`, a confirm button on `PrayerCard`, `app/streaks.tsx`) was built out completely, then the person asked for it to be removed. Fully reverted, including an explicit orphaned-storage-key (`streaks.log`) cleanup added to app startup, so users who had the feature briefly don't carry dead AsyncStorage data forever. **Do not resurrect this feature from git history without discussing it first** — its removal was a deliberate product decision, not an incomplete implementation.

### 20. Alarms tab removed — Home already had full equivalent functionality
The standalone `app/(tabs)/alarms.tsx` screen was confirmed (by reading its actual source before removing it) to be functionally identical to what Home's own prayer-card list already provided — same `PrayerCard` components, same `AlarmSettingsSheet` opened via the same `onPress` handler, same sound-toggle behavior. Removed entirely; alarm configuration is now reached exclusively via tapping a prayer card on Home. This freed up a tab slot, which "How to Pray" now occupies (positioned second-to-last, right before Settings).

### 21. Tab bar order and the ad footer
Current 7 tabs, in order: Home, Qibla, Dhikr, Quran, Timetable, How to Pray, Settings. The `(tabs)/_layout.tsx` file wraps the whole `<Tabs>` navigator in a `<View style={{flex:1}}>` with a `<BannerAd>` (`ANCHORED_ADAPTIVE_BANNER`, full-width) rendered as a sibling *after* `<Tabs>` — this places the banner below the entire tab bar (not overlapping it), visible on every tab.

## AdMob / Ads Architecture

### The library version pin — load-bearing, do not change casually
`react-native-google-mobile-ads` is pinned to the **exact** version `16.3.4` in `package.json` (no `^` caret). This is not an arbitrary choice — see `known-issues.md` for the full diagnostic trail, but in short: any newer version (16.4.0+) pulls in a Google Play Services Ads SDK release that was compiled with Kotlin 2.3.0, which this project's Kotlin toolchain (2.1.0) cannot read, causing a hard native compile failure. This is a confirmed, maintainer-acknowledged upstream issue (the library is otherwise actively maintained, unlike Notifee) — the exact-pin workaround was directly recommended by the library's own GitHub collaborator in the relevant issue thread. **Do not bump this dependency without first checking whether that upstream Kotlin-version issue has been resolved.**

### AdMob App ID configuration
`app.json`'s `react-native-google-mobile-ads` plugin config uses **camelCase** keys: `androidAppId` / `iosAppId` (not `android_app_id`/`ios_app_id` — an earlier attempt used the wrong snake_case key names, which the plugin silently ignored, logging "No 'androidAppId' was provided" during every prebuild with no hard error). Currently set to Google's **test** App IDs (`ca-app-pub-3940256099942544~3347511713` for Android). **Real production App IDs and ad unit IDs have not been set up yet** — see `current-status.md`.

### Placement strategy
- **Banner**: `BannerAdSize.ANCHORED_ADAPTIVE_BANNER` (full device width, auto-calculated height — chosen over the older fixed sizes like `BANNER`/`FULL_BANNER` both for correct full-width rendering and because Google's own adaptive format tends to have better fill rate/competition than legacy fixed sizes). Rendered once, in `(tabs)/_layout.tsx`, below the tab bar — visible on every tab screen, not per-screen.
- **Interstitial**: shown on genuine tab **switches** (comparing the new route to the previously-focused one, via the existing `useNavigationState`-tracked `currentRouteName`), gated by a 2-minute cooldown since the last one shown. This deliberately follows Google's own guidance that interstitials belong at natural navigation breakpoints, not on an arbitrary background timer disconnected from user action (which was the original, rejected design — see `current-status.md`'s decision history if it's retained, or just note that the fix was made proactively before shipping, not after a policy violation). Preloads the next interstitial immediately after each one is shown/dismissed (via the `AdEventType.CLOSED` listener), so there's no load-delay the next time one is due.
- **Safety property that comes for free from the architecture**: since this interstitial logic lives inside `TabsLayout` (only mounted while the user is on a tab screen), it is structurally impossible for it to fire during `alarm-ring`, which is a separate route entirely rendered by the root `_layout.tsx`'s own stack, replacing the tabs group when active. No explicit "don't show during alarm" check was needed — it falls out of where the code lives.

## How to Pray Feature — Architecture Deep-Dive

Built this session, in several distinct passes as scope was clarified — worth reading in the order below to understand *why* it's shaped the way it is, not just what it does.

### Data model (`src/lib/howToPray.ts`)
- `Fiqh` type: `"hanafi" | "shafii" | "maliki" | "hanbali"`. Only Hanafi has real content. **`getDailyPrayersForFiqh(fiqh)` is the only way the screen should ever fetch prayer data** — it returns an empty array for any non-Hanafi fiqh rather than silently falling back to Hanafi's structure. This is deliberate: other madhabs have genuinely different rakah counts and Sunnah/Wajib classifications (e.g., Shafi'i treats Witr as Sunnah, not Wajib), so a silent fallback would show fiqh-incorrect religious content. When Shafi'i/Maliki/Hanbali content is eventually built, each needs its **own** separate `DAILY_PRAYERS_*` array — never reuse `DAILY_PRAYERS_HANAFI`.
- A `DailyPrayerInfo` (Fajr/Dhuhr/Asr/Maghrib/Isha) is not a single rakah count — it's a list of `PrayerSegment`s, since e.g. Isha has 6 distinct back-to-back complete prayer units (4 Sunnah Ghair Mu'akkadah, 4 Fard, 2 Sunnah Mu'akkadah, 2 Nafl, 3 Wajib/Witr, 2 Nafl). Each segment is its own full Niyyah-through-Taslim cycle — this reflects real Islamic practice (these are separate prayers performed consecutively, not one longer prayer), and the UI reflects this with a two-level drill-down (prayer → segment list → step detail).
- `buildSegmentSteps(segment)` and the internal `buildRakahSteps()` form one shared template engine used for **every** segment of **every** prayer, rather than hand-writing separate step lists — since the physical structure (Niyyah, Takbir, Fatiha, Ruku, Sajdah×2, Tashahhud, Taslim) is identical regardless of rakah count or classification; only rakah count, audibility, and (for Witr specifically) the Qunut step actually vary.
- **Qunut**: `PrayerSegment.qunutInFinalRakah?: boolean`, set `true` only on Hanafi Isha's Witr segment. When true, `buildRakahSteps` inserts a Qunut step (raise hands, takbir, fold hands, silently recite Dua-e-Qunut) immediately before Ruku, but **only in the segment's final rakah** — Witr's first two rakahs don't have this step at all. This detail was specifically provided by the person mid-session as a correction to an earlier, generic 3-rakah template that would have shown rakah 3 identically to rakah 1.
- **Which segments are tappable**: only `type === "fard"` and `type === "wajib"` (i.e., Fard and Witr specifically) open the full illustrated step-by-step view. Sunnah/Nafl segments are shown in the list (so the full real-world prayer structure is visible) but are visually disabled/non-interactive, since only Fard and Witr have illustrated step content built out. This was an explicit, late-session product decision, not an oversight — the person specifically wanted the fuller religious structure visible without every segment needing full illustrated detail yet.

### Illustrations (`src/components/PrayerPostureIllustration.tsx`)
**This went through two full implementations.** The first was hand-drawn SVG line art (simple geometric figures — circles for heads, lines for limbs, parameterized by a `pose` + `handPosition` prop). The person found this visually unsatisfying and provided **real illustrated artwork instead** — 10 individual PNGs, one per pose, transparent background, generated by the person (not Claude — Claude has no image-generation capability in this project's toolset) and cropped/prepared collaboratively across several rounds (composite multi-figure reference images were cropped down to single-figure assets; some crops were done by Claude via Python/PIL as a first pass, then redone more precisely by the person on their own machine using proper image tools, with backgrounds made transparent).

The component is now a simple `<Image source={require(...)}>` lookup keyed by a `PrayerPose` string union (`"niyyah" | "takbir" | "standing-navel" | "standing-chest" | "ruku" | "qaumah" | "sajdah" | "sitting" | "salaam-right" | "salaam-left"`), **not** parameterized by hand position at runtime anymore — hand position is now baked into which specific image is chosen (`standing-navel` for Hanafi, `standing-chest` exists as an asset but isn't currently used by any Hanafi step — it was one of three poses cropped from a single reference image and may be useful for a future madhab). Images are `resizeMode="contain"`, sized by height only (their natural aspect ratio is preserved, unlike the old square SVG figures).

**Known limitation, explicitly acknowledged to the person**: Claude cannot verify these transparent PNGs render correctly via its own `view` tool in every case — some renders returned rich visual detail, others (specifically RGBA/transparent ones, inconsistently) returned only a placeholder marker with no describable content. The person's own visual confirmation was relied on for the final set, and pixel-level transparency was independently verified via a Python/PIL alpha-channel check (`corner pixel alpha == 0` for all 10 files) as a partial, non-visual sanity check.

### First-launch madhab prompt vs. Settings picker
`settings.fiqh` is `null` until explicitly chosen. While `null`, opening "How to Pray" shows a one-time full-screen "Choose Your Madhab" prompt (all 4 options visible, only Hanafi tappable, others show a "Coming Soon" badge) instead of the normal screen. Once set, this prompt never shows again — changing madhab afterward happens via a dedicated "MADHAB" section in Settings (same visible-but-disabled-for-non-Hanafi treatment, chip-style picker matching the existing `widgetStyle` chip pattern).

### Audio — explicitly deferred, not built
The person asked about adding audio for each spoken step (Takbir, Thana, the Ruku/Sujood dhikr, Tashahhud, etc.). **Surah Al-Fatiha specifically could reuse the app's existing Quran audio infrastructure directly** (it's just Surah 1, already fully supported by `quran.ts`'s reciter/download system) — this was identified but not implemented. **Every other spoken phrase has no existing audio source in the app at all** (they're prayer-specific supplications, not Quranic Surahs, so they're outside the MP3Quran.net reciter database entirely) — Claude has no way to generate or source this audio itself; the person will need to record/source these separately and provide them, the same collaborative pattern used for the illustrations. This is a clearly identified, deliberately deferred future task, not a bug.

## Debugging Native Build Failures Directly (learned this session, genuinely useful going forward)

When `eas build --local` fails with an opaque summary (e.g. "Compilation error. See log for more details" with no further detail), a much faster and more informative loop than repeating full EAS builds is:

```bash
npx expo prebuild --platform android    # regenerate android/ if needed — it's often already gone
cd android
./gradlew :module:name:compileReleaseKotlin --stacktrace --no-daemon --rerun-tasks > /tmp/log.txt 2>&1; echo "DONE, exit code: $?"
grep -n "^e:" /tmp/log.txt              # Kotlin's own error-line prefix — the REAL diagnostic
```

Notes learned the hard way this session:
- **Always wait for the `DONE, exit code: N` line to actually print** before inspecting the log — checking mid-run produces a truncated, misleading log that looks like a different (and confusing) failure.
- **Use `--no-daemon --rerun-tasks` for anything you need a definitively fresh answer from** — a cached/incremental run can produce a false "no error" result that doesn't reflect a truly clean build.
- **The `^e:` grep pattern isn't guaranteed to catch everything** — if it comes back empty but the build still failed, check `grep -n "FAILURE:\|BUILD FAILED"` and read a wider window around it; some failure types (dependency resolution, plugin configuration) don't use the `e:` prefix at all.
- Gradle's own dependency-version metadata is directly queryable and a better source of truth than guessing plausible version numbers: `curl -s https://dl.google.com/android/maven2/<group-path>/<artifact>/maven-metadata.xml` lists every real published version of a Google-hosted artifact.
- **Path context matters a lot in this workflow** — the person frequently ran commands from the wrong directory (`android/` vs `frontend/`) because multi-step instructions spanning several messages made it easy to lose track of `cd` state. When giving a sequence of commands across a conversation, prefer being explicit about the expected current directory, or include a `pwd`/`cd` as the first line of any new command block after several turns have passed.

## Environment Setup

- WSL2 Ubuntu, cloned at `~/salah-alarm` on WSL's **native filesystem** (not `/mnt/c/...`).
- `adb` accessed via Windows-side platform-tools: `/mnt/c/RSL/platform-tools/adb.exe`.
- Git auth: `git config --global credential.helper store` (PAT-based).
- `npm install <pkg>` must be run **inside WSL**, separately from any Windows-side `package.json` edits.
- `pip`/Python isn't part of this stack; all tooling is Node/npm/EAS CLI based (Python is only used ad-hoc for one-off JSON validation and file-patching scripts written specifically for this collaborative copy-paste workflow, not as part of the app itself).

## Deployment / Build Process

1. Make code changes (or apply a config-plugin change).
2. If a config plugin, `app.json` plugin/permission config, or any *native* dependency changed: `rm -rf android` (forces clean native prebuild).
3. `git add . && git commit -m "..." && git push`
4. `eas build -p android --profile preview --local` — produces a local `.apk`, no cloud build minutes used. Takes 5–10 minutes with no visible output unless tailed.
5. Install: `"/mnt/c/RSL/platform-tools/adb.exe" install -r "$(ls -t *.apk | head -1)"`
6. Manual test on-device (no automated test suite — see `current-status.md`).

No app-store submission process has been set up yet — builds are `preview` profile, sideloaded via `adb install`, for the developer's own testing only.

## Testing Process

There is **no automated test suite**. All verification is manual, on a physical Vivo Android device, via:
- Building and sideloading a fresh APK after each change.
- `testID` props throughout the codebase to support manual/future automated interaction.
- `adb logcat` capture-and-grep for diagnosing anything not visibly obvious from the UI.

## Coding Conventions Observed In This Codebase

- Functional components, hooks-based, no class components anywhere.
- Inline `StyleSheet.create` per file, colocated at the bottom.
- Theme colors accessed via `useApp().colors` (light/dark aware) for normal screens; a few screens (alarm-ring, Quran's Now Playing) deliberately use a **fixed** hardcoded dark palette regardless of app theme, for an immersive full-screen experience — this is an intentional, precedented pattern, not an oversight.
- `testID` on nearly every interactive element, named `kebab-case` and often prefixed by feature (`quran-play-${n}`, `dhikr-reset-btn`, `how-to-pray-${prayerKey}`, `how-to-pray-segment-${segId}`, `fiqh-${madhab}`, etc.).
- Config plugins (`plugins/*.js`) contain their native Kotlin/XML source as JS template strings, written to disk at prebuild time via `withDangerousMod`/`withAndroidManifest`/`withMainApplication` from `@expo/config-plugins`. This is the established pattern for **any** new native functionality in this project — prefer this over adding a third-party native library, given this project's demonstrated New-Architecture compatibility risk with unmaintained/older native libraries.
- Liberal, detailed inline comments explaining *why*, not just *what* — especially for anything that was the result of a real debugging session. This convention should be continued; it is what makes this codebase navigable across sessions with no persistent memory.
- Storage keys are short, dot-namespaced strings (`dhikr.totals`, `dhikr.custom`, `quran.audioEditions.v3`, `upload.seenInstructions`) — versioned with a suffix (`.v2`, `.v3`) when the cached data shape changes incompatibly, so stale cached data from before the change can't silently cause a crash.
- Any file-patching Python script written to apply a code change should include a hard `MISMATCH` guard (compare exact expected old text, abort with no changes if not found or not unique) rather than a fuzzy replace — this project's workflow depends on these scripts failing loudly rather than silently corrupting a file, given the person cannot read the diff themselves.

## Android-Specific Workarounds (Summary Table)

| Issue | Workaround |
|---|---|
| Whole-app re-render every second | Split `now` into separate `NowContext` |
| App bypassing lock screen during normal use | Dynamic `LockScreenModule` toggle, alarm-ring screen only |
| Alarm dismiss → app reopens stuck on ring screen | `router.replace('/')` before `exitApp()`, awaited AsyncStorage clear first |
| Stack swipe-back competing with alarm swipe-to-dismiss | `gestureEnabled:false` on the alarm-ring route |
| Widget can't be updated frequently by the OS | Native `Chronometer` for live countdown, not JS pushes |
| Chronometer shows stray "-" despite isCountDown=true | Call both `setChronometer(...)` and `setChronometerCountDown(...)` |
| Widget goes stale between app opens | Autonomous recompute-from-stored-rows in Kotlin + alarm-triggered refresh |
| `KeyboardAvoidingView` footer doesn't restore on Android | `behavior={Platform.OS === "ios" ? "padding" : undefined}` |
| `edgeToEdgeEnabled` breaks native `adjustResize` reliability | Manual keyboard-height tracking hook, added to ScrollView padding |
| Vivo (and other OEMs) suppress `BOOT_COMPLETED` for non-whitelisted apps | Explicit Autostart-permission instructions in Settings; app re-schedules alarms on every open as a fallback |
| Swiping the app away from recents kills headless JS execution | Native notification/sound (AlarmManager) still fires; full-screen ring UI and widget fast-refresh won't run in this state |
| Notification `PendingIntent.getService()` silently fails when app is backgrounded (Android 8+) | Use `PendingIntent.getForegroundService()` instead for notification action buttons targeting a foreground service |
| `expo-file-system` bare import breaks on SDK 54 | Import from `expo-file-system/legacy` everywhere |
| `react-native-track-player` v4 crashes on New Architecture | Abandoned; replaced with `expo-audio`'s own built-in `setActiveForLockScreen` support |
| Expo config plugin referenced for a package with no plugin | Confirm the package actually ships a plugin before adding it to `app.json`'s `plugins` array |
| AdMob plugin config keys wrong (snake_case instead of camelCase) | `androidAppId`/`iosAppId`, not `android_app_id`/`ios_app_id` — the plugin silently ignores unrecognized keys with only a log warning, no hard error |
| `react-native-google-mobile-ads` 16.4.0+ requires Kotlin 2.3.0, project has 2.1.0 | Pin exact version `16.3.4` in `package.json` (maintainer-confirmed workaround) |
| Full-screen alarm intent doesn't auto-show over a locked screen (Android 12+) | Not resolved — appears to be a genuine Android 12+ OS restriction (device must already be unlocked for a notification to launch an Activity at all), not a Notifee misconfiguration. See `known-issues.md`. |
| Custom `launchActivity` string for Notifee broke notification-tap entirely | Reverted to `"default"` (MainActivity). No verified-working custom Activity approach found this session — do not retry without real evidence first. |

## Debugging Philosophy (unchanged, reconfirmed this session)

Get real evidence before proposing a fix, especially for anything that fails silently. The single most effective technique has been: add a targeted `Log.d` (Kotlin) or `console.log`/error-surfacing (JS) right at the suspected point of failure, get the user to reproduce the issue while capturing `adb logcat`, then grep for the relevant tag — or, for build failures specifically, get the exact compiler error text via a direct `gradlew` invocation rather than trusting a cloud build summary. This session's AdMob Kotlin-version diagnosis is a clean example of this working end-to-end: EAS's own build log never showed the real error; a direct `gradlew --stacktrace` + `grep "^e:"` did, immediately.

**Also reconfirmed this session, the hard way**: guessing at native Android Activity/Intent behavior without a verified source caused a real regression (notification-tap stopped working entirely). The corrective action — revert immediately, don't keep debugging on top of a broken build — is itself a lesson worth preserving: when a change to safety-critical native behavior (this app's core purpose is waking someone up) causes an unexpected regression, prioritize getting back to a known-working state over continuing to iterate on the broken one.
