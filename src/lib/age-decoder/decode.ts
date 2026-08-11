import type {
  DecodeInput,
  DecodeOutcome,
  AppliedRule,
  DateCandidate,
  DecodeStep,
  RejectedCandidate,
  Rule,
  Corroboration,
  UnknownReason,
  ValidationCheck,
} from "./types";
import { resolveBrand, rulesForBrand } from "./registry";
import { computeAgeYears, applyCorroboration } from "./scoring";
import { validateCandidate } from "./validate";
import { computeConfidence } from "./confidence";

function normalizeSerial(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

const EMPTY_CORROBORATION: Corroboration = {
  used: false,
  cached: false,
  hits: [],
  yearBoosts: {},
};

type AttemptedRule = { id: string; name: string; matched: boolean; reason?: string };

/** Pure deterministic age decode. No AI. No network. No DB. */
export function decodeAge(input: DecodeInput): DecodeOutcome {
  const brandKey = resolveBrand(input.brand);
  const serial = normalizeSerial(input.serial || "");
  const corroboration = input.corroboration ?? EMPTY_CORROBORATION;
  const now = input.now ?? new Date();
  const modelWindow = input.modelWindow ?? null;
  const crossChecks = input.crossChecks ?? null;

  const unknown = (
    reason: UnknownReason,
    breakdown: string,
    extra?: Partial<{
      appliedRule: AppliedRule | null;
      candidates: DateCandidate[];
      rejected: RejectedCandidate[];
      attemptedRules: AttemptedRule[];
      validation: ValidationCheck[];
    }>,
  ): DecodeOutcome => ({
    status: "unknown",
    appliedRule: extra?.appliedRule ?? null,
    confidence: "Unknown",
    confidencePercent: 0,
    unknownReason: reason,
    breakdown,
    candidates: extra?.candidates ?? [],
    corroboration,
    steps: [],
    rejected: extra?.rejected ?? [],
    validation: extra?.validation ?? [],
    confidenceBreakdown: null,
    attemptedRules: extra?.attemptedRules ?? [],
  });

  if (!brandKey) {
    return unknown(
      "unsupported_manufacturer",
      `Manufacturer "${input.brand}" is not in the rule registry.`,
    );
  }
  if (!serial) {
    return unknown("insufficient_information", "No serial number provided.");
  }

  // Evaluate every rule for the brand, highest priority first, so historical
  // serial formats are all considered instead of only the first match.
  const rules = rulesForBrand(input.brand, input.model)
    .slice()
    .sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));

  const attemptedRules: AttemptedRule[] = [];
  const rejected: RejectedCandidate[] = [];
  const valid: { rule: Rule; candidate: DateCandidate; checks: ValidationCheck[] }[] = [];

  for (const rule of rules) {
    if (!rule.pattern.test(serial)) {
      attemptedRules.push({
        id: rule.id,
        name: rule.name,
        matched: false,
        reason: "serial did not match this format",
      });
      continue;
    }
    const raw = rule.extract(serial, input.model);
    if (!raw.length) {
      attemptedRules.push({
        id: rule.id,
        name: rule.name,
        matched: false,
        reason: "no date code extracted",
      });
      continue;
    }
    const boosted = applyCorroboration(raw, corroboration);
    let survivors = 0;
    for (const c of boosted) {
      const res = validateCandidate(c, { rule, now, modelWindow });
      if (res.ok) {
        valid.push({ rule, candidate: c, checks: res.checks });
        survivors++;
      } else {
        rejected.push(res.rejection);
      }
    }
    attemptedRules.push({
      id: rule.id,
      name: rule.name,
      matched: survivors > 0,
      reason: survivors > 0 ? undefined : "all candidates failed validation",
    });
  }

  if (!valid.length) {
    const anyPattern = rules.some((r) => r.pattern.test(serial));
    const reason = rejected.length
      ? ("ambiguous_year_cycle" as const)
      : anyPattern
        ? ("missing_date_code" as const)
        : ("invalid_serial_format" as const);
    const breakdown = rejected.length
      ? `All ${rejected.length} decoded date(s) were rejected by validation (${rejected[0]!.reason}: ${rejected[0]!.detail})`
      : anyPattern
        ? `Serial format matched a ${brandKey} rule but no date code was extracted.`
        : `Serial "${serial}" did not match any ${brandKey} rule pattern.`;
    return unknown(reason, breakdown, { rejected, attemptedRules });
  }

  // Rank surviving candidates across every rule: candidate score weighted by
  // how trustworthy the rule is, plus a nudge toward rules whose era matches.
  const ranked = valid
    .map((v) => {
      const eraFit =
        v.rule.effectiveFrom != null &&
        v.candidate.year >= v.rule.effectiveFrom &&
        (v.rule.effectiveTo == null || v.candidate.year <= v.rule.effectiveTo)
          ? 0.1
          : 0;
      const apiMatch = crossChecks?.apiYear === v.candidate.year ? 0.4 : 0;
      const confirmedMatch = crossChecks?.confirmedYear === v.candidate.year ? 0.8 : 0;
      return {
        ...v,
        rank: (v.candidate.score ?? 0) * v.rule.weight + eraFit + apiMatch + confirmedMatch,
      };
    })
    .sort((a, b) => b.rank - a.rank);

  const best = ranked[0]!;
  const appliedRule = best.rule;
  const chosen = best.candidate;
  const candidates = ranked
    .filter((r) => r.rule.id === appliedRule.id)
    .map((r) => r.candidate);

  const confidenceBreakdown = computeConfidence({
    rule: appliedRule,
    chosen,
    candidates,
    corroboration,
    modelWindow,
    crossChecks,
    rejectedCount: rejected.length,
  });

  const ageYears = computeAgeYears(chosen.year, chosen.month, input.now);
  const applied: AppliedRule = {
    id: appliedRule.id,
    name: appliedRule.name,
    family: appliedRule.family,
  };

  const steps: DecodeStep[] =
    appliedRule.steps?.(serial, chosen) ??
    [
      { label: "Rule used", value: appliedRule.name, detail: appliedRule.id },
      { label: "Serial", value: serial },
      {
        label: "Production date",
        value: `${chosen.month ? `${chosen.month}/` : ""}${chosen.year}`,
        detail: appliedRule.explain(serial, chosen),
      },
    ];

  return {
    status: "ok",
    appliedRule: applied,
    manufactureYear: chosen.year,
    manufactureMonth: chosen.month ?? null,
    manufactureWeek: chosen.week ?? null,
    ageYears,
    confidence: confidenceBreakdown.label,
    confidencePercent: confidenceBreakdown.percent,
    candidates,
    breakdown: appliedRule.explain(serial, chosen),
    corroboration,
    steps,
    rejected,
    validation: best.checks,
    confidenceBreakdown,
    attemptedRules,
  };
}
