import type { Rule } from "../types";

// Sub-Zero / Wolf / Cove: the manufacturer states serial numbers do NOT encode
// a date (subzero-wolf.com "Age of a Sub-Zero, Wolf, or Cove Appliance").
// Zero-weight rule → decoder reports "no date code" with this guidance, and the
// official model timeline (data/subzero-wolf-timeline.ts) bounds the age.
export const SUBZERO_GUIDANCE =
  "Sub-Zero, Wolf and Cove serial numbers do not contain a date code (manufacturer-stated). " +
  "Sub-Zero refrigeration: read 'Date Code' on the serial tag (bottom-right before April 2020, upper-right after). " +
  "Cove: 'MFG' bottom-right. Wolf speed ovens, microwaves, OG grills and Pro ventilation print a date; " +
  "Wolf ovens, ranges, cooktops, rangetops, steam ovens, coffee systems and warming drawers do not — " +
  "Sub-Zero Customer Care (800-222-7820) can give the build date from the serial.";

export const subZeroRules: Rule[] = [
  {
    id: "subzero.no-date-code",
    formatId: "subzero.no-date-code",
    name: "Sub-Zero / Wolf / Cove (no serial date code)",
    family: "Sub-Zero Group",
    effectiveFrom: 1945,
    effectiveTo: null,
    priority: 10,
    pattern: /.^/,
    weight: 0,
    extract: () => [],
    explain: () => SUBZERO_GUIDANCE,
  },
];
