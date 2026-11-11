// Warranty Intelligence — deterministic coverage windows from brand + type + build date.
// Pure module (no I/O) so it runs instantly on client or server and is unit-tested.
// Values are typical published manufacturer terms; always shown to the tech as "typical — verify with registration".

export type CoverageItem = {
  component: string;
  years: number;
  scope: "parts_labor" | "parts_only";
  expiresYear: number;
  active: boolean;
};

export type WarrantyResult = {
  status: "in_warranty" | "partial" | "expired" | "unknown";
  headline: string;
  items: CoverageItem[];
};

type Rule = { component: string; years: number; scope: CoverageItem["scope"] };

const BASE: Rule = { component: "Full unit", years: 1, scope: "parts_labor" };

function category(type: string): "fridge" | "washer" | "dryer" | "dishwasher" | "range" | "other" {
  const t = type.toLowerCase();
  if (/(fridge|refrig|freezer)/.test(t)) return "fridge";
  if (/wash/.test(t) && !/dish/.test(t)) return "washer";
  if (/dry/.test(t)) return "dryer";
  if (/dish/.test(t)) return "dishwasher";
  if (/(range|oven|cook|stove)/.test(t)) return "range";
  return "other";
}

const WHIRLPOOL_FAMILY = ["whirlpool", "maytag", "kitchenaid", "amana", "jennair", "jenn-air", "roper", "estate", "crosley"];

export function extendedRules(brand: string, type: string): Rule[] {
  const b = brand.toLowerCase().trim();
  const c = category(type);
  const rules: Rule[] = [];
  if (c === "fridge") {
    if (b === "samsung") {
      rules.push({ component: "Sealed system", years: 5, scope: "parts_labor" });
      rules.push({ component: "Digital inverter compressor", years: 10, scope: "parts_only" });
    } else if (b === "lg") {
      rules.push({ component: "Sealed system", years: 5, scope: "parts_labor" });
      rules.push({ component: "Linear/inverter compressor", years: 10, scope: "parts_only" });
    } else {
      rules.push({ component: "Sealed system", years: 5, scope: "parts_only" });
    }
  }
  if (c === "washer") {
    if (b === "lg") rules.push({ component: "Direct-drive motor", years: 10, scope: "parts_only" });
    if (b === "samsung") rules.push({ component: "Digital inverter motor", years: 10, scope: "parts_only" });
    if (WHIRLPOOL_FAMILY.includes(b)) rules.push({ component: "Motor & basket", years: 10, scope: "parts_only" });
    if (b === "speed queen") rules.push({ component: "Full unit", years: 5, scope: "parts_labor" });
  }
  if (c === "dryer" && b === "speed queen") rules.push({ component: "Full unit", years: 5, scope: "parts_labor" });
  if (c === "dryer" && b === "lg") rules.push({ component: "Drum motor", years: 10, scope: "parts_only" });
  if (c === "dishwasher") {
    if (WHIRLPOOL_FAMILY.includes(b) || ["bosch", "ge", "lg", "samsung"].includes(b))
      rules.push({ component: "Stainless tub & racks", years: 5, scope: "parts_only" });
  }
  return rules;
}

export function computeWarranty(input: {
  brand: string;
  applianceType: string;
  manufactureYear: number | null | undefined;
  currentYear?: number;
}): WarrantyResult {
  const year = input.manufactureYear;
  if (!year) return { status: "unknown", headline: "Build date unknown — can't check coverage", items: [] };
  const now = input.currentYear ?? new Date().getFullYear();
  const rules = [BASE, ...extendedRules(input.brand, input.applianceType)];
  const items: CoverageItem[] = rules.map((r) => {
    const expiresYear = year + r.years;
    return { ...r, expiresYear, active: expiresYear >= now };
  });
  const active = items.filter((i) => i.active);
  const base = items[0];
  if (base.active || active.some((i) => i.component === "Full unit"))
    return { status: "in_warranty", headline: `Likely in factory warranty (through ${Math.max(...active.map((a) => a.expiresYear))})`, items };
  if (active.length > 0) {
    const longest = active.reduce((a, b) => (b.expiresYear > a.expiresYear ? b : a));
    return { status: "partial", headline: `Out of 1-yr parts · ${longest.component} covered to ${longest.expiresYear}`, items };
  }
  return { status: "expired", headline: `Out of factory warranty · ${now - year} yrs old`, items };
}
