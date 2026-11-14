// Additional parent-OEM decoders (laundry, HVAC, water heaters).
// Every rule returns ALL plausible years when a code recycles, so the UI can
// show the full list of possible dates instead of a single silent guess.
import type { Rule, DateCandidate } from "../types";

const MONTH_LETTERS = "ABCDEFGHJKLM"; // A..M skipping I

/** Expand a 2-digit year into 19xx/20xx candidates that are not in the future. */
function twoDigitYears(yy: number): number[] {
  const now = new Date().getFullYear();
  return [2000 + yy, 1900 + yy].filter((y) => y <= now + 1 && y >= 1960);
}

function scored(years: number[], extra: Omit<DateCandidate, "year" | "score">): DateCandidate[] {
  // Most recent plausible year scores highest; older cycles still listed.
  return years
    .slice()
    .sort((a, b) => b - a)
    .map((year, i) => ({ year, ...extra, score: Math.max(0.2, 0.9 - i * 0.35) }));
}

const validMonth = (m: number) => (m >= 1 && m <= 12 ? m : undefined);
const validWeek = (w: number) => (w >= 1 && w <= 53 ? w : undefined);

function yyLeading(opts: {
  id: string; name: string; family: string; second: "month" | "week"; pattern: RegExp; weight: number;
}): Rule {
  return {
    id: opts.id, formatId: opts.id, name: opts.name, family: opts.family,
    pattern: opts.pattern, weight: opts.weight, priority: 80, effectiveFrom: 1990, effectiveTo: null,
    extract: (s) => {
      const yy = parseInt(s.slice(0, 2), 10);
      const nn = parseInt(s.slice(2, 4), 10);
      const extra = opts.second === "month" ? { month: validMonth(nn) } : { week: validWeek(nn) };
      if (!Object.values(extra)[0]) return [];
      return scored(twoDigitYears(yy), extra);
    },
    explain: (s, c) =>
      `${opts.family}: digits 1–2 '${s.slice(0, 2)}' = year ${c.year}, digits 3–4 '${s.slice(2, 4)}' = ${opts.second} ${opts.second === "month" ? c.month : c.week}.`,
  };
}

/**
 * Speed Queen / Alliance commercial: 2nd-to-last letter = year, last = month.
 * Source: https://docs.alliancelaundry.com/tech_pdf/prodinfo/D2288en.pdf
 * Letters outside the published table are NOT extrapolated.
 */
const ALLIANCE_YEAR: Record<string, number> = { P: 2009, R: 2010, T: 2011, V: 2012, X: 2013, B: 2014, D: 2015, F: 2016, H: 2017, K: 2018, M: 2019, Q: 2020 };
const ALLIANCE_MONTH: Record<string, number> = {
  A: 1, B: 1, C: 2, D: 2, E: 3, F: 3, G: 4, H: 4, J: 5, K: 5, L: 6, M: 6,
  N: 7, Q: 7, P: 8, S: 8, R: 9, U: 9, T: 10, W: 10, V: 11, Y: 11, X: 12, Z: 12,
};
const allianceCommercial: Rule = {
  id: "alliance.commercial-year-month-letters", formatId: "alliance.commercial-year-month-letters",
  name: "Alliance Laundry Commercial Year/Month Letters", family: "Alliance Laundry",
  pattern: /^[0-9A-Z]{6,}\d[A-Z]{2}$/, weight: 0.9, priority: 85, effectiveFrom: 2009, effectiveTo: 2020,
  extract: (s) => {
    const year = ALLIANCE_YEAR[s[s.length - 2] ?? ""];
    const month = ALLIANCE_MONTH[s[s.length - 1] ?? ""];
    return year && month ? [{ year, month }] : [];
  },
  noDateMessage: "Format recognized, year not in the published table — read the date on the plate.",
  explain: (s, c) => `Alliance commercial: year letter '${s[s.length - 2]}' → ${c.year}, month letter '${s[s.length - 1]}' → ${c.month}.`,
};

export const allianceRules: Rule[] = [
  allianceCommercial,
  yyLeading({ id: "alliance.yymm", name: "Alliance Laundry YYMM Decoder", family: "Alliance Laundry", second: "month", pattern: /^\d{8,}/, weight: 0.85 }),
];

export const goodmanRules: Rule[] = [
  yyLeading({ id: "goodman.yymm", name: "Goodman/Daikin YYMM Decoder", family: "Goodman/Daikin", second: "month", pattern: /^\d{10}$/, weight: 0.85 }),
];

export const aoSmithRules: Rule[] = [
  yyLeading({ id: "aosmith.yyww", name: "A.O. Smith YYWW Decoder", family: "A.O. Smith", second: "week", pattern: /^\d{4}[A-Z0-9]{4,}/, weight: 0.8 }),
];

export const traneRules: Rule[] = [
  yyLeading({ id: "trane.yyww-2010", name: "Trane/American Standard YYWW (2010+)", family: "Trane", second: "week", pattern: /^\d{4}[A-Z0-9]{5,}/, weight: 0.8 }),
];

export const carrierRules: Rule[] = [{
  id: "carrier.wwyy", formatId: "carrier.wwyy", name: "Carrier/ICP WWYY Decoder", family: "Carrier/ICP",
  pattern: /^\d{4}[A-Z]\d{4,}/, weight: 0.85, priority: 80, effectiveFrom: 1990, effectiveTo: null,
  extract: (s) => {
    const week = validWeek(parseInt(s.slice(0, 2), 10));
    if (!week) return [];
    return scored(twoDigitYears(parseInt(s.slice(2, 4), 10)), { week });
  },
  explain: (s, c) => `Carrier/ICP: digits 1–2 '${s.slice(0, 2)}' = week ${c.week}, digits 3–4 '${s.slice(2, 4)}' = year ${c.year}.`,
}];

export const lennoxRules: Rule[] = [{
  id: "lennox.ppyym", formatId: "lennox.ppyym", name: "Lennox Plant/Year/Month Decoder", family: "Lennox",
  pattern: /^\d{4}[A-M]/, weight: 0.8, priority: 80, effectiveFrom: 1990, effectiveTo: null,
  extract: (s) => {
    const month = MONTH_LETTERS.indexOf(s[4] ?? "") + 1;
    if (month < 1) return [];
    return scored(twoDigitYears(parseInt(s.slice(2, 4), 10)), { month });
  },
  explain: (s, c) => `Lennox: plant '${s.slice(0, 2)}', year '${s.slice(2, 4)}' = ${c.year}, month letter '${s[4]}' = ${c.month}.`,
}];

export const rheemRules: Rule[] = [{
  id: "rheem.lmmyy", formatId: "rheem.lmmyy", name: "Rheem/Ruud Month-Year Decoder", family: "Rheem",
  pattern: /^[A-Z]{1,2}\d{4}/, weight: 0.75, priority: 80, effectiveFrom: 1990, effectiveTo: null,
  extract: (s) => {
    const m = s.match(/^[A-Z]{1,2}(\d{2})(\d{2})/);
    if (!m) return [];
    const month = validMonth(parseInt(m[1]!, 10));
    if (!month) return [];
    return scored(twoDigitYears(parseInt(m[2]!, 10)), { month });
  },
  explain: (_s, c) => `Rheem/Ruud: month ${c.month}, year ${c.year} from the 4-digit block after the plant letter(s).`,
}];

// Bradford White: year letter recycles every 20 years (skips I, O, Q, R, U, V).
const BW_YEARS = "ABCDEFGHJKLMNPSTWXYZ";
export const bradfordWhiteRules: Rule[] = [{
  id: "bradfordwhite.year-month-letters", formatId: "bradfordwhite.year-month-letters",
  name: "Bradford White Year/Month Letter Decoder", family: "Bradford White",
  pattern: /^[A-HJ-NPSTW-Z][A-HJ-M]\d+/, weight: 0.75, priority: 80, effectiveFrom: 1964, effectiveTo: null,
  extract: (s) => {
    const yi = BW_YEARS.indexOf(s[0] ?? "");
    const month = MONTH_LETTERS.indexOf(s[1] ?? "") + 1;
    if (yi < 0 || month < 1) return [];
    const now = new Date().getFullYear();
    const years: number[] = [];
    for (let base = 1964; base <= now + 1; base += 20) if (base + yi <= now + 1) years.push(base + yi);
    return scored(years, { month });
  },
  explain: (s, c) => `Bradford White: year letter '${s[0]}' = ${c.year} (repeats every 20 years), month letter '${s[1]}' = ${c.month}.`,
}];
