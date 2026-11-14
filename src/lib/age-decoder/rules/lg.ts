import type { Rule, DateCandidate } from "../types";

/**
 * LG legacy (1990s–2010s): serial begins Y + MM  (Y = last digit of year, MM = 2-digit month).
 * Example: "909..." → year ending in 9, month 09 → 1999 / 2009 / 2019 candidates.
 * Disambiguated by model-number corroboration.
 */
const lgYMM: Rule = {
  id: "lg.ymm",
  formatId: "lg.ymm",
  effectiveFrom: 1995,
  effectiveTo: null,
  priority: 60,
  name: "LG Y+MM Decoder (legacy)",
  family: "LG",
  // Y digit, then MM 01-12. Avoid matching things that are also valid YY+M
  // (we'll dedupe by best score later).
  pattern: /^(?!\d(0[1-9]|1[0-2])[A-Z]{3})\d(0[1-9]|1[0-2])/,
  digitPositions: [0, 1, 2],
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
        out.push({ year, month: mm });
      }
    }
    return out;
  },
  explain: (serial, c) =>
    `LG legacy: year-digit '${serial[0]}' + MM '${serial.slice(1, 3)}' → ${c.month}/${c.year} (year digit repeats every 10 years).`,
};

/**
 * LG current washer/dryer/fridge format: Y + MM + 3-letter plant + sequence.
 * e.g. 112TNUW1W694 → Dec of a year ending in 1 (2021 / 2011).
 */
const lgYMMPlant: Rule = {
  id: "lg.ymm-plant",
  formatId: "lg.ymm-plant",
  effectiveFrom: 2000,
  effectiveTo: null,
  priority: 90,
  name: "LG Y+MM+Plant Decoder",
  family: "LG",
  pattern: /^\d(0[1-9]|1[0-2])[A-Z]{3}/,
  digitPositions: [0, 1, 2],
  weight: 0.85,
  extract: (serial) => {
    const s = serial.toUpperCase();
    const d = parseInt(s[0]!, 10);
    const mm = parseInt(s.slice(1, 3), 10);
    const now = new Date().getFullYear();
    const out: DateCandidate[] = [];
    for (let y = Math.floor(now / 10) * 10 + d; y >= 2000; y -= 10) {
      if (y <= now + 1) out.push({ year: y, month: mm });
    }
    return out.slice(0, 3);
  },
  explain: (serial, c) =>
    `LG: year digit '${serial[0]}' → ${c.year}, month '${serial.slice(1, 3)}' → ${c.month}, plant '${serial.slice(3, 6)}'. Year digit repeats every 10 years.`,
};

// LG documents: first digit = year, next two = month. (The unsourced YY+M
// rule was removed.)
export const lgRules: Rule[] = [lgYMMPlant, lgYMM];