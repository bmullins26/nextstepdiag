import type { Rule } from "../types";

const frigidaireYYWW: Rule = {
  id: "frigidaire.yy-ww",
  name: "Frigidaire/Electrolux Year-Week Decoder",
  family: "Frigidaire/Electrolux",
  pattern: /^\d{2}\d{2}\d+$/,
  weight: 0.85,
  extract: (serial) => {
    const m = serial.match(/^(\d{2})(\d{2})\d+$/);
    if (!m) return [];
    const yy = parseInt(m[1], 10);
    const ww = parseInt(m[2], 10);
    if (!Number.isFinite(yy) || !Number.isFinite(ww)) return [];
    if (ww < 1 || ww > 53) return [];
    const nowYY = new Date().getFullYear() % 100;
    const fullYear = yy <= nowYY + 1 ? 2000 + yy : 1900 + yy;
    return [{ year: fullYear, week: ww, score: 0.8 }];
  },
  explain: (serial, c) =>
    `Frigidaire/Electrolux: YY='${serial.slice(0, 2)}' → ${c.year}, WW='${serial.slice(2, 4)}' → week ${c.week}.`,
};

export const frigidaireRules: Rule[] = [frigidaireYYWW];