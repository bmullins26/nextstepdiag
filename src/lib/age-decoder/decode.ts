import type {
  DecodeInput,
  DecodeOutcome,
  AppliedRule,
  Confidence,
  DateCandidate,
  Rule,
} from "./types";
import { resolveBrand, rulesForBrand } from "./registry";
import { pickBestCandidate, computeAgeYears } from "./scoring";

function normalizeSerial(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

function classifyConfidence(
  rule: Rule,
  candidates: DateCandidate[],
  chosen: DateCandidate,
): Confidence {
  if (rule.weight >= 0.85 && candidates.length === 1) return "High";
  if (candidates.length === 1) return "Medium";
  const sorted = candidates.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = sorted[0]?.score ?? 0;
  const next = sorted[1]?.score ?? 0;
  if (chosen === sorted[0] && top - next >= 0.3) return "Medium";
  return "Low";
}

/** Pure deterministic age decode. No AI. No network. No DB. */
export function decodeAge(input: DecodeInput): DecodeOutcome {
  const brandKey = resolveBrand(input.brand);
  const serial = normalizeSerial(input.serial || "");

  if (!brandKey) {
    return {
      status: "unknown",
      appliedRule: null,
      confidence: "Unknown",
      unknownReason: "unsupported_manufacturer",
      breakdown: `Manufacturer "${input.brand}" is not in the rule registry.`,
      candidates: [],
    };
  }
  if (!serial) {
    return {
      status: "unknown",
      appliedRule: null,
      confidence: "Unknown",
      unknownReason: "insufficient_information",
      breakdown: "No serial number provided.",
      candidates: [],
    };
  }

  const rules = rulesForBrand(input.brand);
  let appliedRule: Rule | null = null;
  let candidates: DateCandidate[] = [];
  for (const r of rules) {
    if (!r.pattern.test(serial)) continue;
    const cs = r.extract(serial, input.model);
    if (cs.length) {
      appliedRule = r;
      candidates = cs;
      break;
    }
  }

  if (!appliedRule || !candidates.length) {
    const reason = rules.some((r) => r.pattern.test(serial))
      ? "missing_date_code"
      : "invalid_serial_format";
    return {
      status: "unknown",
      appliedRule: null,
      confidence: "Unknown",
      unknownReason: reason,
      breakdown:
        reason === "missing_date_code"
          ? `Serial format matched a ${brandKey} rule but no date code was extracted.`
          : `Serial "${serial}" did not match any ${brandKey} rule pattern.`,
      candidates: [],
    };
  }

  const chosen = pickBestCandidate(candidates, { now: input.now });
  if (!chosen) {
    return {
      status: "unknown",
      appliedRule: { id: appliedRule.id, name: appliedRule.name, family: appliedRule.family },
      confidence: "Unknown",
      unknownReason: "ambiguous_year_cycle",
      breakdown: "Rule matched but no candidate could be chosen.",
      candidates,
    };
  }

  const confidence = classifyConfidence(appliedRule, candidates, chosen);
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
    candidates,
    breakdown: appliedRule.explain(serial, chosen),
  };
}