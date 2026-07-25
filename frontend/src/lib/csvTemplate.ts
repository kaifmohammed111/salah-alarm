// Blank-month prayer timetable template, offered as a downloadable CSV from
// Settings → Timetable → Download CSV template. Matches exactly what
// src/lib/csv.ts's parser expects — see the header/column names there.
//
// Two plain instructional lines sit above the real header row. Neither
// contains a comma: the parser splits every line on commas while scanning
// for a header row (a cell that normalizes to exactly "date"), so a comma
// in these lines could accidentally create a standalone "Date" cell and
// trick the parser into treating this line as the header. Keep these
// comma-free if edited.
const INSTRUCTIONS = [
  "INSTRUCTIONS: Fill in your mosque prayer times below following the example in the first data row. Do not edit or remove the header row two lines down.",
  "The Date column below must be the day of the month only (1 to 31) not a full calendar date. Times may be written as 5:12 AM or 17:12 (24-hour) - both work.",
];

const HEADER =
  "Day,Date,Hijri,Fajr Start,Fajr Jamaat,Sunrise,Zuhr Start,Zuhr Jamaat,Asr Start,Asr Jamaat,Maghrib Start,Maghrib Jamaat,Isha Start,Isha Jamaat";

const EXAMPLE_ROW =
  "Mon,1,1 Muharram,5:12 AM,5:35 AM,6:41 AM,1:05 PM,1:30 PM,4:45 PM,5:00 PM,7:52 PM,7:57 PM,9:15 PM,9:30 PM";

// 14 columns total, matching HEADER exactly — only the Date column (index 1)
// is filled in; everything else is left blank for the user to type over.
function blankDataRow(day: number): string {
  const fields = Array(14).fill("");
  fields[1] = String(day);
  return fields.join(",");
}

export const TIMETABLE_TEMPLATE_CSV = [
  ...INSTRUCTIONS,
  HEADER,
  EXAMPLE_ROW,
  ...Array.from({ length: 30 }, (_, i) => blankDataRow(i + 2)), // Days 2–31
].join("\n");

export const TIMETABLE_TEMPLATE_FILENAME = "salahsync-timetable-template.csv";
