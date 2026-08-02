# Current Status

## Completed Milestones (roughly chronological)

1. Core prayer timetable app: CSV import, manual editing, alarm scheduling via Notifee.
2. Reliable alarms in background/killed app states, including full-screen intent ring UI.
3. Removed original OCR/backend (emergentintegrations, MongoDB, Gemini) — app is now fully client-side.
4. Prayer time calculation by GPS/manual location, 25 calculation methods, timezone-correct display.
5. Alarm dismiss-loop and lock-screen-bypass security fixes.
6. Qibla compass, with vibration correctly scoped to only fire while that tab is focused; multiple rounds of heading-smoothing tuning.
7. Dhikr/Tasbih counter — realistic sliding-bead animation, per-phrase persistent session counts, lifetime totals, custom user-added phrases.
8. Settings save/discard workflow with unsaved-changes navigation guard.
9. Alarm-ring background themes, expanded to 8 total (Default, Night Sky, Playful, Kids, Ocean, Sunset, Forest, Royal).
10. Home screen widget — **Grid and Clock designs** (Arc was built, then later removed entirely this session — see below), custom icon set, live native Chronometer countdown, autonomous next-prayer detection, tap-to-open.
11. OEM-specific battery/autostart instructions in Settings (Vivo, Xiaomi, others via `expo-device` brand detection).
12. Hanafi/Shafi Asr method: instant recalculation without re-opening the method picker; active method indicator.
13. Countdown-anchor setting (start vs. jamaat) separated cleanly from alarm-scheduling logic, confirmed working end-to-end including the widget.
14. Widget auto-advance reliability — root cause found and fixed (a stub background-event handler silently overriding the real one during fully-killed cold starts).
15. Custom splash screen with 3-phase entrance/idle/exit animation.
16. **Quran feature, built from scratch** — Read mode (Al Quran Cloud text API, by-Surah or by-Juz, later expanded to a full 604-page Mushaf layout reader), Listen mode (MP3Quran.net audio API), Now Playing screen (vinyl disc with Bismillah calligraphy), full download management, and — after a significant architecture detour through a since-abandoned `react-native-track-player` integration — **real, confirmed-working background playback with lock-screen/notification controls via `expo-audio`'s own built-in support**. This was the single open item at the start of this session and is now fully resolved.
17. **Quran feature, further expanded**: background playback toggle, sleep timer (5/10/15/30/45/60 min presets), Continue Listening (resumes exact position, saved on pause/every 15s/new-Surah-start), "play in background while reading" (QuranScreen now owns all player state; Read and Listen tabs stay permanently mounted via display-toggle rather than unmount/remount, so switching modes doesn't interrupt playback or lose the Read tab's in-memory whole-Quran cache), reciter name spelling corrections.
18. First-launch onboarding flow (`app/onboarding.tsx`) — choose GPS/manual-coordinates/CSV, calculation method, Asr madhab; custom (not `Alert.alert`) permission-denied modal.
19. Home screen monthly calendar view (full-screen scrollable table of the month's prayer times).
20. A prayer-confirmation streak feature was built, then **deliberately fully removed** at the person's request, including orphaned-storage cleanup.
21. Settings: alarm background picker grid layout cleanup, "Strong Alarm Notification" toggle (non-swipeable + longer vibration, compensating for Android's restriction on auto-launching full-screen UI while the phone is actively in use), reciter name overrides.
22. **AdMob integration** — real, working banner (adaptive, full-width, below the tab bar on every screen) and interstitial (tab-switch-triggered, 2-minute cooldown) ads, using Google's **test** ad unit IDs. Required a genuinely difficult debugging session (see `known-issues.md`) to resolve a Kotlin-version incompatibility between the ads library and the project's toolchain — root-caused via a maintainer-confirmed GitHub issue, fixed by pinning `react-native-google-mobile-ads` to an exact older version (`16.3.4`).
23. **Alarms tab removed** — confirmed functionally redundant with Home's own prayer-card list (same components, same behavior), removed entirely. Tab bar reordered to 7 tabs: Home, Qibla, Dhikr, Quran, Timetable, How to Pray, Settings.
24. **"How to Pray" feature — built from scratch this session**, currently Hanafi-only:
    - First-launch madhab-choice prompt (only Hanafi selectable; other 3 madhabs visible but disabled with a "Coming Soon" badge), changeable afterward via a new Settings section.
    - Category-grouped main list: Daily Prayers (real content) plus Wudu/Taraweeh/Tahajjud/Janazah/Eid shown as disabled "Coming Soon" placeholders (structure exists, content doesn't yet).
    - Full Sunnah/Fard/Nafl/Wajib segment breakdown per daily prayer (e.g. Isha's 6 separate units), not just the Fard rakah count — reflecting real Hanafi practice where each is a separate complete prayer.
    - Illustrated step-by-step walkthrough (Niyyah through Taslim, with the Qunut step correctly scoped to only Witr's final rakah) for Fard and Witr segments specifically (the two segment types currently tappable).
    - Real illustrated artwork (10 individual pose images, provided and refined by the person across several rounds) replacing an initial hand-drawn SVG version.
    - A gender-preference setting for the illustrations exists in Settings but is not yet functionally wired to distinct artwork (both options currently render identically) — explicitly scoped this way to avoid doubling the person's image-sourcing workload until they're ready.

## Feature-by-Feature State

| Feature | Status |
|---|---|
| CSV timetable import | ✅ Working, confirmed |
| Calculate-by-location (GPS/manual) | ✅ Working, confirmed |
| First-launch onboarding | ✅ Working, confirmed |
| Hanafi/Shafi instant recalc | ✅ Working, confirmed |
| Timetable save/stay-on-page | ✅ Working, confirmed |
| Home monthly calendar view | ✅ Working, confirmed |
| Alarm background themes (8) | ✅ Working, confirmed |
| Alarm dismiss loop (foreground + background) | ✅ Working, confirmed |
| Alarm notification always fires reliably (locked or unlocked) | ✅ Working, confirmed |
| Alarm notification tap → opens app to swipe screen | ✅ Working, confirmed (after being briefly broken and reverted this session — see `known-issues.md`) |
| Full-screen swipe UI auto-appearing while phone is **locked** | ✅ Working, confirmed — notification shows, swipe screen appears on unlock |
| Full-screen swipe UI auto-appearing while phone is **unlocked** (active or idle) | ❌ Does not happen — confirmed as a genuine Android 12+ OS restriction, not pursuing further (see `known-issues.md`) |
| Strong Alarm Notification toggle | ✅ Working, confirmed |
| Lock screen security (no bypass outside alarm-ring) | ✅ Working, confirmed |
| Widget — Grid / Clock designs | ✅ Both confirmed working; Arc removed entirely |
| Widget — live Chronometer countdown | ✅ Working, confirmed |
| Widget — autonomous next-prayer advancement | ✅ Working, confirmed |
| Widget — respects `countdownAnchor` setting | ✅ Working, confirmed |
| Vivo Autostart guidance in Settings | ✅ Added; residual post-reboot edge case still open (see `known-issues.md`) |
| Dhikr — sliding beads, custom phrases, session + lifetime counts | ✅ Working, confirmed |
| Qibla — compass smoothing | ✅ Working |
| Splash screen animation | ✅ Working |
| Quran — Read mode (Surah + Juz + full Mushaf page layout) | ✅ Working, confirmed |
| Quran — Listen mode, reciter list | ✅ Working, confirmed |
| Quran — Now Playing screen | ✅ Working, confirmed |
| Quran — download system | ✅ Working, confirmed |
| Quran — **background playback + lock-screen/notification controls** | ✅ **Confirmed working end-to-end** — this was the single incomplete item at the start of this session |
| Quran — sleep timer, Continue Listening, play-in-background-while-reading | ✅ Working, confirmed |
| How to Pray — madhab prompt + Settings picker | ✅ Working, confirmed |
| How to Pray — category list + segment structure | ✅ Working, confirmed |
| How to Pray — Fard/Witr illustrated step walkthrough | ✅ Working, confirmed |
| How to Pray — Qunut step (Witr rakah 3 only) | ✅ Working, confirmed |
| How to Pray — real artwork (not SVG placeholders) | ✅ Working, confirmed |
| How to Pray — audio for spoken steps | ❌ Not built — explicitly deferred (see below) |
| How to Pray — Wudu/Taraweeh/Tahajjud/Janazah/Eid content | ❌ Not built — structure exists, content doesn't |
| How to Pray — Shafi'i/Maliki/Hanbali content | ❌ Not built — architecture explicitly supports adding this without restructuring |
| Ads — banner (adaptive, every tab) | ✅ Working, confirmed — **test ad unit ID**, not production |
| Ads — interstitial (tab-switch, 2-min cooldown) | ✅ Working, confirmed — **test ad unit ID**, not production |
| Ads — production ad unit IDs | ❌ Not set up — see "Immediate Next Steps" |

## Immediate Next Steps

None of these are "in progress, broken" — everything above is in a stable, working state. These are the clearly-identified next things to pick up, in no particular required order (the person can choose):

1. **Real AdMob IDs.** Currently using Google's test App ID and test ad unit IDs throughout. The person has an AdMob account; needs to navigate to Apps → Add app → Ad units → create real Banner + Interstitial units, then swap the test IDs in `app.json` (App ID) and `(tabs)/_layout.tsx` (ad unit IDs) for the real ones.
2. **How to Pray — audio for spoken steps.** Surah Al-Fatiha's step could reuse the existing Quran audio system directly (it's just Surah 1). Every other spoken phrase (Takbir, Thana, Ruku/Sujood dhikr, Tashahhud, Salawat, Taslim) needs the person to source/record audio clips — Claude has no capability to generate or find these. Once provided, wiring them in is a straightforward addition to the existing step data structure.
3. **How to Pray — Wudu, Eid, Janazah, Tahajjud, Tarawih content.** The category structure and "Coming Soon" placeholders already exist; each needs its own dedicated content (these have genuinely different structures from the daily-prayer rakah template, not just a rakah-count variation).
4. **How to Pray — Shafi'i/Maliki/Hanbali content**, once the person is ready to tackle each. Architecture (`getDailyPrayersForFiqh`) is explicitly built to support this without restructuring, but each madhab needs its own verified segment data and (per the person's stated plan) its own image set for anything with a genuine physical difference from Hanafi.
5. **How to Pray — gender-specific illustrations**, if/when the person generates a second set of images. The Settings toggle already exists; only the image-selection logic in `PrayerPostureIllustration.tsx` needs updating to branch on it once real assets exist.
6. **App rename** — changing both display name and Android package identifier before any public release (this is a one-way decision once published, so needs to happen before Play Store submission). Mentioned as a goal; no work started, no new name/package chosen yet.
7. **Subscription paywall** (`react-native-iap`), gating custom alarm backgrounds + the Clock widget behind a subscription. Needs a Play Console subscription product created first. No work started.
8. **Play Store submission process** — production AAB build, store listing, privacy policy, data safety form, internal testing track. No work done yet.
9. **Automated testing** — currently 100% manual, on-device. `testID`s exist throughout in anticipation of this, but no test runner/framework has been set up.
10. **Post-reboot alarm reliability on Vivo** — residual open issue, not fully diagnosed with logs yet (see `known-issues.md`).

## Explicitly Decided Against / Deferred (don't re-litigate without new information)

- **A custom native `AlarmActivity` to fix full-screen-timing on locked phones** — attempted this session, caused a real regression (notification tap stopped working), reverted. The underlying Android 12+ restriction (full-screen intents need the device unlocked) is treated as accepted platform behavior for now, not something to keep chasing, especially since Notifee is now archived/unmaintained. If revisited, needs actual verified evidence of Notifee's expected `launchActivity` string format first — see `known-issues.md`.
- **Full-body 3D illustrations for How to Pray** — Claude has no 3D rendering capability; 2D illustrations (initially SVG, now real artwork provided by the person) were used instead, explicitly agreed with the person as an acceptable substitute.
- **A fixed-interval (e.g. "every 2 minutes regardless of context") interstitial ad timer** — the person's original request, changed proactively to a tab-switch-triggered design after a policy-risk discussion, since Google's own guidance discourages interstitials disconnected from natural navigation breakpoints.
