import type { Rule, DateCandidate } from "../types";

// Fisher & Paykel serial date codes.
// Source: building-center.org Fisher & Paykel reference (secondary reference,
// NOT manufacturer-published). Year letters follow the "CUMBERLAND" cipher:
//   C=1 U=2 M=3 B=4 E=5 R=6 L=7 A=8 N=9 D=0  (year's last digit)
// The 2nd letter is a month code, but no verified letter→month table exists,
// so we deliberately decode the YEAR ONLY rather than guess a month.
// The decade repeats every 10 years: every plausible decade is returned and
// the model production window (when known) removes impossible ones.
const CUMBERLAND: Record<string, number> = { C: 1, U: 2, M: 3, B: 4, E: 5, R: 6, L: 7, A: 8, N: 9, D: 0 };

function decadeCandidates(digit: number, extra: Omit<DateCandidate, "year" | "score"> = {}): DateCandidate[] {
  return [2020, 2010, 2000, 1990]
    .map((d) => d + digit)
    .map((year, i) => ({ year, ...extra, score: Math.max(0.2, 0.8 - i * 0.2) }));
}

const fpLetterYear: Rule = {
  id: "fisherpaykel.cumberland",
  formatId: "fisherpaykel.cumberland",
  name: "Fisher & Paykel CUMBERLAND year letter",
  family: "Fisher & Paykel",
  effectiveFrom: 1990,
  effectiveTo: null,
  priority: 80,
  // Two letters, then the sequence (e.g. AD852242C, BAR456432).
  pattern: /^[CUMBERLAND][A-Z][A-Z0-9]{4,}$/,
  weight: 0.7,
  extract: (s) => {
    const d = CUMBERLAND[s[0]!];
    return d === undefined ? [] : decadeCandidates(d);
  },
  explain: (s, c) =>
    `Fisher & Paykel: 1st letter '${s[0]}' = year ending in ${c.year % 10} (CUMBERLAND code) → ${c.year}. The 2nd letter '${s[1]}' is a month code without a verified table, so month is not reported. Source: secondary reference, not manufacturer-published.`,
};

const fpNumeric: Rule = {
  id: "fisherpaykel.numeric-yww",
  formatId: "fisherpaykel.numeric-yww",
  name: "Fisher & Paykel numeric Y+WW",
  family: "Fisher & Paykel",
  effectiveFrom: 1990,
  effectiveTo: null,
  priority: 70,
  // e.g. 72915-0001 → year digit 7, week 29.
  pattern: /^\d{5}-?\d{4}$/,
  weight: 0.6,
  extract: (s) => {
    const w = parseInt(s.slice(1, 3), 10);
    if (!(w >= 1 && w <= 53)) return [];
    return decadeCandidates(parseInt(s[0]!, 10), { week: w });
  },
  explain: (s, c) =>
    `Fisher & Paykel numeric: digit 1 '${s[0]}' = year ending in ${c.year % 10} → ${c.year}; digits 2–3 '${s.slice(1, 3)}' = week ${c.week}. Source: secondary reference, not manufacturer-published.`,
};

export const fisherPaykelRules: Rule[] = [fpLetterYear, fpNumeric];
