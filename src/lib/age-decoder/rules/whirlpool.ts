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

/**
 * Whirlpool/Maytag/Amana 9-character modern format (used ~2020+ on many
 * platforms including current Maytag laundry, e.g. MED7230HWx):
 *
 *   [PP][WW][Y][SSSS]
 *   PP   – 2-letter plant code (ME=Marion OH, MF=Marion, etc.)
 *   WW   – 2-digit week of year (01..53)
 *   Y    – 1-digit year-of-decade
 *   SSSS – 4-digit sequence
 *
 * Example: ME0305172 → plant=ME, week=03, year-digit=5, sequence=0172.
 * Year-digit 5 resolves to 2025 (current decade) or 2015 (previous),
 * disambiguated by recency + corroboration.
 */
const whirlpoolModern9: Rule = {
  id: "whirlpool.modern-9char",
  name: "Whirlpool/Maytag 9-char Modern Decoder",
  family: "Whirlpool",
  pattern: /^[A-Z]{2}\d{7}$/,
  weight: 0.75,
  extract: (serial) => {
    // The exact position of the year-digit and week-digits in Whirlpool's
    // 9-char post-2020 scheme varies across plants and platforms — some are
    // `PP WW Y SSSS`, some are `PP W YY SSSS`, some are `PP Y WW SSSS`. We
    // emit every plausible (year, week) candidate and let the reconciler +
    // Firecrawl corroboration disambiguate.
    const s = serial.toUpperCase();
    const digits = s.slice(2); // 7 digits
    const now = new Date().getFullYear();
    const baseDecade = Math.floor(now / 10) * 10;
    const candidates: DateCandidate[] = [];
    const seen = new Set<string>();

    const yearFromDigit = (d: number, decadesBack: number) =>
      baseDecade - decadesBack * 10 + d;

    // Layout A: WW Y SSSS  (week at 0-1, year-digit at 2)
    const wwA = parseInt(digits.slice(0, 2), 10);
    const yA = parseInt(digits.slice(2, 3), 10);
    // Layout B: Y WW SSSS  (year-digit at 0, week at 1-2)
    const yB = parseInt(digits.slice(0, 1), 10);
    const wwB = parseInt(digits.slice(1, 3), 10);
    // Layout C: WW YY SSS  (week at 0-1, 2-digit year at 2-3)
    const wwC = parseInt(digits.slice(0, 2), 10);
    const yyC = parseInt(digits.slice(2, 4), 10);

    const push = (year: number, wk: number, score: number) => {
      if (!Number.isFinite(year) || !Number.isFinite(wk)) return;
      if (year < 2000 || year > now + 1) return;
      if (wk < 1 || wk > 53) return;
      const key = `${year}:${wk}`;
      if (seen.has(key)) return;
      seen.add(key);
      const month = Math.min(12, Math.max(1, Math.ceil(wk / 4.345)));
      candidates.push({ year, week: wk, month, score });
    };

    // Layout A candidates — most common current layout.
    if (Number.isFinite(yA) && Number.isFinite(wwA)) {
      push(yearFromDigit(yA, 0), wwA, 0.55); // current decade
      push(yearFromDigit(yA, 1), wwA, 0.30); // previous decade
    }
    // Layout B candidates.
    if (Number.isFinite(yB) && Number.isFinite(wwB)) {
      push(yearFromDigit(yB, 0), wwB, 0.50);
      push(yearFromDigit(yB, 1), wwB, 0.25);
    }
    // Layout C candidates (2-digit year, unambiguous).
    // Also emit decade cycles because Whirlpool has recycled 2-digit "05"
    // for '05, '15, '25 on some plants.
    if (Number.isFinite(yyC) && Number.isFinite(wwC)) {
      const base = yyC >= 70 ? 1900 + yyC : 2000 + yyC;
      push(base, wwC, 0.60);           // literal 2-digit year
      push(base + 10, wwC, 0.45);      // +1 decade cycle
      push(base + 20, wwC, 0.55);      // +2 decade cycle (recency bump)
    }

    return candidates;
  },
  explain: (serial, c) => {
    const s = serial.toUpperCase();
    return `Whirlpool 9-char: plant '${s.slice(0, 2)}', week ${s.slice(2, 4)}, year-digit '${s.slice(4, 5)}' → ${c.year}${c.month ? `, ~${c.month}/${c.year}` : ""}. Decade chosen by recency + corroboration.`;
  },
};

// Prepend the more specific 9-char rule so it wins over the generic
// [Letter][Letter]... regex on typical Maytag/Whirlpool serials.
export const whirlpoolRules: Rule[] = [whirlpoolModern9, whirlpoolLetterWeek, whirlpoolYearDigit];