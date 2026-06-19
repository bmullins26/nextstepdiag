import type { Rule, DateCandidate } from "../types";

// Whirlpool letter→year table. Letters used historically: A..Y excluding
// I, O, Q, U. Resets ~every 20 years. Most common modern cycle starts 1993.
// Whirlpool year-letter table per electrical-forensics.com. The letter set
// skips I, O, Q, U (easily confused with digits) and recycles ~every 20 yrs.
const WP_LETTERS = "ABCDEFGHJKLMNPRSTVWXY".split("");

/**
 * Returns ALL plausible years for a given year-letter (homespy behavior).
 * Cycles: 1973, 1993, 2013, 2033, ...
 */
function whirlpoolYearsFromLetter(letter: string): number[] {
  const idx = WP_LETTERS.indexOf(letter.toUpperCase());
  if (idx < 0) return [];
  const now = new Date().getFullYear();
  const years: number[] = [];
  for (let base = 1973; base <= now; base += 20) {
    const y = base + idx;
    if (y >= 1973 && y <= now + 1) years.push(y);
  }
  return years;
}

/**
 * Whirlpool modern format: [PlantLetter][YearLetter][WW][Sequence]
 * Example: CX48 12345 → C=plant, X=year-letter, 48=week, then sequence.
 */
const whirlpoolLetterWeek: Rule = {
  id: "whirlpool.year-letter-week",
  name: "Whirlpool Year-Letter / Week Decoder",
  family: "Whirlpool",
  pattern: /^[A-Z][ABCDEFGHJKLMNPRSTVWXY]\d{2}\d+$/,
  weight: 0.9,
  extract: (serial) => {
    const s = serial.toUpperCase();
    const yearLetter = s[1];
    const week = parseInt(s.slice(2, 4), 10);
    const years = whirlpoolYearsFromLetter(yearLetter);
    if (!years.length) return [];
    const now = new Date().getFullYear();
    const wk = Number.isFinite(week) && week >= 1 && week <= 53 ? week : undefined;
    // Recency-decayed scores. Returns every plausible cycle so corroboration
    // can pick the right one.
    return years.map<DateCandidate>((year) => {
      const yearsAgo = Math.max(0, now - year);
      const score = Math.max(0.20, 0.65 - yearsAgo * 0.012);
      return { year, week: wk, score };
    });
  },
  explain: (serial, c) => {
    const s = serial.toUpperCase();
    return `Whirlpool: plant '${s[0]}', year letter '${s[1]}' → ${c.year}${c.week ? `, week ${c.week}` : ""}. Year-letter cycles every 20 years; chosen by recency + model corroboration.`;
  },
};

/**
 * Whirlpool numeric format: [PlantLetter][YearDigit][WW][Sequence]
 * Example: C8123 4567 → year-of-decade 8 (ambiguous between 2008/2018/2028 etc).
 * Low confidence on its own — model number disambiguates.
 */
const whirlpoolYearDigit: Rule = {
  id: "whirlpool.year-digit",
  name: "Whirlpool Year-of-Decade Decoder",
  family: "Whirlpool",
  pattern: /^[A-Z]\d{2}\d+$/,
  weight: 0.4,
  extract: (serial) => {
    const s = serial.toUpperCase();
    const d = parseInt(s[1] ?? "", 10);
    if (!Number.isFinite(d)) return [];
    const now = new Date().getFullYear();
    const baseDecade = Math.floor(now / 10) * 10;
    const week = parseInt(s.slice(2, 4), 10);
    const wk = Number.isFinite(week) && week >= 1 && week <= 53 ? week : undefined;
    // Last three decades, recency-weighted.
    return [baseDecade - 20, baseDecade - 10, baseDecade]
      .map((b, i) => ({ year: b + d, week: wk, score: 0.2 + i * 0.15 }))
      .filter((c) => c.year <= now + 1);
  },
  explain: (serial, c) =>
    `Whirlpool: plant '${serial[0]}', year-of-decade '${serial[1]}' → ${c.year}${c.week ? `, week ${c.week}` : ""}. Decade chosen by recency.`,
};

export const whirlpoolRules: Rule[] = [whirlpoolLetterWeek, whirlpoolYearDigit];