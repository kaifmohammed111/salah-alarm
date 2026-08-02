# Known Issues, Platform Limitations & Process Pitfalls

## Currently Open

### 1. Full-screen alarm swipe UI doesn't auto-appear while the phone is unlocked, and doesn't auto-appear while locked either without a manual unlock first
Extensively investigated this session. Confirmed behavior across all four combinations of (app swiped away from recents vs. still running) × (screen off/locked vs. screen on/unlocked):
- **Phone locked** (screen off, or on the lock screen): notification always shows reliably. The full-screen swipe UI does **not** auto-appear the instant the alarm fires — it only becomes visible once the user manually unlocks the phone, at which point it's there correctly.
- **Phone unlocked** (whether actively in use or just idle — both were explicitly tested, including a 60-second idle test): only the notification shows. The full-screen swipe UI never auto-appears in this state at all.

**Root cause (moderate-to-high confidence, not independently verified against Android's own official docs, but corroborated by a specific, matching community report)**: a community member's response (while researching a related Notifee GitHub issue) stated that Android 12+ requires the device to already be **unlocked** before a notification can launch an Activity at all — not "not actively in use," specifically "unlocked." This is consistent with everything observed: notification delivery itself is never the problem (confirmed reliable in every state), and the swipe screen becomes reachable exactly at the moment of unlock, not before.

**An attempted fix made things worse and was reverted** — see the regression entry below. This is now being treated as an accepted platform limitation rather than something to keep chasing, especially given Notifee's own maintenance status (see below). The existing "Strong Alarm Notification" toggle (non-swipeable, longer vibration) is the current mitigation.

**If revisited**: do not guess at a `launchActivity` string format again. Either find a *confirmed working* example (a GitHub issue where someone posted a value AND a follow-up confirming it worked — this was searched for this session and not found), or inspect Notifee's actual compiled/native source for how it parses that field (not just its TypeScript type definitions, which only describe the shape, not the expected string format) before writing any code.

### 2. Notifee is now archived / unmaintained
Discovered this session (via the person's own GitHub research, not something Claude independently knew) — the `@notifee/react-native` repository is archived as of April 2026. It is **still working correctly** for everything currently implemented (scheduling, background delivery, notification display, tap-to-open) and there is no urgency to migrate. This matters for the future: no new fixes will come from upstream if a future Android version breaks something. A community fork, `react-native-notify-kit`, was surfaced during this research (claims to fix several related alarm-reliability issues — async `BroadcastReceiver` timing, alarm-type/Doze-mode handling — and has the same API surface as Notifee, making it a comparatively low-effort migration if ever needed) but has **not** been independently vetted (maintenance activity, code quality, real-world reliability) and was deliberately not adopted this session given the working state of the current implementation and the risk of migrating something safety-critical for no current, forcing reason. If Notifee ever does need to be replaced, this fork is the most promising lead found so far, but treat it as a starting point for research, not a pre-vetted recommendation.

### 3. Post-reboot alarm reliability on Vivo — residual case, not fully diagnosed
Vivo (and other aggressive OEMs) suppress the `BOOT_COMPLETED` broadcast for apps not on the user's Autostart whitelist. Explicit guidance to enable Vivo's separate "Autostart" permission was added to Settings. The user reported the issue could still occur even with Autostart already enabled at least once — this specific residual case has not been diagnosed with logs yet. **Next step if revisited: get a real logcat capture spanning an actual device reboot + first alarm, using the same evidence-first approach that resolved the widget bug — don't guess blind.**

## Resolved This Session (with root cause — do not re-diagnose from scratch)

### AdMob / react-native-google-mobile-ads: "Module was compiled with an incompatible version of Kotlin" — RESOLVED
**Symptom**: `:react-native-google-mobile-ads:compileReleaseKotlin` failed with `Module was compiled with an incompatible version of Kotlin. The binary version of its metadata is 2.3.0, expected version is 2.1.0.` EAS's own build log summary never showed this — only a generic "Compilation error. See log for more details." The real error was only found by regenerating `android/` via `expo prebuild` and running `gradlew :react-native-google-mobile-ads:compileReleaseKotlin --stacktrace` directly, then grepping the raw log for `^e:`.

**Investigation path** (worth knowing, since parts of it are genuinely reusable technique even though the specific fix attempted mid-investigation was abandoned):
1. Confirmed the AdMob App ID config keys were also wrong (`android_app_id`/`ios_app_id` instead of the correct camelCase `androidAppId`/`iosAppId`) — fixed this first, but it did **not** resolve the Kotlin error; it was a separate, real bug found along the way.
2. Attempted to fix the Kotlin mismatch by pinning `com.google.android.gms:play-services-ads` to progressively different versions via a Gradle `resolutionStrategy { force ... }` block, bisecting between a real published version list (fetched directly from `https://dl.google.com/android/maven2/com/google/android/gms/play-services-ads/maven-metadata.xml`, not guessed). This **conclusively proved there is no version that works**: 25.2.0 and older are missing a class (`AgeRestrictedTreatment`) the wrapper library's own Kotlin code requires; 25.3.0 and newer require Kotlin 2.3.0. There is no overlap — pinning the underlying ads SDK alone cannot fix this.
3. Searched the `react-native-google-mobile-ads` GitHub issues directly for the exact error text and found an exact match, pinned by a maintainer, with a confirmed community-reported fix: **pin `react-native-google-mobile-ads` itself to exactly `16.3.4`** (no caret) in `package.json`. This version predates the wrapper library's own upgrade to a newer Play Services Ads default that requires Kotlin 2.3.0. Confirmed working on a real device after applying.

**Fix in place**: `"react-native-google-mobile-ads": "16.3.4"` (exact, no `^`) in `package.json`. **Do not upgrade this dependency without first checking whether Google has released a Kotlin-2.1-compatible version of the underlying ads SDK, or whether the wrapper library has published guidance for using a newer version safely.**

### Full-screen alarm on locked phone — attempted native Activity fix — REGRESSION, REVERTED
**What was attempted**: pointing Notifee's `fullScreenAction`/`pressAction` `launchActivity` at a newly-created, dedicated `AlarmActivity` (with `showWhenLocked`/`turnScreenOn` set statically in its own manifest entry, safe to do since it has no launcher intent-filter) instead of `"default"` (MainActivity), reasoning that MainActivity's *dynamic* lock-screen-bypass toggle (via `LockScreenModule`, only applied once JS actually runs) was too slow on a cold start to take effect before Android decided whether to show over the lock screen.

**What actually happened**: after this change, tapping the alarm notification manually did **nothing at all** — not slow, not degraded, completely non-functional. This is a regression from previously-working behavior (tapping the notification used to reliably open the app).

**Resolution**: reverted `fullScreenAction`/`pressAction`'s `launchActivity` back to `"default"` immediately upon discovering this, rebuilt, and confirmed notification-tap worked correctly again before doing anything else. The `AlarmActivity.kt` file and its manifest entry generated by `withAlarmActivity.js` were left in place (harmless, unreachable dead code — no launcher intent-filter means nothing can accidentally invoke it), but Notifee is **not** pointed at it.

**Why this matters as a lesson, not just a fix**: no verified-correct string format for Notifee's custom `launchActivity` was ever found, despite genuinely trying (GitHub issue search, checking TypeScript type definitions, attempting to find the native source). The type definitions only describe the field as `string`, with no documented format example anywhere found. **Do not re-attempt this without first finding a confirmed-working example from someone else, or being prepared to test extremely cautiously (e.g., a debug build tested by the developer personally before considering it for the person's daily-use device) given how safety-critical this is.**

### Quran background playback — RESOLVED (was the single open item at the start of this session)
`expo-audio`'s own built-in `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" })` + `player.setActiveForLockScreen(true, { title, artist })` approach (which replaced an earlier custom native module, which itself replaced an abandoned `react-native-track-player` integration) is **confirmed working end-to-end** on a real device this session: playback continues after pressing home, a system notification with controls appears, lock-screen controls work, and playback survives well beyond the previous 3-minute background limit. The previously-open uncertainty about whether Next/Previous appear on a single-track `AudioPlayer`'s lock-screen controls (as opposed to a queue-aware `AudioPlaylist`) was not specifically re-tested/reported on this session, but is no longer blocking — in-app shuffle/next/prev/repeat controls work regardless and are the primary interaction method.

## Resolved (Prior Sessions — Preserved for Reference, Do Not Re-Diagnose)

### Widget doesn't always auto-advance to the next prayer — RESOLVED
Root cause found via logcat, not guessing: `index.js` registered its own empty `notifee.onBackgroundEvent()` stub, added purely (per its own old comment) "so Android's headless task lookup succeeds." Notifee only supports a single registered background handler at a time. The *real* handler (`registerBackgroundAlarmHandler()` in `src/lib/alarm.ts`) was being registered at true top-level in `app/_layout.tsx` — but Expo Router route files only actually execute once the JS engine renders the app, which never happens during a pure Notifee headless-task invocation. `index.js`'s stub, sitting before `expo-router/entry` is even imported, was the only thing guaranteed to run on every JS boot — so it silently won in exactly the cold-start scenario that mattered most.

**Fix:** moved `registerBackgroundAlarmHandler()` into `index.js` at true module scope (before `import "expo-router/entry"`), removed the dead stub.

### `countdownAnchor` (start vs. jamaat) widget fix — RESOLVED
A previous session's summary had claimed this was fixed; it wasn't actually present in the real file. Confirmed via a fresh `cat` of the real `index.tsx`: the widget-push effect's row-timestamp computation was hardcoded to `.start` for every row, and `settings.countdownAnchor` was missing from the effect's dependency array entirely. Both fixed.

### Dhikr counter resetting on phrase switch, missing custom phrases, modal scroll bug — RESOLVED
All three traced to the same root cause: a full rewrite had been designed and described as complete in a prior session's summary, but the deployed file had never actually received it. Rewrote for real.

### Lifetime-totals modal scroll bug — a "fix" that was itself the bug — RESOLVED (twice)
Claiming the touch responder at a parent `View` level and refusing to release it meant the child `ScrollView` could never claim its own scroll gesture. Correct fix: no special touch handling on the wrapping `View` at all.

### Quran Juz reading — "Could not load this Juz" — RESOLVED
Al Quran Cloud's multi-edition endpoint (`/editions/ed1,ed2`) works for `/surah/` but not `/juz/` (single-edition only). Fixed by making two separate single-edition requests and combining client-side.

### Quran audio — some reciters wouldn't play — RESOLVED
Switched from Al Quran Cloud's audio CDN (unreliable per-ayah-vs-full-Surah distinction) to MP3Quran.net, filtered to only reciters with a complete 114/114 Surah set.

### Quran reciter names showing in Arabic — RESOLVED
MP3Quran.net's `language` parameter needed `eng`, not `en` or `ar`.

### `react-native-track-player` Kotlin compile error, then TurboModule crash — led to full removal
Two separate, sequential problems: a Kotlin null-safety compile error (patched via `patch-package`, got it compiling), then a deeper structural TurboModule interop incompatibility with New Architecture (no available fix without a commercial v5 license). Library fully removed; replaced by `expo-audio`'s own built-in background/lock-screen support (see above — this is the approach confirmed working this session).

### Invalid Expo config plugin reference crashed `expo config` resolution silently — RESOLVED
Referencing a package with no actual Expo config plugin in `app.json`'s `plugins` array produced a completely empty, silent failure. Verify a package actually ships a plugin (check for `app.plugin.js` or a `plugin` field) before referencing it.

## Platform Limitations (Not Bugs — Can't Be Fully Fixed)

- **Android widgets cannot be updated more frequently than ~30 minutes** via `onUpdate()`/`updatePeriodMillis` — an OS-enforced floor for battery reasons.
- **Swiping the app away from recents prevents Notifee's headless JS background handler from running at all**, even though native notification delivery still fires correctly. The full-screen ring UI won't launch, and the widget won't get the fast alarm-triggered refresh, in that specific state.
- **True native lock-screen widgets don't exist on modern Android** (removed since Android 5.0 for third-party apps).
- **`BOOT_COMPLETED` suppression on aggressive OEMs** (Vivo, Xiaomi, Samsung, Huawei) is a manufacturer-level restriction, not fixable purely in-app.
- **Android's system media notification (`MediaStyle`) only supports a small, fixed set of standard transport buttons** — no standard "shuffle" button, which is why the Quran feature's shuffle/repeat are in-app-only (same as Spotify/Apple Music/YouTube Music).
- **Full-screen alarm intents will not auto-display over a locked screen without the device already being unlocked, on Android 12+** — confirmed this session across all four app-state/screen-state combinations. See "Currently Open" #1 above. Not something further in-app code changes are expected to fix.
- **Google's AdMob policy discourages interstitial ads on a fixed timer disconnected from user action** — not a technical limitation, but a real business-risk constraint that shaped this session's ad-placement design (tab-switch-triggered instead of a background timer).

## Recurring Process Pitfalls (For Whoever Continues This Project)

### Stale file copies going undetected
By far the most time-costly recurring issue on this project. The pattern: a file is generated and presented for download, the user copies it via `cp` from their Downloads folder, but either downloads an old cached version or the copy silently doesn't take — and this goes unnoticed until a build fails with a confusing error, or worse, a feature silently doesn't work at runtime with no error at all.

**Mitigation that works:** after every `cp`, immediately `grep -c` for a distinctive string unique to the new content, before proceeding to build. Never assume a copy succeeded just because the command didn't error. **A related, newly-observed variant this session**: giving a file a fresh, never-before-used filename (e.g. appending `_v2`) when re-sending a corrected version is a reliable way to sidestep browser-download caching issues specifically — this was used successfully several times this session after a first version failed to apply correctly.

### Patch-script anchors go stale silently, sometimes causing actual corruption (not just a failed-to-apply error)
The most instructive incident this session: a Settings section ("Madhab") was accidentally **duplicated** in the deployed file. Root cause: a Python patch script's "old" anchor text was *also present, unchanged, in the file's new state* after a first successful application (because the replacement text preserved a trailing chunk of original content verbatim). A second, redundant run of essentially the same script found that same anchor again — still valid, still unique — and inserted a second copy. **This was not caught by the script's own MISMATCH guard**, because the guard only checks whether the anchor text exists and is unique, not whether the *intended* one-time change has already been applied. When designing a patch script, prefer anchoring on text that will **not** still exist verbatim after the change is applied (or design the new content so it doesn't end with an unchanged copy of the old anchor's tail), and when in doubt, grep for a marker specific to the *new* content first, to check for pre-existing application, before writing a script that assumes a clean "before" state.

### Assistant's local working copy drifting from the user's real file
During long sessions with many edit rounds on the same file, the assistant's own local reference copy can fall out of sync with what the user actually has on disk. **Mitigation that works:** for any file that's been through many edit rounds, periodically re-`cat`/`grep` the actual current file from the user rather than trusting an accumulated local copy, especially before a large rewrite. This exact pattern repeated multiple times *within a single session* this time (not just across session boundaries as previously documented) — e.g., building an entire "disable non-Hanafi madhabs + add Fard-only-tappable + add Qunut step" consolidated rewrite on the assumption a prior version (`v4`) had already been applied, only to discover via a fresh `wc -l`/`grep` that it never had been.

### Silent JS↔native failures need logging on both sides, not just one
A successful call and a silently-swallowed failure can be indistinguishable in logcat if only one side logs. Add logging to both the JS call site and the native receiving method when diagnosing anything crossing that boundary.

### Empty/silent tool or build output is itself diagnostic information, not "nothing happened"
When a command fails with completely empty output, that emptiness is itself a clue about the specific failure mode, not evidence the capture itself failed.

### Guessing at a fix based on a library's expected API without checking its actual installed version's real behavior, or without finding a confirmed-working example from someone else
Reconfirmed twice this session in two different ways: (1) the AdMob Kotlin issue was only actually solved once an exact-match, maintainer-confirmed GitHub issue was found — earlier attempts to fix it by guessing at compatible dependency versions, while methodologically sound as elimination/diagnosis, did not themselves produce the real fix. (2) The `AlarmActivity`/`launchActivity` attempt caused a real regression specifically *because* no confirmed-working example was found before shipping the change — this is the sharper version of the lesson: for anything safety-critical, "no counter-evidence found" is not the same bar as "a working example was found."

### Directory/path context gets lost across many turns of copy-pasted commands
Multiple times this session, the person ran a command from an unexpected working directory (inside `android/` when a command assumed `frontend/`, or vice versa) because a long sequence of multi-step instructions made it easy to lose track of which `cd` had actually happened. When a command sequence depends on a specific working directory and several turns have passed since it was last confirmed, either re-state the expected directory explicitly or have the person run `pwd` first.

### Two "wrong" grep results in a row can both be real evidence, not the same false alarm
Distinguish between "my expected count was wrong" (check your own reference file) and "my search pattern itself doesn't match the real format" (widen or change the pattern) — conflating these two different failure modes wastes a turn each time.

## Vector Icon Path Data — Two Separate Failure Modes (Don't Repeat)

1. **Hand-derived arc math was mathematically invalid.** A crescent moon built from two SVG-style arc commands had an inner arc radius smaller than what the given endpoints geometrically required — rendered as invisible/broken on-device.
2. **The "safe" `evenOdd` hole-punch alternative also failed**, but differently — rendered as two visibly overlapping circles, likely due to how Android's widget rendering pipeline (`RemoteViews`) handles complex multi-subpath fills differently from a normal in-app `ImageView`.
3. **Externally-"AI"-generated "Android XML" was repeatedly subtly broken**: wrong XML namespace, CSS-style gradient syntax (not valid in Android VectorDrawable), and once a literal XML comment inside a tag's attribute list.

**What actually worked:** the simple, verifiable two-arc full-circle formula combined only with straight lines, for anything hand-authored; a genuinely official Material Symbols export for anything needing more visual complexity.

## Image/Illustration Lessons (New This Session)

- **Claude cannot generate images or 3D renders** — this needed to be explicitly, proactively communicated to the person before they invested effort assuming otherwise. When a feature request implies visual asset generation Claude can't do, say so clearly and early, and offer the genuinely available alternative (in this case: simple 2D vector/SVG work, later superseded by the person's own generated images).
- **Claude's own `view` tool did not reliably render every uploaded/generated image with full visual detail** — RGB opaque images consistently rendered with rich, describable content; RGBA/transparent PNGs inconsistently returned only a placeholder marker with no visual detail available. When this happens, say so explicitly rather than pretending confidence, and fall back to non-visual verification (e.g., checking pixel alpha values via PIL) plus trusting the person's own visual confirmation, especially for content they generated/edited themselves and would have already seen clearly.
- **Uploaded files can age out of the sandbox and become inaccessible even after being successfully viewed earlier in the same long conversation** — this happened with two of the person's uploaded reference images, which needed to be re-requested. Don't assume a file referenced or viewed earlier in a long session is still available later; re-check with `ls`/ `find` before depending on it.
