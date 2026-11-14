import type { Rule } from "../types";

const MONTH_MAP: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  A: 10, B: 11, C: 12,
};

/**
 * Samsung 15-character appliance serials (laundry, ranges, dishwashers):
 * position 8 = year letter, position 9 = month (1-9, A-C).
 * e.g. 0C8K7DDG301617M → G = 2015, 3 = March.
 */
// 2007–2011 codes: https://www.electrical-forensics.com/MajorAppliances/SamsungDateCodes.html
const YEAR15: Record<string, number> = {
  P: 2007, Q: 2008, S: 2009, Z: 2010, B: 2011,
  C: 2012, D: 2013, F: 2014, G: 2015, H: 2016, J: 2017, K: 2018, M: 2019,
  N: 2020, R: 2021, T: 2022, W: 2023, X: 2024, Y: 2025, A: 2026,
};

const samsung15: Rule = {
  id: "samsung.15char-pos8-year-pos9-month",
  formatId: "samsung.15char-pos8-year-pos9-month",
  effectiveFrom: 2007,
  effectiveTo: null,
  priority: 90,
  name: "Samsung 15-char Position 8/9 Year-Month Decoder",
  family: "Samsung",
  pattern: /^[0-9A-Z]{7}[CDFGHJKMNRTWXYAPQSZB][1-9ABC][0-9A-Z]{6}$/,
  weight: 0.9,
  extract: (serial) => {
    const s = serial.toUpperCase();
    const year = YEAR15[s[7] ?? ""];
    const month = MONTH_MAP[s[8] ?? ""];
    if (!year || !month) return [];
    return [{ year, month }];
  },
  explain: (serial, c) =>
    `Samsung (15-char): position-8 year code '${serial[7]}' → ${c.year}, position-9 month code '${serial[8]}' → ${c.month}.`,
};

export const samsungRules: Rule[] = [samsung15];
