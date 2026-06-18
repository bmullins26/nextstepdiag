import type { Rule } from "../types";

// Stub — rules pending. Never matches.
export const mieleRules: Rule[] = [
  {
    id: "miele.stub",
    name: "Miele (rule pending)",
    family: "Miele",
    pattern: /.^/,
    weight: 0,
    extract: () => [],
    explain: () => "Miele decoder not yet implemented.",
  },
];