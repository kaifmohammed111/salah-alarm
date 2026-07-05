// Moon phase computation (astronomical approximation).
// Uses the mean synodic month and a known reference new moon.

const SYNODIC = 29.53058867; // days
// Reference new moon: 2000-01-06 18:14 UTC
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0);

export type MoonInfo = {
  phase: number; // 0..1 (0 = new, 0.5 = full)
  illumination: number; // 0..1 fraction lit
  waxing: boolean; // true = growing
  ageDays: number;
  name: string;
};

export function getMoonInfo(date: Date = new Date()): MoonInfo {
  const daysSince = (date.getTime() - REF_NEW_MOON) / (1000 * 60 * 60 * 24);
  let phase = (daysSince % SYNODIC) / SYNODIC;
  if (phase < 0) phase += 1;

  const ageDays = phase * SYNODIC;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const waxing = phase < 0.5;

  let name = "New Moon";
  if (phase < 0.03 || phase > 0.97) name = "New Moon";
  else if (phase < 0.22) name = "Waxing Crescent";
  else if (phase < 0.28) name = "First Quarter";
  else if (phase < 0.47) name = "Waxing Gibbous";
  else if (phase < 0.53) name = "Full Moon";
  else if (phase < 0.72) name = "Waning Gibbous";
  else if (phase < 0.78) name = "Last Quarter";
  else name = "Waning Crescent";

  return { phase, illumination, waxing, ageDays, name };
}
