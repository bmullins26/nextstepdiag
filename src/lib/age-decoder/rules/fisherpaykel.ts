import type { Rule } from "../types";

// Stub — rules pending. Never matches, so decoder returns Unknown.
export const fisherPaykelRules: Rule[] = [
  {
    id: "fisherpaykel.stub",
    name: "Fisher & Paykel (rule pending)",
    family: "Fisher & Paykel",
    pattern: /.^/,
    weight: 0,
    extract: () => [],
    explain: () => "Fisher & Paykel decoder not yet implemented.",
  },
];