// Declarative manufacturer rule descriptors, compiled into runtime Rules.
// New manufacturers/formats are added as DATA — no engine changes required.
import type { DateCandidate, DecodeStep, Rule } from "./types";

export type PositionSpec = {
  /** Zero-based index into the normalized serial. */
  start: number;
  /** Number of characters consumed. Defaults to 1. */
  length?: number;
};

export type YearSpec =
  | ({ kind: "letter-cycle" } & PositionSpec)   // letter → index into a cycling alphabet
  | ({ kind: "two-digit" } & PositionSpec)      // "24" → 2024
  | ({ kind: "digit-decade" } & PositionSpec)   // "5" → 2015 / 2025 candidates
  | ({ kind: "letter-map" } & PositionSpec);    // explicit letter → year table

export type MonthSpec =
  | ({ kind: "two-digit" } & PositionSpec)
  | ({ kind: "letter-map" } & PositionSpec)     // A=Oct etc, from lookupTables.months
  | ({ kind: "letter-cycle" } & PositionSpec);  // A=Jan..M=Dec (skipping I)

export type WeekSpec = { kind: "two-digit" } & PositionSpec;

export type RuleDescriptor = {
  manufacturer: string;
  formatId: string;
  name: string;
  /** Regex source strings; the first one that matches selects this rule. */
  serialFormats: string[];
  yearPosition?: YearSpec;
  monthPosition?: MonthSpec | null;
  weekPosition?: WeekSpec | null;
  lookupTables?: {
    /** Ordered alphabet for letter-cycle years (index 0 = cycleStart). */
    yearLetters?: string;
    cycleStart?: number;
    cycleLength?: number;
    /** Explicit letter → year map. */
    years?: Record<string, number>;
    /** Explicit char → month map. */
    months?: Record<string, number>;
  };
  effectiveFrom?: number;
  effectiveTo?: number | null;
  priority?: number;
  confidenceWeight: number;
};

const MONTH_LETTERS = "ABCDEFGHJKLM"; // skips I

function slice(serial: string, p: PositionSpec): string {
  return serial.slice(p.start, p.start + (p.length ?? 1));
}

function currentYear(): number {
  return new Date().getFullYear();
}

function yearsFor(desc: RuleDescriptor, serial: string): { years: number[]; raw: string } {
  const spec = desc.yearPosition;
  if (!spec) return { years: [], raw: "" };
  const raw = slice(serial, spec).toUpperCase();
  const now = currentYear();

  switch (spec.kind) {
    case "letter-cycle": {
      const letters = desc.lookupTables?.yearLetters ?? "";
      const start = desc.lookupTables?.cycleStart ?? 1973;
      const cycle = desc.lookupTables?.cycleLength ?? letters.length;
      const idx = letters.indexOf(raw);
      if (idx < 0 || !cycle) return { years: [], raw };
      const out: number[] = [];
      for (let base = start; base <= now + 1; base += cycle) {
        const y = base + idx;
        if (y >= start && y <= now + 1) out.push(y);
      }
      return { years: out, raw };
    }
    case "letter-map": {
      const y = desc.lookupTables?.years?.[raw];
      return { years: y ? [y] : [], raw };
    }
    case "two-digit": {
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n)) return { years: [], raw };
      const nowYY = now % 100;
      return { years: [n <= nowYY + 1 ? 2000 + n : 1900 + n], raw };
    }
    case "digit-decade": {
      const d = parseInt(raw, 10);
      if (!Number.isFinite(d)) return { years: [], raw };
      const baseDecade = Math.floor(now / 10) * 10;
      const out: number[] = [];
      for (const b of [baseDecade, baseDecade - 10, baseDecade - 20]) {
        const y = b + d;
        if (y <= now + 1) out.push(y);
      }
      return { years: out, raw };
    }
    default:
      return { years: [], raw };
  }
}

function monthFor(desc: RuleDescriptor, serial: string): { month?: number; raw: string } {
  const spec = desc.monthPosition;
  if (!spec) return { raw: "" };
  const raw = slice(serial, spec).toUpperCase();
  switch (spec.kind) {
    case "two-digit": {
      const n = parseInt(raw, 10);
      return { month: Number.isFinite(n) ? n : undefined, raw };
    }
    case "letter-map":
      return { month: desc.lookupTables?.months?.[raw], raw };
    case "letter-cycle": {
      const i = MONTH_LETTERS.indexOf(raw);
      return { month: i >= 0 ? i + 1 : undefined, raw };
    }
    default:
      return { raw };
  }
}

function weekFor(desc: RuleDescriptor, serial: string): { week?: number; raw: string } {
  const spec = desc.weekPosition;
  if (!spec) return { raw: "" };
  const raw = slice(serial, spec);
  const n = parseInt(raw, 10);
  return { week: Number.isFinite(n) ? n : undefined, raw };
}

/** Compile a declarative descriptor into the runtime Rule the engine consumes. */
export function compileRule(desc: RuleDescriptor): Rule {
  const patterns = desc.serialFormats.map((p) => new RegExp(p));
  const combined = new RegExp(desc.serialFormats.map((p) => `(?:${p})`).join("|"));

  const build = (serial: string) => {
    const s = serial.toUpperCase();
    const { years, raw: yearRaw } = yearsFor(desc, s);
    const { month, raw: monthRaw } = monthFor(desc, s);
    const { week, raw: weekRaw } = weekFor(desc, s);
    return { years, month, week, yearRaw, monthRaw, weekRaw };
  };

  return {
    id: desc.formatId,
    formatId: desc.formatId,
    name: desc.name,
    family: desc.manufacturer,
    pattern: combined,
    weight: desc.confidenceWeight,
    effectiveFrom: desc.effectiveFrom,
    effectiveTo: desc.effectiveTo ?? null,
    priority: desc.priority ?? 50,
    extract: (serial) => {
      if (!patterns.some((p) => p.test(serial.toUpperCase()))) return [];
      const { years, month, week } = build(serial);
      if (!years.length) return [];
      const now = currentYear();
      const derivedMonth =
        month ?? (week != null ? Math.min(12, Math.max(1, Math.ceil(week / 4.345))) : undefined);
      return years.map<DateCandidate>((year) => {
        const yearsAgo = Math.max(0, now - year);
        const score = Math.max(0.15, 0.9 - yearsAgo * 0.02);
        return { year, month: derivedMonth, week, score };
      });
    },
    explain: (serial, c) => {
      const { yearRaw, monthRaw, weekRaw } = build(serial);
      const bits = [`${desc.name}: year code '${yearRaw}' → ${c.year}`];
      if (monthRaw) bits.push(`month code '${monthRaw}' → ${c.month}`);
      if (weekRaw) bits.push(`week '${weekRaw}' → ${c.week}`);
      return `${bits.join(", ")}.`;
    },
    steps: (serial, c) => {
      const s = serial.toUpperCase();
      const { yearRaw, monthRaw, weekRaw } = build(serial);
      const out: DecodeStep[] = [
        { label: "Format", value: desc.name, detail: desc.formatId },
        { label: "Serial", value: s },
      ];
      if (desc.yearPosition) {
        out.push({
          label: `Character${(desc.yearPosition.length ?? 1) > 1 ? "s" : ""} ${desc.yearPosition.start + 1}${(desc.yearPosition.length ?? 1) > 1 ? `-${desc.yearPosition.start + (desc.yearPosition.length ?? 1)}` : ""}`,
          value: `Year code "${yearRaw}" → ${c.year}`,
        });
      }
      if (desc.monthPosition && monthRaw) {
        out.push({
          label: `Character ${desc.monthPosition.start + 1}`,
          value: `Month code "${monthRaw}" → ${c.month}`,
        });
      }
      if (desc.weekPosition && weekRaw) {
        out.push({
          label: `Characters ${desc.weekPosition.start + 1}-${desc.weekPosition.start + (desc.weekPosition.length ?? 2)}`,
          value: `Week ${weekRaw}${c.month ? ` → approx. month ${c.month}` : ""}`,
        });
      }
      out.push({
        label: "Production date",
        value: `${c.month ? `${c.month}/` : ""}${c.year}`,
      });
      return out;
    },
  };
}

export function compileRules(descs: RuleDescriptor[]): Rule[] {
  return descs.map(compileRule);
}
