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
- Backend `/api/ocr/timetable` (Gemini OCR → JSON rows) — verified accurate
- Home, Alarms, Upload+OCR-edit, Settings screens with bottom tabs
- AppContext: persistence, ticking clock, theme, auto-reschedule of notifications
- Manual edit screen for OCR correction (start/jamaat per prayer, 24h HH:MM)
- Hijri auto-compute (tabular Islamic calendar)
- Backup/restore snapshot; all tested (backend 4/4, frontend flows pass)

## Backlog / Remaining
- P1: Bundle real Adhan audio (Short/Full) + custom MP3 picker; per-sound notification channels (needs native build for custom notification sounds).
- P1: True native exact AlarmManager alarms (fire when app killed / after reboot / Doze) — requires a dev build / config plugin; current version uses scheduled local notifications.
- P2: Snooze action buttons on the notification; full-screen alarm ring UI.
- P2: Multi-day look-ahead scheduling (schedule tomorrow's alarms via background task).

## Next Tasks
- Source royalty-free Adhan audio and wire notification sound channels.
- Add background refresh (expo-background-task) to roll over to next day automatically.
