import type { Rule } from "../types";

// Stub — rules pending. Never matches.
export const mieleRules: Rule[] = [
  {
    id: "miele.stub",
    formatId: "miele.stub",
    effectiveFrom: 1970,
    effectiveTo: null,
    priority: 10,
    name: "Miele (rule pending)",
    family: "Miele",
    pattern: /.^/,
    weight: 0,
    extract: () => [],
    explain: () => "Miele decoder not yet implemented.",
  },
];