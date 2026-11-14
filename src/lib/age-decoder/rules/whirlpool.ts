import type { Rule, DateCandidate } from "../types";

/**
 * Whirlpool-family serial date code: [plant][year char][WW week][sequence].
 * Units not built by Whirlpool carry an extra source letter after the plant
 * letter (e.g. HRC1848014 → year C, week 18).
 *
 * Year characters — published tables:
 *   https://www.electrical-forensics.com/MajorAppliances/WhirlpoolDateCodes.html
 *   https://www.appliancepartspros.com/b/whirlpool-serial-number-year-lookup/
 *   digits 0–9 = 2010–2019 (also 1980s / 1970s on very old units; never 2020+)
 *   X = 2020 / 1990; A–H = 2021–2028 / 1991–1998; J = 1999 (2029 future)
 *   K=2000 L=2001 M=2002 P=2003 R=2004 S=2005 T=2006 U=2007 W=2008 Y=2009
 *
 * Every valid reading is returned. The decoder never picks between cycles;
 * plate date / factory record / production window / receipt narrow them.
 */
const SINGLE: Record<string, number> = { K: 2000, L: 2001, M: 2002, P: 2003, R: 2004, S: 2005, T: 2006, U: 2007, W: 2008, Y: 2009 };

export function whirlpoolYears(ch: string): number[] {
  if (/^\d$/.test(ch)) { const d = Number(ch); return [2010 + d, 1980 + d, 1970 + d]; }
  if (ch === "X") return [2020, 1990];
  if (ch >= "A" && ch <= "H") { const i = ch.charCodeAt(0) - 65; return [2021 + i, 1991 + i]; }
  if (ch === "J") return [1999, 2029];
  return SINGLE[ch] != null ? [SINGLE[ch]] : [];
}

const isLetter = (c?: string) => !!c && /[A-Z]/.test(c);
const weekAt = (s: string, i: number) => {
  const t = s.slice(i, i + 2);
  if (!/^\d{2}$/.test(t)) return null;
  const w = Number(t);
  return w >= 1 && w <= 53 ? w : null;
};
const monthFromWeek = (w: number) => Math.min(12, Math.max(1, Math.ceil(w / 4.345)));

type Reading = { yearChar: string; weekIndex: number; source?: string };

export function whirlpoolReadings(serial: string): Reading[] {
  const s = serial.toUpperCase();
  if (!isLetter(s[0])) return [];
  const out: Reading[] = [];
  // (i) plant + year char + week
  out.push({ yearChar: s[1] ?? "", weekIndex: 2 });
  if (isLetter(s[1])) {
    // (ii) plant + source letter + digit year + week  /  (iii) source + letter year
    out.push({ yearChar: s[2] ?? "", weekIndex: 3, source: s[1] });
  }
  return out;
}

const whirlpoolPlantYearWeek: Rule = {
  id: "whirlpool.plant-year-week",
  formatId: "whirlpool.plant-year-week",
  effectiveFrom: 1970,
  effectiveTo: null,
  priority: 90,
  name: "Whirlpool Plant / Year / Week",
  family: "Whirlpool",
  pattern: /^[A-Z][A-Z0-9][A-Z0-9]\d{2,}/,
  weight: 0.9,
  // Digit positions for O→0 / I→1 correction (week digits of reading i).
  digitPositions: [2, 3],
  extract: (serial) => {
    const out: DateCandidate[] = [];
    for (const r of whirlpoolReadings(serial)) {
      const week = weekAt(serial.toUpperCase(), r.weekIndex);
      if (week == null) continue;
      for (const year of whirlpoolYears(r.yearChar)) {
        out.push({ year, week, month: monthFromWeek(week), reading: r.source ? `source letter '${r.source}', year '${r.yearChar}'` : `year '${r.yearChar}'` });
      }
    }
    return out;
  },
  explain: (serial, c) =>
    `Whirlpool: plant '${serial[0]}', ${c.reading ?? "year code"} → ${c.year}${c.week ? `, week ${c.week}` : ""}. Year codes repeat, so every matching year is listed.`,
};

/**
 * Older Maytag-built date code (Maytag, Amana, Jenn-Air, Admiral, Magic Chef,
 * Crosley, Norge, Neptune): digits followed by two letters; first trailing
 * letter = year (24-year cycle, used only up to 2013), second = month.
 * Source: https://www.electrical-forensics.com/MajorAppliances/MaytagDateCodes.html
 */
const MAYTAG_YEAR: Record<string, [number, number]> = {
  E: [1980, 2004], G: [1981, 2005], J: [1982, 2006], L: [1983, 2007], N: [1984, 2008], P: [1985, 2009],
  R: [1986, 2010], T: [1987, 2011], V: [1988, 2012], X: [1989, 2013], B: [1966, 1990], D: [1967, 1991],
  F: [1968, 1992], H: [1969, 1993], K: [1970, 1994], M: [1971, 1995], Q: [1972, 1996], S: [1973, 1997],
  U: [1974, 1998], W: [1975, 1999], Y: [1976, 2000], Z: [1977, 2001], A: [1978, 2002], C: [1979, 2003],
};
export const MONTH_PAIRS: Record<string, number> = {
  A: 1, B: 1, C: 2, D: 2, E: 3, F: 3, G: 4, H: 4, J: 5, K: 5, L: 6, M: 6,
  N: 7, Q: 7, P: 8, S: 8, R: 9, U: 9, T: 10, W: 10, V: 11, Y: 11, X: 12, Z: 12,
};

export const MAYTAG_LEGACY_BRANDS = ["maytag", "amana", "jenn-air", "jennair", "admiral", "magic chef", "magicchef", "crosley", "norge", "neptune"];

export const maytagLegacy: Rule = {
  id: "maytag.legacy-year-month-letters",
  formatId: "maytag.legacy-year-month-letters",
  effectiveFrom: 1966,
  effectiveTo: 2013,
  priority: 80,
  name: "Maytag (older) Year / Month Letters",
  family: "Maytag",
  pattern: /^\d{6,}[A-Z]{2}$/,
  weight: 0.85,
  brandFilter: MAYTAG_LEGACY_BRANDS,
  extract: (serial) => {
    const s = serial.toUpperCase();
    const y = MAYTAG_YEAR[s[s.length - 2] ?? ""];
    const month = MONTH_PAIRS[s[s.length - 1] ?? ""];
    if (!y || !month) return [];
    return [y[1], y[0]].filter((yr) => yr <= 2013).map((year) => ({ year, month }));
  },
  explain: (serial, c) =>
    `Maytag (older): year letter '${serial[serial.length - 2]}' → ${c.year}, month letter '${serial[serial.length - 1]}' → ${c.month}. Year letters repeat every 24 years.`,
};

export const whirlpoolRules: Rule[] = [whirlpoolPlantYearWeek, maytagLegacy];
