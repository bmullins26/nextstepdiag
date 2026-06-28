const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

const FULL_TO_CANONICAL = Object.fromEntries(
  Object.values(US_STATES).map((s) => [s.toUpperCase(), s]),
) as Record<string, string>;

const COUNTRY_ALIASES: Record<string, string> = {
  USA: "United States", "U.S.A": "United States", "U.S.": "United States",
  US: "United States", "UNITED STATES": "United States",
  CANADA: "Canada", CA_COUNTRY: "Canada",
  UK: "United Kingdom", "U.K.": "United Kingdom",
  "UNITED KINGDOM": "United Kingdom", ENGLAND: "United Kingdom",
  MEXICO: "Mexico", AUSTRALIA: "Australia", GERMANY: "Germany",
  FRANCE: "France", INDIA: "India", JAPAN: "Japan", CHINA: "China",
  BRAZIL: "Brazil", ITALY: "Italy", SPAIN: "Spain",
};

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export type NormalizedLocation = { state: string | null; isUS: boolean };

export function normalizeLocation(input: string | null | undefined): NormalizedLocation {
  if (!input) return { state: null, isUS: false };
  const cleaned = input.replace(/\d{5}(-\d{4})?/g, " ").replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return { state: null, isUS: false };
  const upper = cleaned.toUpperCase();

  // Full state name match (longest first)
  const sortedFull = Object.keys(FULL_TO_CANONICAL).sort((a, b) => b.length - a.length);
  for (const name of sortedFull) {
    if (upper.includes(name)) return { state: FULL_TO_CANONICAL[name], isUS: true };
  }

  // Abbreviation as standalone token
  const tokens = upper.split(/\s+/);
  for (const t of tokens) {
    if (US_STATES[t]) return { state: US_STATES[t], isUS: true };
  }

  // Country alias
  for (const k of Object.keys(COUNTRY_ALIASES)) {
    const needle = k.replace(/_COUNTRY$/, "");
    if (upper.includes(needle)) return { state: COUNTRY_ALIASES[k], isUS: false };
  }

  // Fallback: last comma-segment title-cased
  const last = (input.split(",").pop() ?? input).trim();
  return { state: last ? titleCase(last) : null, isUS: false };
}