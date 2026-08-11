import type { Rule } from "../types";

const bschFD: Rule = {
  id: "bsh.fd-code",
  formatId: "bsh.fd-code",
  effectiveFrom: 1990,
  effectiveTo: null,
  priority: 90,
  name: "Bosch/Thermador FD-Code Decoder",
  family: "BSH",
  pattern: /FD\s*\d{4}/,
  weight: 0.95,
  extract: (serial) => {
    const m = serial.toUpperCase().match(/FD\s*(\d{2})(\d{2})/);
    if (!m) return [];
    const yy = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const year = 1920 + yy;
    const month = mm >= 1 && mm <= 12 ? mm : undefined;
    return [{ year, month, score: 0.95 }];
  },
  explain: (_serial, c) =>
    `BSH FD code: year=${c.year}${c.month ? `, month=${c.month}` : ""}.`,
};

export const boschRules: Rule[] = [bschFD];