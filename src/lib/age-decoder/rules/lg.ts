import type { Rule } from "../types";

const MONTH_MAP: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  A: 10, B: 11, C: 12,
};

const lgYYM: Rule = {
  id: "lg.yym",
  name: "LG Year-Month Decoder",
  family: "LG",
  pattern: /^\d{2}[0-9ABC]\d*/,
  weight: 0.85,
  extract: (serial) => {
    const s = serial.toUpperCase();
    const yy = parseInt(s.slice(0, 2), 10);
    const mCh = s[2] ?? "";
    if (!Number.isFinite(yy)) return [];
    const month = MONTH_MAP[mCh];
    if (!month) return [];
    const nowYY = new Date().getFullYear() % 100;
    const fullYear = yy <= nowYY + 1 ? 2000 + yy : 1900 + yy;
    return [{ year: fullYear, month, score: 0.8 }];
  },
  explain: (serial, c) =>
    `LG: YY='${serial.slice(0, 2)}' → ${c.year}, month code '${serial[2]}' → ${c.month}.`,
};

export const lgRules: Rule[] = [lgYYM];