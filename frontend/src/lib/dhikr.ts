export type DhikrItem = {
  id: string;
  arabic: string;
  transliteration: string;
  english: string;
  target: number;
};

// Well-known, widely-used dhikr phrases. Verify pronunciation with a
// knowledgeable source if you're unfamiliar — these are standard texts used
// across Islamic apps, but always worth double-checking for your own study.
export const DHIKR_LIST: DhikrItem[] = [
  {
    id: "subhanallah",
    arabic: "سُبْحَانَ اللَّهِ",
    transliteration: "SubhanAllah",
    english: "Glory be to Allah",
    target: 33,
  },
  {
    id: "alhamdulillah",
    arabic: "الْحَمْدُ لِلَّهِ",
    transliteration: "Alhamdulillah",
    english: "All praise is due to Allah",
    target: 33,
  },
  {
    id: "allahuakbar",
    arabic: "اللَّهُ أَكْبَرُ",
    transliteration: "Allahu Akbar",
    english: "Allah is the Greatest",
    target: 34,
  },
  {
    id: "lailahaillallah",
    arabic: "لَا إِلَٰهَ إِلَّا اللَّهُ",
    transliteration: "La ilaha illallah",
    english: "There is no god but Allah",
    target: 100,
  },
  {
    id: "astaghfirullah",
    arabic: "أَسْتَغْفِرُ اللَّهَ",
    transliteration: "Astaghfirullah",
    english: "I seek forgiveness from Allah",
    target: 100,
  },
  {
    id: "subhanallahiwabihamdihi",
    arabic: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ",
    transliteration: "SubhanAllahi wa bihamdihi",
    english: "Glory be to Allah and praise Him",
    target: 100,
  },
  {
    id: "lahawla",
    arabic: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ",
    transliteration: "La hawla wa la quwwata illa billah",
    english: "There is no power nor strength except with Allah",
    target: 100,
  },
  {
    id: "salawat",
    arabic: "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ",
    transliteration: "Allahumma salli 'ala Muhammad",
    english: "O Allah, send blessings upon Muhammad",
    target: 100,
  },
];
