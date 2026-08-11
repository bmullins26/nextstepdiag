import type { Rule } from "../types";

const YEAR_MAP: Record<string, number> = {
  P: 2012, Q: 2013, R: 2014, S: 2015, T: 2016, V: 2017, W: 2018,
  X: 2019, Y: 2020, Z: 2021, A: 2022, B: 2023, C: 2024, D: 2025, E: 2026,
};
const MONTH_MAP: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  A: 10, B: 11, C: 12,
};

const samsungPos7: Rule = {
  id: "samsung.pos7-year-pos8-month",
  formatId: "samsung.pos7-year-pos8-month",
  effectiveFrom: 2004,
  effectiveTo: null,
  priority: 85,
  name: "Samsung Position 7/8 Year-Month Decoder",
  family: "Samsung",
  pattern: /^.{6}[A-Z][0-9A-C].*/,
  weight: 0.9,
  extract: (serial) => {
    const s = serial.toUpperCase();
    const year = YEAR_MAP[s[6] ?? ""];
    const month = MONTH_MAP[s[7] ?? ""];
    if (!year) return [];
    return [{ year, month: month || undefined, score: 0.9 }];
  },
  explain: (serial, c) =>
    `Samsung: position-7 year code '${serial[6]}' → ${c.year}${c.month ? `, position-8 month code '${serial[7]}' → ${c.month}` : ""}.`,
};

export const samsungRules: Rule[] = [samsungPos7];