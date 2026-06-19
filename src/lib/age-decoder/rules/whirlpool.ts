import type { Rule, DateCandidate } from "../types";

// Whirlpool letter→year table. Letters used historically: A..Y excluding
// I, O, Q, U. Resets ~every 20 years. Most common modern cycle starts 1993.
const WP_LETTERS = "ABCDEFGHJKLMNPRSTVWXY".split("");

function whirlpoolYearsFromLetter(letter: string): number[] {
  const idx = WP_LETTERS.indexOf(letter.toUpperCase());
  if (idx < 0) return [];
  const now = new Date().getFullYear();
  return [1993 + idx, 2013 + idx].filter((y) => y >= 1993 && y <= now + 1);
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
    const out: DateCandidate[] = years.map((year, i) => ({
      year,
      week: Number.isFinite(week) && week >= 1 && week <= 53 ? week : undefined,
      // Prefer the most recent cycle (later candidate gets higher score).
      score: i === years.length - 1 ? 0.6 : 0.3,
    }));
    return out;
  },
  explain: (serial, c) => {
    const s = serial.toUpperCase();
    return `Whirlpool: plant '${s[0]}', year letter '${s[1]}' → ${c.year}${c.week ? `, week ${c.week}` : ""}.`;
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