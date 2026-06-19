import type { Rule, DateCandidate } from "../types";

const MONTH_MAP: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  A: 10, B: 11, C: 12,
};

/**
 * LG modern (post-2010): serial begins YY + M  (M = 1-9 or A,B,C for Oct/Nov/Dec).
 * Example: "24C..." → Dec 2024.
 */
const lgYYM: Rule = {
  id: "lg.yym",
  name: "LG YY+M Decoder (modern)",
  family: "LG",
  pattern: /^\d{2}[0-9ABC]/,
  weight: 0.85,
  extract: (serial) => {
    const s = serial.toUpperCase();
    const yy = parseInt(s.slice(0, 2), 10);
    const mCh = s[2] ?? "";
    const month = MONTH_MAP[mCh];
    if (!Number.isFinite(yy) || !month) return [];
    const nowYY = new Date().getFullYear() % 100;
    // Only return candidate when YY plausibly maps to 2000+ (modern era).
    if (yy > nowYY + 1) return [];
    return [{ year: 2000 + yy, month, score: 0.8 }];
  },
  explain: (serial, c) =>
    `LG modern: YY='${serial.slice(0, 2)}' → ${c.year}, month code '${serial[2]}' → ${c.month}.`,
};

/**
 * LG legacy (1990s–2010s): serial begins Y + MM  (Y = last digit of year, MM = 2-digit month).
 * Example: "909..." → year ending in 9, month 09 → 1999 / 2009 / 2019 candidates.
 * Disambiguated by model-number corroboration.
 */
const lgYMM: Rule = {
  id: "lg.ymm",
  name: "LG Y+MM Decoder (legacy)",
  family: "LG",
  // Y digit, then MM 01-12. Avoid matching things that are also valid YY+M
  // (we'll dedupe by best score later).
  pattern: /^\d(0[1-9]|1[0-2])/,
  weight: 0.70,
  extract: (serial) => {
    const s = serial.toUpperCase();
    const yDigit = parseInt(s[0] ?? "", 10);
    const mm = parseInt(s.slice(1, 3), 10);
    if (!Number.isFinite(yDigit) || !Number.isFinite(mm)) return [];
    if (mm < 1 || mm > 12) return [];
    const now = new Date().getFullYear();
    const out: DateCandidate[] = [];
    // Try 3 decades: 1999, 2009, 2019 etc.
    for (let base = 1990; base <= now; base += 10) {
      const year = base + yDigit;
      if (year >= 1990 && year <= now + 1) {
        // Recency-weighted: most recent gets higher score.
        const yearsAgo = now - year;
        const score = Math.max(0.15, 0.55 - yearsAgo * 0.015);
        out.push({ year, month: mm, score });
      }
    }
    return out;
  },
  explain: (serial, c) =>
    `LG legacy: year-digit '${serial[0]}' + MM '${serial.slice(1, 3)}' → ${c.month}/${c.year} (decade chosen by recency + model corroboration).`,
};

// Order matters: modern format first (single candidate, higher weight).
export const lgRules: Rule[] = [lgYYM, lgYMM];