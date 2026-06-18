// Rules-based serial-number decoders for major appliance brands.
// Each rule returns candidate manufacture dates that the AI then disambiguates
// using the model number. Logic derived from publicly documented serial
// conventions (Whirlpool letter codes, GE 2-letter month/year, Samsung
// position-based codes, LG YYM, Frigidaire YYWW, Bosch FD code, Speed Queen
// YYMM).

export type DateCandidate = {
  year: number;
  month?: number; // 1-12
  week?: number;  // 1-53
};

export type DecodeResult = {
  family: string;
  candidates: DateCandidate[];
  breakdown: string; // human-readable explanation of decoded fields
};

export type AppliedRule = {
  family: string;
  ruleId: string;
  breakdown: string;
};

const WHIRLPOOL_FAMILY = new Set([
  "whirlpool", "kitchenaid", "maytag", "amana", "jenn-air", "jennair",
  "roper", "estate", "inglis", "magic chef", "magicchef", "admiral",
  "crosley", "kenmore", "kenmore / sears", "bravos", "cabrio", "neptune",
  "norge", "caloric",
]);

const FRIGIDAIRE_FAMILY = new Set([
  "frigidaire", "electrolux", "gibson", "tappan", "kelvinator",
  "westinghouse", "white-westinghouse",
]);

const BSH_FAMILY = new Set(["bosch", "thermador", "gaggenau", "siemens"]);

const GE_FAMILY = new Set([
  "ge", "ge (general electric)", "general electric", "hotpoint", "cafe", "haier",
]);

const SPEED_QUEEN_FAMILY = new Set(["speed queen", "alliance laundry", "huebsch"]);

const norm = (s: string) => s.trim().toLowerCase();
const upper = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

// Whirlpool letter -> year mapping (cycles ~every 20yr, returns both candidates).
// Letters used historically: A..Y excluding I, O, Q, U. Reset roughly at "A" = 1993, then "A" = 2013.
const WP_LETTERS = "ABCDEFGHJKLMNPRSTVWXY".split("");
function whirlpoolYearsFromLetter(letter: string): number[] {
  const idx = WP_LETTERS.indexOf(letter.toUpperCase());
  if (idx < 0) return [];
  // Two cycles: starting 1993 and 2013.
  return [1993 + idx, 2013 + idx].filter((y) => y >= 1993 && y <= new Date().getFullYear() + 1);
}

function geMonthYearFromLetters(two: string): DateCandidate[] {
  // GE: first 2 letters of serial = MonthLetter + YearLetter (rolling code).
  // Months: A..M skipping I -> Jan..Dec; Years cycle every 12 (A..M skipping I).
  const M = "ABCDEFGHJKLM";
  const Y = "ABCDEFGHJKLM";
  const m = M.indexOf(two[0]?.toUpperCase() ?? "");
  const y = Y.indexOf(two[1]?.toUpperCase() ?? "");
  if (m < 0 || y < 0) return [];
  const month = m + 1;
  const now = new Date().getFullYear();
  // Year letter cycles every 12 years. Build candidates from 1985 onward.
  const out: DateCandidate[] = [];
  for (let base = 1985; base <= now + 1; base += 12) {
    const year = base + y;
    if (year >= 1985 && year <= now + 1) out.push({ year, month });
  }
  return out;
}

export function decodeSerial(brand: string, serial: string): DecodeResult {
  const b = norm(brand);
  const s = upper(serial);
  if (!s) return { family: brand, candidates: [], breakdown: "No serial provided." };

  // --- Whirlpool family: starts with letter (week code) + letter (year) + digits ---
  if (WHIRLPOOL_FAMILY.has(b)) {
    // Common formats: C-W-1-23456 etc. First char often country/plant, second = week letter, then year digit?
    // The most common modern format: [Plant][YY-week-letter][YY][serial]  e.g. "C81234567" -> C=plant, 8=year (2018), 1234567=seq.
    // Use the second char (digit) for year-of-decade, third position year letter when present.
    // Strategy: detect a letter at index 1 (year code per WP letter table) OR a digit at index 1 (year-of-decade).
    const ch1 = s[1] ?? "";
    if (/[A-Z]/.test(ch1) && WP_LETTERS.includes(ch1)) {
      const years = whirlpoolYearsFromLetter(ch1);
      const wk = parseInt(s.slice(2, 4), 10);
      const candidates: DateCandidate[] = years.map((year) => ({ year, week: Number.isFinite(wk) ? wk : undefined }));
      return {
        family: "Whirlpool",
        candidates,
        breakdown: `Whirlpool family: plant '${s[0]}', year letter '${ch1}' (cycle: ${years.join(" or ")})${Number.isFinite(wk) ? `, week ${wk}` : ""}.`,
      };
    }
    if (/\d/.test(ch1)) {
      // Year-of-decade format; produce 3 candidates (current and prior decades).
      const d = parseInt(ch1, 10);
      const now = new Date().getFullYear();
      const baseDecade = Math.floor(now / 10) * 10;
      const candidates: DateCandidate[] = [baseDecade - 20, baseDecade - 10, baseDecade]
        .map((b2) => ({ year: b2 + d }))
        .filter((c) => c.year <= now + 1);
      const wk = parseInt(s.slice(2, 4), 10);
      if (Number.isFinite(wk)) for (const c of candidates) c.week = wk;
      return {
        family: "Whirlpool",
        candidates,
        breakdown: `Whirlpool family: plant '${s[0]}', year-of-decade digit '${d}'${Number.isFinite(wk) ? `, week ${wk}` : ""}. Model # is needed to pick the decade.`,
      };
    }
  }

  // --- GE family: first 2 letters of serial = month + year code ---
  if (GE_FAMILY.has(b)) {
    const candidates = geMonthYearFromLetters(s.slice(0, 2));
    if (candidates.length) {
      return {
        family: "GE",
        candidates,
        breakdown: `GE-format serial: month letter '${s[0]}', year letter '${s[1]}' (cycles every 12yr — model # disambiguates).`,
      };
    }
  }

  // --- Samsung: position 7 = year code, position 8 = month code (alphanumeric) ---
  if (b === "samsung") {
    const yChar = s[6];
    const mChar = s[7];
    if (yChar && mChar) {
      // Year code letters (skipping I, O): R=2014, S=2015, T=2016, V=2017, W=2018, X=2019, Y=2020, Z=2021, A=2022, B=2023, C=2024, D=2025.
      const yMap: Record<string, number> = {
        P: 2012, Q: 2013, R: 2014, S: 2015, T: 2016, V: 2017, W: 2018,
        X: 2019, Y: 2020, Z: 2021, A: 2022, B: 2023, C: 2024, D: 2025, E: 2026,
      };
      const mMap: Record<string, number> = {
        "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
        A: 10, B: 11, C: 12,
      };
      const year = yMap[yChar];
      const month = mMap[mChar];
      if (year) {
        return {
          family: "Samsung",
          candidates: [{ year, month }],
          breakdown: `Samsung serial: position 7 year code '${yChar}' = ${year}${month ? `, position 8 month code '${mChar}' = ${month}` : ""}.`,
        };
      }
    }
  }

  // --- LG: positions 1-3 = YYM (year + month digit, where month 1-9, A-C for 10-12) ---
  if (b === "lg") {
    const yy = parseInt(s.slice(0, 3), 10);
    if (Number.isFinite(yy)) {
      const yearShort = Math.floor(yy / 10);
      const monthDigit = yy % 10;
      const now = new Date().getFullYear() % 100;
      // Pick century guess: if yearShort > now+1, assume 1900s; else 2000s.
      const fullYear = yearShort <= now + 1 ? 2000 + yearShort : 1900 + yearShort;
      return {
        family: "LG",
        candidates: [{ year: fullYear, month: monthDigit || undefined }],
        breakdown: `LG serial: first 3 digits '${s.slice(0, 3)}' = year 20${String(yearShort).padStart(2, "0")}, month ${monthDigit}.`,
      };
    }
  }

  // --- Frigidaire family: YY (year) + WW (week) somewhere in first 4 digits ---
  if (FRIGIDAIRE_FAMILY.has(b)) {
    const m = s.match(/(\d{2})(\d{2})/);
    if (m) {
      const yy = parseInt(m[1], 10);
      const ww = parseInt(m[2], 10);
      const now = new Date().getFullYear() % 100;
      const fullYear = yy <= now + 1 ? 2000 + yy : 1900 + yy;
      return {
        family: "Frigidaire/Electrolux",
        candidates: [{ year: fullYear, week: ww >= 1 && ww <= 53 ? ww : undefined }],
        breakdown: `Frigidaire-format: year '${m[1]}' = ${fullYear}, week '${m[2]}' = ${ww}.`,
      };
    }
  }

  // --- Bosch/Thermador/Gaggenau: FD code (FD8901 -> year-1920 + month).
  // If serial contains FDxxxx use that; otherwise note unknown.
  if (BSH_FAMILY.has(b)) {
    const m = s.match(/FD\s*(\d{2})(\d{2})/);
    if (m) {
      const year = 1920 + parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      return {
        family: "BSH",
        candidates: [{ year, month: month >= 1 && month <= 12 ? month : undefined }],
        breakdown: `Bosch/Thermador FD code: FD${m[1]}${m[2]} -> ${month}/${year}.`,
      };
    }
    return {
      family: "BSH",
      candidates: [],
      breakdown: "Bosch/Thermador needs the FD-code (look for 'FD' followed by 4 digits on the data plate).",
    };
  }

  // --- Speed Queen / Alliance: YYMM prefix ---
  if (SPEED_QUEEN_FAMILY.has(b)) {
    const yy = parseInt(s.slice(0, 2), 10);
    const mm = parseInt(s.slice(2, 4), 10);
    if (Number.isFinite(yy) && Number.isFinite(mm)) {
      const now = new Date().getFullYear() % 100;
      const fullYear = yy <= now + 1 ? 2000 + yy : 1900 + yy;
      return {
        family: "Speed Queen",
        candidates: [{ year: fullYear, month: mm >= 1 && mm <= 12 ? mm : undefined }],
        breakdown: `Speed Queen / Alliance YYMM: '${s.slice(0, 4)}' -> ${mm}/${fullYear}.`,
      };
    }
  }

  // Unknown / unsupported: return empty, the AI will do its best.
  return {
    family: brand,
    candidates: [],
    breakdown: "Serial format not in rules table — relying on AI inference from model + serial.",
  };
}

/**
 * Deterministically pick the best date candidate. No AI.
 * Strategy: if only one candidate, take it. Otherwise prefer the one closest
 * to (but not after) today, since most appliances under service are <25yr old.
 * Returns null if no candidates.
 */
export function pickBestCandidate(candidates: DateCandidate[]): DateCandidate | null {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const now = new Date();
  const nowYear = now.getFullYear();
  // Filter out future-dated candidates (>1 yr ahead = impossible).
  const valid = candidates.filter((c) => c.year <= nowYear + 1);
  if (!valid.length) return candidates[0];
  // Pick the most recent candidate <= today (typical service-call appliance).
  valid.sort((a, b) => b.year - a.year);
  return valid[0];
}

/**
 * Compute age in years from a manufacture date. Deterministic — no AI.
 */
export function computeAgeYears(year: number, month?: number): number {
  const refMonth = month && month >= 1 && month <= 12 ? month : 6; // mid-year if unknown
  const date = new Date(year, refMonth - 1, 1);
  const ms = Date.now() - date.getTime();
  return Math.max(0, ms / (365.25 * 24 * 3600 * 1000));
}