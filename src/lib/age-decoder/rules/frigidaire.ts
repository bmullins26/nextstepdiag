import type { Rule, DateCandidate } from "../types";

function decadeYears(d: number, nowYear: number): number[] {
  const out: number[] = [];
  for (let y = Math.floor(nowYear / 10) * 10 + d; y >= 1990; y -= 10) if (y <= nowYear + 1) out.push(y);
  return out.slice(0, 3);
}

/** Modern Electrolux/Frigidaire: 2-letter plant + Y (year digit) + WW (week) + sequence. e.g. VF34007940 → wk 40 of 2023/2013. */
const frigidairePlantYWW: Rule = {
  id: "frigidaire.plant-y-ww",
  formatId: "frigidaire.plant-y-ww",
  effectiveFrom: 1990,
  effectiveTo: null,
  priority: 85,
  name: "Frigidaire/Electrolux Plant + Year + Week",
  family: "Frigidaire/Electrolux",
  pattern: /^[A-Z]{2}\d\d{2}\d{4,}$/,
  weight: 0.85,
  extract: (serial) => {
    const m = serial.toUpperCase().match(/^[A-Z]{2}(\d)(\d{2})\d+$/);
    if (!m) return [];
    const ww = parseInt(m[2], 10);
    if (ww < 1 || ww > 53) return [];
    return decadeYears(parseInt(m[1], 10), new Date().getFullYear()).map(
      (year, i): DateCandidate => ({ year, week: ww, score: Math.max(0.15, 0.6 - i * 0.2) }),
    );
  },
  explain: (serial, c) =>
    `Frigidaire/Electrolux: plant '${serial.slice(0, 2)}', year digit '${serial[2]}' → ${c.year}, week '${serial.slice(3, 5)}' → week ${c.week}. Year digit repeats every 10 years.`,
};

/** Legacy all-digit: YY + WW + sequence. */
const frigidaireYYWW: Rule = {
  id: "frigidaire.yy-ww",
  formatId: "frigidaire.yy-ww",
  effectiveFrom: 1990,
  effectiveTo: null,
  priority: 80,
  name: "Frigidaire/Electrolux Year-Week Decoder",
  family: "Frigidaire/Electrolux",
  pattern: /^\d{2}\d{2}\d+$/,
  weight: 0.85,
  extract: (serial) => {
    const m = serial.match(/^(\d{2})(\d{2})\d+$/);
    if (!m) return [];
    const yy = parseInt(m[1], 10);
    const ww = parseInt(m[2], 10);
    if (ww < 1 || ww > 53) return [];
    const nowYY = new Date().getFullYear() % 100;
    const fullYear = yy <= nowYY + 1 ? 2000 + yy : 1900 + yy;
    return [{ year: fullYear, week: ww, score: 0.8 }];
  },
  explain: (serial, c) =>
    `Frigidaire/Electrolux: YY='${serial.slice(0, 2)}' → ${c.year}, WW='${serial.slice(2, 4)}' → week ${c.week}.`,
};

export const frigidaireRules: Rule[] = [frigidairePlantYWW, frigidaireYYWW];
