import type { Rule } from "../types";

// Stub — rules pending. Never matches, so decoder returns Unknown.
export const fisherPaykelRules: Rule[] = [
  {
    id: "fisherpaykel.stub",
    formatId: "fisherpaykel.stub",
    effectiveFrom: 1970,
    effectiveTo: null,
    priority: 10,
    name: "Fisher & Paykel (rule pending)",
    family: "Fisher & Paykel",
    pattern: /.^/,
    weight: 0,
    extract: () => [],
    explain: () => "Fisher & Paykel decoder not yet implemented.",
  },
];