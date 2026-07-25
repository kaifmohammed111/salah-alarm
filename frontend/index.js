// FIX: the previous version of this file registered its own empty
// onBackgroundEvent stub directly here, purely (per its own comment) "so
// Android's headless task lookup succeeds." Notifee only supports a single
// registered background handler at a time — this stub was silently winning
// over the real handler (registerBackgroundAlarmHandler in src/lib/alarm.ts)
// specifically during a fully-killed cold start (e.g. after swiping the app
// away from recents), because this file's top-level code always runs first
// on every JS boot, while the real handler was only being registered once
// the app's component tree actually mounted — which never happens in a
// headless-only invocation. Confirmed via logcat: NotifeeHeadlessJS reached
// taskId execution, but none of the real handler's logging ever appeared.
//
// Registering the real handler directly here, at true module scope, means
// it runs unconditionally on every JS engine boot — headless cold start or
// normal app open — rather than depending on React's lifecycle.
import { registerBackgroundAlarmHandler } from "./src/lib/alarm";

registerBackgroundAlarmHandler();

import "expo-router/entry";
