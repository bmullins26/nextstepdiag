import type { Rule } from "../types";

// Dacor (pre-Samsung-platform): 2 letters (product/revision) + YY + WW.
// Example FB 08 04 0263 → 2008, week 4. Source: building-center.org (secondary).
// Newer Samsung-built Dacor units may carry Samsung-format serials, so the
// registry also evaluates Samsung rules for Dacor.
export const dacorRules: Rule[] = [
  {
    id: "dacor.yyww",
    formatId: "dacor.yyww",
    name: "Dacor letters + YYWW",
    family: "Dacor",
    effectiveFrom: 1990,
    effectiveTo: null,
    priority: 75,
    pattern: /^[A-Z]{2}\d{6,}$/,
    weight: 0.7,
    extract: (s) => {
      const yy = parseInt(s.slice(2, 4), 10);
      const ww = parseInt(s.slice(4, 6), 10);
      if (!(ww >= 1 && ww <= 53)) return [];
      return [2000 + yy, 1900 + yy].map((year, i) => ({ year, week: ww, score: i ? 0.3 : 0.8 }));
    },
    explain: (s, c) =>
      `Dacor: digits '${s.slice(2, 4)}' = year ${c.year}, '${s.slice(4, 6)}' = week ${c.week}. Source: secondary reference.`,
  },
];
