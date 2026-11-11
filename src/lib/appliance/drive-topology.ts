/**
 * Deterministic washer drive-topology classifier.
 * Architecture decision: the AI must never guess the drive system — it is
 * resolved from model prefixes here and injected as a hard constraint into
 * diagnosis + closeout prompts, then enforced again by filterPartsForTopology.
 */
export type DriveTopology = "direct_drive_stator" | "belt_drive" | "unknown";

export type TopologyInfo = {
  topology: DriveTopology;
  label: string;
  /** Components that do not exist on this machine. */
  excludedComponents: string[];
  relevantComponents: string[];
};

// Ordered: first match wins, so more specific prefixes come first.
const RULES: { prefixes: string[]; topology: DriveTopology }[] = [
  // Whirlpool-family belt-drive VMW top-loaders
  { prefixes: ["WTW4", "WTW5", "MVWC", "MVWX", "MVW5", "MTW5", "7MWTW", "7MMVW", "WTW2", "WTW3"], topology: "belt_drive" },
  // Whirlpool-family direct-drive (stator/rotor) top-loaders & front-loaders
  { prefixes: ["MTW6", "MTW7", "MTW8", "MVW6", "MVW7", "MVW8", "MVWB", "WTW6", "WTW7", "WTW8", "WFW", "MHW", "MED", "7MWFW", "7MMHW"], topology: "direct_drive_stator" },
  // LG, Samsung, Fisher & Paykel, GE front-loaders
  { prefixes: ["WM", "WT", "WF", "WA", "WV", "WW", "GWL", "IWL", "WL", "GFW", "PFW"], topology: "direct_drive_stator" },
];

const STATOR_EXCLUDED = ["drive belt", "motor run capacitor", "shift actuator / shifter", "motor pulley", "drive coupler"];
const STATOR_RELEVANT = ["stator assembly", "magnetic rotor", "rotor position / Hall sensor", "motor control / inverter board", "tub bearings & seal", "splutch / clutch (Whirlpool)"];

export function classifyDriveTopology(applianceType: string, modelNumber: string): TopologyInfo {
  const t = applianceType.toLowerCase();
  const m = modelNumber.trim().toUpperCase().replace(/\s+/g, "");
  if (!t.includes("washer") || t.includes("dish") || !m) return { topology: "unknown", label: "", excludedComponents: [], relevantComponents: [] };
  const hit = RULES.find((r) => r.prefixes.some((p) => m.startsWith(p)));
  if (hit?.topology === "direct_drive_stator") {
    return { topology: "direct_drive_stator", label: "Direct-drive stator/rotor (no belt, no run capacitor, no shifter)", excludedComponents: STATOR_EXCLUDED, relevantComponents: STATOR_RELEVANT };
  }
  if (hit?.topology === "belt_drive") {
    return { topology: "belt_drive", label: "Belt-drive (motor, belt, pulley, shift actuator)", excludedComponents: ["stator assembly", "magnetic rotor"], relevantComponents: ["drive belt", "drive motor", "motor run capacitor", "shift actuator", "pulley"] };
  }
  return { topology: "unknown", label: "", excludedComponents: [], relevantComponents: [] };
}

export function topologyPromptBlock(info: TopologyInfo): string {
  if (info.topology === "unknown") return "";
  return `\nCRITICAL DRIVE TOPOLOGY (deterministic, overrides any assumption): ${info.label}.
- This machine has NO: ${info.excludedComponents.join(", ")}. NEVER suggest testing, inspecting or replacing these.
- Relevant drive components: ${info.relevantComponents.join(", ")}.\n`;
}

const EXCLUDE_PATTERNS: Record<DriveTopology, RegExp | null> = {
  direct_drive_stator: /\b(belt|capacitor|shift(er)?\s*actuator|shifter|pulley|coupler)\b/i,
  belt_drive: /\b(stator|rotor)\b/i,
  unknown: null,
};

/** Removes items that reference components the machine physically lacks. */
export function filterForTopology<T>(items: T[], info: TopologyInfo, text: (i: T) => string): T[] {
  const re = EXCLUDE_PATTERNS[info.topology];
  return re ? items.filter((i) => !re.test(text(i))) : items;
}
