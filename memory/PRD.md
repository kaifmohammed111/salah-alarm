# SalahAlarm — Prayer Timetable Alarm App (PRD)

## Original Problem Statement
Build a mobile app that turns a monthly mosque prayer-timetable image into automatic daily prayer alarms. User uploads the timetable image once a month; the app OCRs it, auto-selects today's row, extracts the five daily prayer times, and schedules alarms/notifications. Everything else automatic. (Originally requested in Flutter; built in Expo/React Native per platform + user approval.)

## Tech / Architecture
- Frontend: Expo (SDK 54) + expo-router (file-based tabs), React Native 0.81, TypeScript
- Backend: FastAPI, MongoDB (motor)
- OCR: Google Gemini `gemini-3.1-pro-preview` via emergentintegrations (EMERGENT_LLM_KEY)
- Alarms: expo-notifications scheduled local notifications (Android channel `prayer-alarms`, MAX importance). Sound preview via expo-audio.
- Local storage: `@/src/utils/storage` (AsyncStorage) — settings, timetable, per-prayer configs, backup snapshot
- Design: /app/design_guidelines.json (iOS-Native Clean, brand #1E3A8A, Plus Jakarta Sans)

## User Personas
- Mosque attendees wanting reliable daily prayer alarms with one monthly action.

## Core Requirements (static)
- Upload monthly timetable image → OCR → structured JSON table
- Auto-detect today's row by date-of-month
- Alarm time mapping: Fajr/Zuhr/Asr/Isha→Jamaat, Maghrib→start, Sunrise→no alarm
- Prayer cards: current highlighted dark blue, past greyed out, sunrise disabled
- Per-prayer controls: enable, sound, volume, vibration, snooze, 30-min pre-alarm, preview
- Home: clock, gregorian + auto Hijri date, next prayer + live countdown
- Settings: 12/24h, theme light/dark/system, Asr Hanafi/Shafi label, show sunrise, backup/restore
- "Upload next month's timetable" prompt when today's row not found

## Implemented (2026-07-05)
- Backend `/api/ocr/timetable` (Gemini image OCR → JSON rows) — verified accurate
- Backend `/api/ocr/pdf` (Gemini PDF OCR via FileContentWithMimeType) — verified; invalid input → 400
- Home, Alarms, Upload+OCR-edit, Settings screens with bottom tabs
- AppContext: persistence, ticking clock, theme, auto-reschedule of notifications
- Manual edit screen for OCR correction (start/jamaat per prayer, 24h HH:MM)
- Hijri auto-compute (tabular Islamic calendar)
- Backup/restore snapshot; all tested (backend + frontend flows pass)
- **Manual day-by-day timetable editor** at `/editor` (from Settings + Upload): create blank month (28-31 days), day chip selector, edit Day/Hijri + per-prayer Start/Jamaat, save. Verified.
- **PDF import** as an OCR method (Upload → PDF button). Verified.
- **CSV import** (Upload → CSV button): parses `Day,Date,Hijri,Fajr Start,Fajr Jamaat,Sunrise,Zuhr Start,Zuhr Jamaat,Asr Start,Asr Jamaat,Maghrib,Isha Start,Isha Jamaat`; 12h→24h conversion (Fajr/Sunrise AM, rest PM) — verified deterministically.

## Backlog / Remaining
- P1: Bundle real Adhan audio (Short/Full) + custom MP3 picker; per-sound notification channels (needs native build for custom notification sounds).
- P1: True native exact AlarmManager alarms (fire when app killed / after reboot / Doze) — requires a dev build / config plugin; current version uses scheduled local notifications.
- P2: Snooze action buttons on the notification; full-screen alarm ring UI.
- P2: Multi-day look-ahead scheduling (schedule tomorrow's alarms via background task).

## Next Tasks
- Source royalty-free Adhan audio and wire notification sound channels.
- Add background refresh (expo-background-task) to roll over to next day automatically.

## Update (2026-07-05, later)
- Prayer cards now show BOTH Start and Jamaat times per prayer (Sunrise shows single time). Verified on Home + Alarms.
- Custom MP3 adhan: alarm sheet lets user pick "Custom MP3" and upload their own audio file (expo-document-picker). Plays on Preview via expo-audio; stored per-prayer (customUri/customName). NOTE: custom file as the actual scheduled-notification alarm tone requires a native device build (Expo Go uses default sound) — surfaced in-UI.

## Update (2026-06, fork)
- **CSV parser hardened** (`src/lib/csv.ts`): column detection rewritten from exact-name matching to flexible substring matching (`findCol`/`prayerCols`). Now handles: "Zuhur" spelling variants, phantom "Zuha-e-Kubra" columns (ignored via `kubra` exclusion), separate "Maghrib Start"/"Maghrib Jamaat" columns (invalid values like "B.Night" fall back to the other), and appended non-prayer tables (advertiser rows auto-skipped by non-numeric Date). Verified against phantom + July + August CSVs — July/August mapping unchanged.

