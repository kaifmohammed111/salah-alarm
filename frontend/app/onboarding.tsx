import { useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

import { useApp } from "@/src/context/AppContext";
import { FONTS, RADIUS, SPACING } from "@/src/theme";
import { CALC_METHODS, CalcMethodKey, generateTimetableForMonth } from "@/src/lib/calculate";

type Step = "choose" | "calculate";
type LocationMode = "gps" | "manual";

// First-run screen: lets a brand-new user choose between importing their
// own mosque's CSV timetable, or having prayer times calculated
// automatically using a standard scientific method (via the `adhan`
// library, already wired up in src/lib/calculate.ts) — either from GPS,
// or from manually-typed coordinates, mirroring the same location-mode
// pattern already used in the Settings > Edit timetable manually screen.
// Shown instead of the normal tab UI whenever there's no saved timetable
// yet — see OnboardingGate in app/_layout.tsx.
export default function OnboardingScreen() {
  const { colors, settings, updateSettings, saveTimetable } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [methodKey, setMethodKey] = useState<CalcMethodKey>("MuslimWorldLeague");
  const [asrMethod, setAsrMethod] = useState<"hanafi" | "shafi">(settings.asrMethod || "shafi");
  const [locationMode, setLocationMode] = useState<LocationMode>("gps");
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");
  const [manualCoordsConfirmed, setManualCoordsConfirmed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLocationPermModal, setShowLocationPermModal] = useState(false);

  const onConfirmManualCoords = () => {
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError("Enter a valid latitude between -90 and 90.");
      setManualCoordsConfirmed(false);
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setError("Enter a valid longitude between -180 and 180.");
      setManualCoordsConfirmed(false);
      return;
    }
    setError(null);
    setManualCoordsConfirmed(true);
  };

  const onCalculate = async () => {
    setError(null);
    let latitude: number;
    let longitude: number;

    if (locationMode === "manual") {
      // GPS mode ALWAYS uses a fresh real GPS fix and never falls back to
      // typed coordinates — only reached here when locationMode is
      // genuinely "manual", so re-validate with the same rules the
      // Confirm button already applies rather than trusting stale state.
      const lat = parseFloat(manualLat);
      const lon = parseFloat(manualLon);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        setError("Enter a valid latitude between -90 and 90.");
        return;
      }
      if (isNaN(lon) || lon < -180 || lon > 180) {
        setError("Enter a valid longitude between -180 and 180.");
        return;
      }
      latitude = lat;
      longitude = lon;
    } else {
      setLocating(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setLocating(false);
          setShowLocationPermModal(true);
          return;
        }
        let pos = await Location.getLastKnownPositionAsync();
        if (!pos) {
          pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        }
        if (!pos) {
          setLocating(false);
          setError("Could not determine your location. Check your device's location settings and try again.");
          return;
        }
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch (e) {
        console.warn("Onboarding GPS fetch failed", e);
        setLocating(false);
        setError("Could not determine your location. Check your device's location settings and try again.");
        return;
      }
    }

    setLocating(true);
    try {
      const now = new Date();
      // One month at a time, matching how the CSV-import path already
      // works (a single Timetable = one month's rows, re-uploaded/
      // regenerated monthly) — DayRow.date is just a day-of-month
      // number, not a full date, so concatenating multiple months into
      // one Timetable would create ambiguous, colliding rows.
      const tt = generateTimetableForMonth(latitude, longitude, now.getFullYear(), now.getMonth(), methodKey, asrMethod);
      // Informational only, same spirit as calcMethodLabel/calcAsrLabel
      // already attached inside generateTimetableForMonth — GPS shows no
      // numbers (the exact live position feels more private), manually
      // typed coordinates show the values since the user entered them
      // deliberately.
      (tt as any).calcLocationLabel =
        locationMode === "manual" ? `Coordinates (${latitude.toFixed(4)}, ${longitude.toFixed(4)})` : "GPS";
      await updateSettings({ asrMethod });
      await saveTimetable(tt);
      router.replace("/");
    } catch (e) {
      console.warn("Onboarding location calculation failed", e);
      setError("Something went wrong calculating your prayer times. Please try again, or use a CSV file instead.");
    } finally {
      setLocating(false);
    }
  };

  if (step === "choose") {
    return (
      <View style={[styles.root, { backgroundColor: colors.surfaceSecondary, paddingTop: insets.top + SPACING.xxl }]}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Welcome to SalahSync</Text>
        <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>
          Let's get your prayer times set up. Choose how you'd like to do that.
        </Text>

        <Pressable
          testID="onboarding-choose-location"
          onPress={() => setStep("calculate")}
          style={[styles.choiceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.choiceIcon, { backgroundColor: colors.brandTertiary }]}>
            <Ionicons name="location" size={26} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.choiceTitle, { color: colors.onSurface }]}>Calculate for my location</Text>
            <Text style={[styles.choiceSub, { color: colors.onSurfaceTertiary }]}>
              Use GPS or type coordinates, plus a scientific calculation method
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>

        <Pressable
          testID="onboarding-choose-csv"
          onPress={() => router.push("/upload")}
          style={[styles.choiceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.choiceIcon, { backgroundColor: colors.brandTertiary }]}>
            <Ionicons name="document-text" size={26} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.choiceTitle, { color: colors.onSurface }]}>Import a CSV file</Text>
            <Text style={[styles.choiceSub, { color: colors.onSurfaceTertiary }]}>
              Use your mosque's own monthly timetable, uploaded as a CSV file
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceSecondary, paddingTop: insets.top + SPACING.xxl }]}>
      <Pressable testID="onboarding-back" onPress={() => setStep("choose")} style={styles.backRow}>
        <Ionicons name="chevron-back" size={20} color={colors.brand} />
        <Text style={[styles.backText, { color: colors.brand }]}>Back</Text>
      </Pressable>

      <Text style={[styles.title, { color: colors.onSurface }]}>Calculation Settings</Text>
      <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>
        Choose a location source, calculation method, and Asr school.
      </Text>

      <Text style={[styles.sectionLabel, { color: colors.onSurfaceTertiary }]}>LOCATION</Text>
      <View style={{ flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm }}>
        <Pressable
          testID="onboarding-location-mode-gps"
          onPress={() => {
            setLocationMode("gps");
            setError(null);
          }}
          style={[
            styles.asrBtn,
            { backgroundColor: locationMode === "gps" ? colors.brand : colors.surfaceSecondary, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.asrBtnText, { color: locationMode === "gps" ? "#fff" : colors.onSurface }]}>
            Use my GPS location
          </Text>
        </Pressable>
        <Pressable
          testID="onboarding-location-mode-manual"
          onPress={() => {
            setLocationMode("manual");
            setError(null);
          }}
          style={[
            styles.asrBtn,
            { backgroundColor: locationMode === "manual" ? colors.brand : colors.surfaceSecondary, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.asrBtnText, { color: locationMode === "manual" ? "#fff" : colors.onSurface }]}>
            Enter coordinates
          </Text>
        </Pressable>
      </View>

      {locationMode === "manual" ? (
        <>
          <View style={{ flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm }}>
            <TextInput
              testID="onboarding-manual-lat-input"
              value={manualLat}
              onChangeText={(v) => {
                setManualLat(v);
                setManualCoordsConfirmed(false);
              }}
              placeholder="Latitude (e.g. 51.5072)"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
              style={[
                styles.coordInput,
                { flex: 1, backgroundColor: colors.surface, color: colors.onSurface, borderColor: colors.border },
              ]}
            />
            <TextInput
              testID="onboarding-manual-lon-input"
              value={manualLon}
              onChangeText={(v) => {
                setManualLon(v);
                setManualCoordsConfirmed(false);
              }}
              placeholder="Longitude (e.g. -0.1276)"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
              style={[
                styles.coordInput,
                { flex: 1, backgroundColor: colors.surface, color: colors.onSurface, borderColor: colors.border },
              ]}
            />
          </View>
          <Pressable
            testID="onboarding-manual-coords-confirm-btn"
            onPress={onConfirmManualCoords}
            style={[
              styles.confirmCoordsBtn,
              { backgroundColor: manualCoordsConfirmed ? colors.success : colors.brand },
            ]}
          >
            <Ionicons
              name={manualCoordsConfirmed ? "checkmark-circle" : "checkmark-outline"}
              size={18}
              color="#fff"
            />
            <Text style={styles.confirmCoordsBtnText}>
              {manualCoordsConfirmed ? "Coordinates confirmed" : "Confirm Coordinates"}
            </Text>
          </Pressable>
        </>
      ) : null}

      <Text style={[styles.sectionLabel, { color: colors.onSurfaceTertiary }]}>CALCULATION METHOD</Text>
      <ScrollView style={styles.methodList} showsVerticalScrollIndicator={false}>
        {CALC_METHODS.map((m) => (
          <Pressable
            key={m.key}
            testID={`onboarding-method-${m.key}`}
            onPress={() => setMethodKey(m.key)}
            style={[
              styles.methodRow,
              { backgroundColor: colors.surface, borderColor: methodKey === m.key ? colors.brand : colors.border },
            ]}
          >
            <Text style={[styles.methodText, { color: colors.onSurface }]}>{m.label}</Text>
            {methodKey === m.key ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
          </Pressable>
        ))}
      </ScrollView>

      <Text style={[styles.sectionLabel, { color: colors.onSurfaceTertiary }]}>ASR CALCULATION</Text>
      <View style={{ flexDirection: "row", gap: SPACING.md }}>
        <Pressable
          testID="onboarding-asr-hanafi"
          onPress={() => setAsrMethod("hanafi")}
          style={[
            styles.asrBtn,
            { backgroundColor: asrMethod === "hanafi" ? colors.brand : colors.surfaceSecondary, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.asrBtnText, { color: asrMethod === "hanafi" ? "#fff" : colors.onSurface }]}>Hanafi</Text>
        </Pressable>
        <Pressable
          testID="onboarding-asr-shafi"
          onPress={() => setAsrMethod("shafi")}
          style={[
            styles.asrBtn,
            { backgroundColor: asrMethod === "shafi" ? colors.brand : colors.surfaceSecondary, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.asrBtnText, { color: asrMethod === "shafi" ? "#fff" : colors.onSurface }]}>
            Shafi / Maliki / Hanbali
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}

      <Pressable
        testID="onboarding-calculate-btn"
        onPress={onCalculate}
        disabled={locating}
        style={[styles.confirmBtn, { backgroundColor: colors.brand, opacity: locating ? 0.7 : 1 }]}
      >
        {locating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name={locationMode === "manual" ? "calculator-outline" : "location"} size={18} color="#fff" />
            <Text style={styles.confirmBtnText}>
              {locationMode === "manual" ? "Calculate Prayer Times" : "Use My Current Location"}
            </Text>
          </>
        )}
      </Pressable>

      <Modal
        visible={showLocationPermModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLocationPermModal(false)}
      >
        <Pressable style={permModalStyles.backdrop} onPress={() => setShowLocationPermModal(false)}>
          <Pressable style={[permModalStyles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={[permModalStyles.iconCircle, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="location" size={32} color={colors.brand} />
            </View>
            <Text style={[permModalStyles.title, { color: colors.onSurface }]}>Location Permission Needed</Text>
            <Text style={[permModalStyles.message, { color: colors.onSurfaceTertiary }]}>
              SalahSync needs your location to calculate prayer times. Please grant location permission and make
              sure your device's location services are turned on.
            </Text>
            <Pressable
              testID="onboarding-location-perm-open-settings"
              onPress={() => {
                setShowLocationPermModal(false);
                Linking.openSettings();
              }}
              style={[permModalStyles.primaryBtn, { backgroundColor: colors.brand }]}
            >
              <Text style={permModalStyles.primaryBtnText}>Open Settings</Text>
            </Pressable>
            <Pressable
              testID="onboarding-location-perm-cancel"
              onPress={() => setShowLocationPermModal(false)}
              style={permModalStyles.cancelBtn}
            >
              <Text style={[permModalStyles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: SPACING.xl },
  title: { fontFamily: FONTS.bold, fontSize: 24, marginBottom: SPACING.sm },
  subtitle: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, marginBottom: SPACING.xxl },
  choiceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.md,
  },
  choiceIcon: { width: 48, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  choiceTitle: { fontFamily: FONTS.bold, fontSize: 16 },
  choiceSub: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2, lineHeight: 17 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: SPACING.lg },
  backText: { fontFamily: FONTS.semibold, fontSize: 14 },
  sectionLabel: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 0.5, marginBottom: SPACING.sm, marginTop: SPACING.md },
  coordInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
  confirmCoordsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
  },
  confirmCoordsBtnText: { fontFamily: FONTS.bold, fontSize: 13, color: "#fff" },
  methodList: { maxHeight: 220, marginBottom: SPACING.md },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.sm,
  },
  methodText: { fontFamily: FONTS.medium, fontSize: 14, flex: 1 },
  asrBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  asrBtnText: { fontFamily: FONTS.semibold, fontSize: 13, textAlign: "center" },
  errorText: { fontFamily: FONTS.regular, fontSize: 13, marginTop: SPACING.lg, textAlign: "center" },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.xl,
  },
  confirmBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: "#fff" },
});

const permModalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  card: { width: "100%", maxWidth: 340, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center" },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: SPACING.md },
  title: { fontFamily: FONTS.bold, fontSize: 18, textAlign: "center", marginBottom: SPACING.sm },
  message: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: SPACING.xl },
  primaryBtn: { width: "100%", paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: "center", marginBottom: SPACING.sm },
  primaryBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: "#fff" },
  cancelBtn: { paddingVertical: SPACING.sm, alignItems: "center" },
  cancelBtnText: { fontFamily: FONTS.semibold, fontSize: 14 },
});
