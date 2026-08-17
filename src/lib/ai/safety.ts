// NextStep safety framework. Applied to ANY provider output (including Jenova)
// before it reaches the technician. Providers can never bypass these rules.

const HAZARD_RULES: { match: RegExp; warning: string }[] = [
  {
    match: /\b(live|energized|120\s?v|240\s?v|line voltage|mains|hot neutral|l1\b|l2\b)\b/i,
    warning:
      "LIVE VOLTAGE: This check involves energized circuits. Use a CAT III rated meter and insulated probes, keep one hand clear, and never bridge line to ground.",
  },
  {
    match: /\b(capacitor|inverter|compressor drive|vfd|start cap|run cap)\b/i,
    warning:
      "STORED ENERGY: Capacitors and inverter drives hold a lethal charge after power-down. Discharge and verify 0 V before touching terminals.",
  },
  {
    match: /\b(gas|lp\b|propane|burner|igniter|flame|thermocouple)\b/i,
    warning:
      "GAS HAZARD: Shut off the gas supply and check for leaks with approved solution before service. Do not create ignition sources.",
  },
  {
    match: /\b(refrigerant|sealed system|r-?600a|r-?134a|brazing|evaporator|condenser coil)\b/i,
    warning:
      "SEALED SYSTEM: Refrigerant work requires certification and PPE. R-600a is flammable — no open flame or sparks near the sealed system.",
  },
  {
    match: /\b(spin|rotate|belt|pulley|auger|impeller|blower|motor running)\b/i,
    warning:
      "MOVING PARTS: Keep hands, tools and clothing clear of rotating components; use the service-mode interlock defeat only when the test requires it.",
  },
  {
    match: /\b(heater|heating element|hot water|steam|burn|hot surface)\b/i,
    warning:
      "HOT SURFACE: Allow heating elements and hot water lines to cool, or wear heat-resistant gloves.",
  },
];

const BASE_RULE =
  "Disconnect power before any resistance/continuity test or component removal, and confirm 0 V with a meter.";

export function safetyWarningsFor(...texts: (string | null | undefined)[]): string[] {
  const blob = texts.filter(Boolean).join("\n").toLowerCase();
  const out: string[] = [];
  for (const rule of HAZARD_RULES) {
    if (rule.match.test(blob) && !out.includes(rule.warning)) out.push(rule.warning);
  }
  return out;
}

/**
 * Merge NextStep safety rules into a provider's step output. Provider-supplied
 * warnings are kept, but NextStep rules always take precedence and are appended.
 */
export function applySafetyFramework<
  T extends { recommendedNextTest?: string; safetyWarning?: string; mostLikelyFailure?: string },
>(output: T): T {
  const rules = safetyWarningsFor(
    output.recommendedNextTest,
    output.mostLikelyFailure,
    output.safetyWarning,
  );
  if (!rules.length && !output.safetyWarning) return output;
  const parts = [output.safetyWarning?.trim(), ...rules, BASE_RULE].filter(Boolean) as string[];
  return { ...output, safetyWarning: Array.from(new Set(parts)).join(" ") };
}
