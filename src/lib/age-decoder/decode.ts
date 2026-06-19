import type {
  DecodeInput,
  DecodeOutcome,
  AppliedRule,
  Confidence,
  DateCandidate,
  Rule,
  Corroboration,
} from "./types";
import { resolveBrand, rulesForBrand } from "./registry";
import {
  pickBestCandidate,
  computeAgeYears,
  scoreConfidence,
  applyCorroboration,
} from "./scoring";

function normalizeSerial(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

const EMPTY_CORROBORATION: Corroboration = {
  used: false,
  cached: false,
  hits: [],
  yearBoosts: {},
};

/** Pure deterministic age decode. No AI. No network. No DB. */
export function decodeAge(input: DecodeInput): DecodeOutcome {
  const brandKey = resolveBrand(input.brand);
  const serial = normalizeSerial(input.serial || "");
  const corroboration = input.corroboration ?? EMPTY_CORROBORATION;

  if (!brandKey) {
    return {
      status: "unknown",
      appliedRule: null,
      confidence: "Unknown",
      confidencePercent: 0,
      unknownReason: "unsupported_manufacturer",
      breakdown: `Manufacturer "${input.brand}" is not in the rule registry.`,
      candidates: [],
      corroboration,
    };
  }
  if (!serial) {
    return {
      status: "unknown",
      appliedRule: null,
      confidence: "Unknown",
      confidencePercent: 0,
      unknownReason: "insufficient_information",
      breakdown: "No serial number provided.",
      candidates: [],
      corroboration,
    };
  }

  const rules = rulesForBrand(input.brand, input.model);
  let appliedRule: Rule | null = null;
  let rawCandidates: DateCandidate[] = [];
  for (const r of rules) {
    if (!r.pattern.test(serial)) continue;
    const cs = r.extract(serial, input.model);
    if (cs.length) {
      appliedRule = r;
      rawCandidates = cs;
      break;
    }
  }

  if (!appliedRule || !rawCandidates.length) {
    const reason = rules.some((r) => r.pattern.test(serial))
      ? "missing_date_code"
      : "invalid_serial_format";
    return {
      status: "unknown",
      appliedRule: null,
      confidence: "Unknown",
      confidencePercent: 0,
      unknownReason: reason,
      breakdown:
        reason === "missing_date_code"
          ? `Serial format matched a ${brandKey} rule but no date code was extracted.`
          : `Serial "${serial}" did not match any ${brandKey} rule pattern.`,
      candidates: [],
      corroboration,
    };
  }

  // Apply corroboration boosts to candidate scores.
  const candidates = applyCorroboration(rawCandidates, corroboration);

  const chosen = pickBestCandidate(candidates, { now: input.now });
  if (!chosen) {
    return {
      status: "unknown",
      appliedRule: { id: appliedRule.id, name: appliedRule.name, family: appliedRule.family },
      confidence: "Unknown",
      confidencePercent: 0,
      unknownReason: "ambiguous_year_cycle",
      breakdown: "Rule matched but no candidate could be chosen.",
      candidates,
      corroboration,
    };
  }

  const { confidence, percent } = scoreConfidence({
    rule: appliedRule,
    candidates,
    chosen,
    corroboration,
  });

  // Low confidence → unknown (matches v1.1 grounding contract: don't guess).
  if (confidence === "Low") {
    return {
      status: "unknown",
      appliedRule: { id: appliedRule.id, name: appliedRule.name, family: appliedRule.family },
      confidence: "Unknown",
      confidencePercent: percent,
      unknownReason: "low_confidence",
      breakdown:
        `Decoded multiple possible years (${candidates.map((c) => c.year).join(", ")}) ` +
        `but couldn't corroborate one confidently. Please confirm the manufacture date on the data plate.`,
      candidates,
      corroboration,
    };
  }

  const ageYears = computeAgeYears(chosen.year, chosen.month, input.now);
  const applied: AppliedRule = {
    id: appliedRule.id,
    name: appliedRule.name,
    family: appliedRule.family,
  };

  return {
    status: "ok",
    appliedRule: applied,
    manufactureYear: chosen.year,
    manufactureMonth: chosen.month ?? null,
    manufactureWeek: chosen.week ?? null,
    ageYears,
    confidence,
    confidencePercent: percent,
    candidates,
    breakdown: appliedRule.explain(serial, chosen),
    corroboration,
  };
}