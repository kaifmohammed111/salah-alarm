// A pool of ~20 Islamic quotes shown on the Home hero.
// The starting quote rotates every time the app is opened, then gently
// slides through the rest while the app is in the foreground.

export type Quote = { text: string; source: string };

export const QUOTES: Quote[] = [
  { text: "Verily, with hardship comes ease.", source: "Qur'an 94:6" },
  { text: "And He found you lost and guided you.", source: "Qur'an 93:7" },
  { text: "So remember Me; I will remember you.", source: "Qur'an 2:152" },
  { text: "Indeed, prayer prohibits immorality and wrongdoing.", source: "Qur'an 29:45" },
  { text: "And your Lord says, 'Call upon Me; I will respond to you.'", source: "Qur'an 40:60" },
  { text: "Unquestionably, by the remembrance of Allah hearts are assured.", source: "Qur'an 13:28" },
  { text: "Allah does not burden a soul beyond that it can bear.", source: "Qur'an 2:286" },
  { text: "And whoever fears Allah, He will make for him a way out.", source: "Qur'an 65:2" },
  { text: "Indeed, Allah is with the patient.", source: "Qur'an 2:153" },
  { text: "My mercy encompasses all things.", source: "Qur'an 7:156" },
  { text: "The best among you are those who have the best manners.", source: "Prophet Muhammad ﷺ, Bukhari" },
  { text: "Actions are judged by intentions.", source: "Prophet Muhammad ﷺ, Bukhari & Muslim" },
  { text: "The strong person is the one who controls himself when angry.", source: "Prophet Muhammad ﷺ, Bukhari" },
  { text: "None of you truly believes until he loves for his brother what he loves for himself.", source: "Prophet Muhammad ﷺ, Bukhari" },
  { text: "Make things easy and do not make them difficult.", source: "Prophet Muhammad ﷺ, Bukhari" },
  { text: "The most beloved deeds to Allah are those done consistently, even if small.", source: "Prophet Muhammad ﷺ, Bukhari & Muslim" },
  { text: "Whoever guides someone to good will have a reward like the one who does it.", source: "Prophet Muhammad ﷺ, Muslim" },
  { text: "A kind word is charity.", source: "Prophet Muhammad ﷺ, Bukhari & Muslim" },
  { text: "Fear Allah wherever you are, and follow a bad deed with a good one to erase it.", source: "Prophet Muhammad ﷺ, Tirmidhi" },
  { text: "The best of you are those who learn the Qur'an and teach it.", source: "Prophet Muhammad ﷺ, Bukhari" },
];
