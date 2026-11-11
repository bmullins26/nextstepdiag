import type { Rule, DateCandidate } from "../types";

/**
 * GE Appliances: first letter = month, second letter = year, both drawn from
 * the same 12-letter alphabet (no B,C,E,I,J,K,N,O,P,Q,U,W,X,Y).
 * Month: A=Jan D=Feb F=Mar G=Apr H=May L=Jun M=Jul R=Aug S=Sep T=Oct V=Nov Z=Dec.
 * Year cycles every 12 years: A=2013, D=2014 … S=2021, V=2023, Z=2024 (and 2012, 2000…).
 */
const GE_LETTERS = "ADFGHLMRSTVZ";
const CYCLE_ANCHOR = 2013; // A

const geMonthYear: Rule = {
  id: "ge.month-year-letters",
  formatId: "ge.month-year-letters.v2",
  effectiveFrom: 1977,
  effectiveTo: null,
  priority: 80,
  name: "GE Month/Year Letter Decoder",
  family: "GE",
  pattern: /^[ADFGHLMRSTVZ][ADFGHLMRSTVZ]\d/,
  weight: 0.8,
  extract: (serial) => {
    const s = serial.toUpperCase();
    const m = GE_LETTERS.indexOf(s[0] ?? "");
    const y = GE_LETTERS.indexOf(s[1] ?? "");
    if (m < 0 || y < 0) return [];
    const now = new Date().getFullYear();
    const years: number[] = [];
    for (let year = CYCLE_ANCHOR + y; year <= now + 1; year += 12) years.push(year);
    for (let year = CYCLE_ANCHOR + y - 12; year >= 1977; year -= 12) years.push(year);
    years.sort((a, b) => b - a);
    // Most recent cycle scores highest; model windows can overrule.
    return years.slice(0, 4).map((year, i): DateCandidate => ({ year, month: m + 1, score: Math.max(0.15, 0.6 - i * 0.15) }));
  },
  explain: (serial, c) =>
    `GE: month letter '${serial[0]}' → ${c.month}, year letter '${serial[1]}' → ${c.year}. GE year letters repeat every 12 years.`,
};

export const geRules: Rule[] = [geMonthYear];
