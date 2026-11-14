import type { Rule, DateCandidate } from "../types";

function decadeYears(d: number, nowYear: number): number[] {
  const out: number[] = [];
  for (let y = Math.floor(nowYear / 10) * 10 + d; y >= 1990; y -= 10) if (y <= nowYear + 1) out.push(y);
  return out.slice(0, 3);
}

/** Electrolux/Frigidaire (source: https://www.electrical-forensics.com/MajorAppliances/ElectroluxDateCodes.html):
 * 1st = plant (letter OR digit), 2nd = product letter + Y (year digit) + WW (week) + sequence. e.g. VF34007940 → wk 40 of 2023/2013. */
const frigidairePlantYWW: Rule = {
  id: "frigidaire.plant-y-ww",
  formatId: "frigidaire.plant-y-ww",
  effectiveFrom: 1990,
  effectiveTo: null,
  priority: 85,
  name: "Frigidaire/Electrolux Plant + Year + Week",
  family: "Frigidaire/Electrolux",
  pattern: /^[A-Z0-9][A-Z]\d\d{2}\d{4,}$/,
  digitPositions: [2, 3, 4],
  weight: 0.85,
  extract: (serial) => {
    const m = serial.toUpperCase().match(/^[A-Z0-9][A-Z](\d)(\d{2})\d+$/);
    if (!m) return [];
    const ww = parseInt(m[2], 10);
    if (ww < 1 || ww > 53) return [];
    return decadeYears(parseInt(m[1], 10), new Date().getFullYear()).map(
      (year): DateCandidate => ({ year, week: ww }),
    );
  },
  explain: (serial, c) =>
    `Frigidaire/Electrolux: plant '${serial.slice(0, 2)}', year digit '${serial[2]}' → ${c.year}, week '${serial.slice(3, 5)}' → week ${c.week}. Year digit repeats every 10 years.`,
};


export const frigidaireRules: Rule[] = [frigidairePlantYWW];
