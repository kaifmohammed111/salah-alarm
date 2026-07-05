// Gregorian -> Hijri conversion (tabular Islamic calendar, civil epoch).
// Good enough for displaying the Hijri date automatically from device date.

const MONTHS = [
  "Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani", "Jumada al-Awwal",
  "Jumada al-Thani", "Rajab", "Shaban", "Ramadan", "Shawwal",
  "Dhu al-Qadah", "Dhu al-Hijjah",
];

export function gregorianToHijri(date: Date): { day: number; month: number; year: number; monthName: string } {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  let jd =
    Math.floor((1461 * (year + 4800 + Math.floor((month - 14) / 12))) / 4) +
    Math.floor((367 * (month - 2 - 12 * Math.floor((month - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((year + 4900 + Math.floor((month - 14) / 12)) / 100)) / 4) +
    day - 32075;

  // Calibration: the tabular algorithm runs ~1 day ahead of the observed
  // Umm al-Qura calendar, so shift back by one day.
  jd -= 1;

  const l0 = jd - 1948440 + 10632;
  const n = Math.floor((l0 - 1) / 10631);
  let l = l0 - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hMonth = Math.floor((24 * l) / 709);
  const hDay = l - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 30;

  return {
    day: hDay,
    month: hMonth,
    year: hYear,
    monthName: MONTHS[(hMonth - 1 + 12) % 12],
  };
}

export function formatHijri(date: Date): string {
  const h = gregorianToHijri(date);
  return `${h.day} ${h.monthName} ${h.year} AH`;
}
