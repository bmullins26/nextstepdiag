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
    // FD: 00–59 → 2020+YY, 60–99 → 1920+YY (FD0103 = Mar 2021, FD9405 = May 2014).
    // Sources: https://www.bsh-russia.ru/servis/fd-nomer , https://appliage.com/bosch-serial-number-lookup/
    const year = yy <= 59 ? 2020 + yy : 1920 + yy;
    const month = mm >= 1 && mm <= 12 ? mm : undefined;
    return [{ year, month }];
  },
  explain: (_serial, c) =>
    `BSH FD code: year=${c.year}${c.month ? `, month=${c.month}` : ""}.`,
};

export const boschRules: Rule[] = [bschFD];