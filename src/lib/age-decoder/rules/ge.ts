import type { Rule, DateCandidate } from "../types";

const GE_LETTERS = "ABCDEFGHJKLM"; // 12 letters, skips I

const geMonthYear: Rule = {
  id: "ge.month-year-letters",
  formatId: "ge.month-year-letters",
  effectiveFrom: 1970,
  effectiveTo: null,
  priority: 80,
  name: "GE Month/Year Letter Decoder",
  family: "GE",
  pattern: /^[ABCDEFGHJKLM][ABCDEFGHJKLM].*/,
  weight: 0.7,
  extract: (serial) => {
    const s = serial.toUpperCase();
    const m = GE_LETTERS.indexOf(s[0] ?? "");
    const y = GE_LETTERS.indexOf(s[1] ?? "");
    if (m < 0 || y < 0) return [];
    const month = m + 1;
    const now = new Date().getFullYear();
    const out: DateCandidate[] = [];
    let i = 0;
    for (let base = 1985; base <= now + 1; base += 12) {
      const year = base + y;
      if (year >= 1985 && year <= now + 1) {
        out.push({ year, month, score: 0.2 + i * 0.15 });
        i++;
      }
    }
    return out;
  },
  explain: (serial, c) =>
    `GE: month letter '${serial[0]}', year letter '${serial[1]}' → ${c.month}/${c.year}. Year cycles every 12 years; most recent cycle picked.`,
};

export const geRules: Rule[] = [geMonthYear];