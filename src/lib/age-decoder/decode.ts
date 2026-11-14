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
  ConfidenceBreakdown,
  DateSource,
} from "./types";
import { canonicalBrandKey, isKenmore, rulesForBrand } from "./registry";
import { computeAgeYears } from "./scoring";
import { validateCandidate } from "./validate";
import { selectDate } from "./select";

/** Uppercase; strip spaces, dashes and dots. */
export function normalizeSerial(s: string): string {
  return (s || "").toUpperCase().replace(/[\s.\-]+/g, "");
}

/** Map O→0 and I→1 only in positions a rule requires to be digits. */
export function correctDigitPositions(serial: string, positions?: number[]): string {
  if (!positions?.length) return serial;
  const a = serial.split("");
  for (const p of positions) {
    if (a[p] === "O") a[p] = "0";
    else if (a[p] === "I") a[p] = "1";
  }
  return a.join("");
}

const EMPTY_CORROBORATION: Corroboration = { used: false, cached: false, hits: [], yearBoosts: {} };

const SOURCE_RULE: Record<Exclude<DateSource, "serial">, AppliedRule> = {
  plate_printed: { id: "plate.printed", name: "Date printed on plate", family: "Data plate" },
  plate_printed_prior: { id: "plate.printed-prior", name: "Data plate (reported earlier)", family: "Data plate" },
  factory_record: { id: "factory.record", name: "Manufacturer build record", family: "Factory record" },
  tech_picked: { id: "tech.picked", name: "Picked by technician", family: "Technician" },
};

type AttemptedRule = { id: string; name: string; matched: boolean; reason?: string };

function simpleBreakdown(percent: number, label: ConfidenceBreakdown["label"]): ConfidenceBreakdown {
  return { points: [], earned: percent, max: 100, percent, label };
}

/** Pure deterministic age decode. No AI. No network. No DB. */
export function decodeAge(input: DecodeInput): DecodeOutcome {
  const brandKey = canonicalBrandKey(input.brand, input.model);
  const serial = normalizeSerial(input.serial || "");
  const now = input.now ?? new Date();
  const modelWindow = input.modelWindow ?? null;
  const ev = input.evidence ?? null;

  const base = {
    corroboration: EMPTY_CORROBORATION,
    steps: [] as DecodeStep[],
    rejected: [] as RejectedCandidate[],
    validation: [] as ValidationCheck[],
    attemptedRules: [] as AttemptedRule[],
  };

  const unknown = (reason: UnknownReason, breakdown: string, extra?: Partial<typeof base> & { appliedRule?: AppliedRule | null; candidates?: DateCandidate[] }): DecodeOutcome => ({
    status: "unknown",
    appliedRule: extra?.appliedRule ?? null,
    confidence: "Unknown",
    confidencePercent: 0,
    unknownReason: reason,
    breakdown,
    candidates: extra?.candidates ?? [],
    corroboration: EMPTY_CORROBORATION,
    steps: [],
    rejected: extra?.rejected ?? [],
    validation: [],
    confidenceBreakdown: null,
    attemptedRules: extra?.attemptedRules ?? [],
    normalizedSerial: serial,
  });

  // Plate / prior plate / factory evidence wins even when the serial can't be decoded.
  const evidenceOnly = () => {
    const sel = selectDate([], ev, null, now);
    return sel.kind === "none" ? null : sel;
  };

  if (!brandKey) {
    const sel = evidenceOnly();
    if (sel) return finish(sel, null, [], base, serial, now);
    if (isKenmore(input.brand)) {
      return unknown("kenmore_prefix_needed", "Need the Kenmore model number's first 3 digits to know who built it.");
    }
    return unknown("unsupported_manufacturer", `"${input.brand}" isn't supported yet — read the date on the data plate.`);
  }
  if (!serial) {
    const sel = evidenceOnly();
    if (sel) return finish(sel, null, [], base, serial, now);
    return unknown("insufficient_information", "No serial number provided.");
  }

  const rules = rulesForBrand(input.brand, input.model)
    .slice()
    .sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));

  if (rules.length && rules.every((r) => r.weight === 0)) {
    const sel = evidenceOnly();
    if (sel) return finish(sel, null, [], base, serial, now);
    const guidance = rules[0]!.explain(serial, { year: 0 });
    const msg = guidance && !/not yet implemented/i.test(guidance)
      ? guidance
      : `${brandKey} serial date decoding isn't supported yet. Check the data plate for a printed build date.`;
    const win = modelWindow?.introducedYear
      ? ` Production years for ${modelWindow.modelPrefix}: ${modelWindow.introducedYear}–${modelWindow.discontinuedYear ?? "current"}. The exact date isn't in the serial.`
      : "";
    return unknown("missing_date_code", msg + win);
  }

  const attemptedRules: AttemptedRule[] = [];
  const rejected: RejectedCandidate[] = [];
  const valid: { rule: Rule; candidate: DateCandidate; checks: ValidationCheck[]; serial: string }[] = [];
  let noDateMessage: string | null = null;

  for (const rule of rules) {
    const s = correctDigitPositions(serial, rule.digitPositions);
    if (!rule.pattern.test(s)) {
      attemptedRules.push({ id: rule.id, name: rule.name, matched: false, reason: "serial did not match this format" });
      continue;
    }
    const raw = rule.extract(s, input.model);
    if (!raw.length) {
      if (rule.noDateMessage) noDateMessage = rule.noDateMessage;
      attemptedRules.push({ id: rule.id, name: rule.name, matched: false, reason: "no date code extracted" });
      continue;
    }
    let survivors = 0;
    for (const c of raw) {
      const res = validateCandidate(c, { rule, now });
      if (res.ok) {
        valid.push({ rule, candidate: c, checks: res.checks, serial: s });
        survivors++;
      } else rejected.push(res.rejection);
    }
    attemptedRules.push({ id: rule.id, name: rule.name, matched: survivors > 0, reason: survivors > 0 ? undefined : "all candidates failed validation" });
  }

  const ctx = { ...base, attemptedRules, rejected };

  if (!valid.length) {
    const sel = evidenceOnly();
    if (sel) return finish(sel, null, [], ctx, serial, now);
    if (noDateMessage) return unknown("year_not_in_table", noDateMessage, { rejected, attemptedRules });
    const anyPattern = rules.some((r) => r.pattern.test(correctDigitPositions(serial, r.digitPositions)));
    if (rejected.length) {
      return unknown("ambiguous_year_cycle", `All ${rejected.length} decoded date(s) were rejected (${rejected[0]!.reason}: ${rejected[0]!.detail})`, { rejected, attemptedRules });
    }
    return anyPattern
      ? unknown("missing_date_code", `Serial format matched a ${brandKey} rule but no date code was found — read the date on the data plate.`, { rejected, attemptedRules })
      : unknown("invalid_serial_format", "This serial format isn't supported yet — read the date on the data plate.", { rejected, attemptedRules });
  }

  const sel = selectDate(valid.map((v) => v.candidate), ev, modelWindow, now);
  if (sel.kind === "none") {
    return unknown("no_candidate_fits", "None of the decoded dates fit the other evidence — read the date on the data plate.", {
      rejected, attemptedRules, candidates: valid.map((v) => v.candidate),
    });
  }
  return finish(sel, valid, valid.map((v) => v.candidate), ctx, valid[0]!.serial, now);
}

function finish(
  sel: Exclude<ReturnType<typeof selectDate>, { kind: "none" }>,
  valid: { rule: Rule; candidate: DateCandidate; checks: ValidationCheck[]; serial: string }[] | null,
  allCandidates: DateCandidate[],
  ctx: { corroboration: Corroboration; rejected: RejectedCandidate[]; attemptedRules: AttemptedRule[] },
  serial: string,
  now: Date,
): DecodeOutcome {
  const seen = new Set<string>();
  const uniq = (cs: DateCandidate[]) => cs.filter((c) => {
    const k = `${c.year}-${c.month ?? ""}-${c.week ?? ""}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });

  if (sel.kind === "ambiguous") {
    const first = valid?.[0]?.rule ?? null;
    const years = [...new Set(sel.candidates.map((c) => c.year))];
    return {
      status: "ambiguous",
      appliedRule: sel.source === "plate_printed_prior" ? SOURCE_RULE.plate_printed_prior : first ? { id: first.id, name: first.name, family: first.family } : null,
      confidence: "Unknown",
      confidencePercent: 0,
      breakdown: sel.source === "plate_printed_prior"
        ? `Earlier data-plate reports disagree: ${years.join(" or ")}. Check the plate.`
        : `Built ${years.join(" or ")} — check the plate. The serial's date code repeats, so more than one date fits.`,
      candidates: uniq(sel.candidates),
      corroboration: ctx.corroboration,
      steps: [],
      rejected: ctx.rejected,
      validation: [],
      confidenceBreakdown: null,
      attemptedRules: ctx.attemptedRules,
      normalizedSerial: serial,
    };
  }

  const chosen = sel.chosen;
  const match = valid?.find((v) => v.candidate.year === chosen.year && (v.candidate.month ?? null) === (chosen.month ?? null) && (v.candidate.week ?? null) === (chosen.week ?? null));
  const rule = sel.source === "serial" ? match?.rule ?? valid?.[0]?.rule ?? null : null;
  const applied: AppliedRule = rule ? { id: rule.id, name: rule.name, family: rule.family } : SOURCE_RULE[sel.source as Exclude<DateSource, "serial">];
  const breakdown = rule ? rule.explain(serial, chosen) : `${applied.name}: ${chosen.month ? `${chosen.month}/` : ""}${chosen.year}.`;
  const label = sel.source === "serial" ? "Medium" : "High";
  return {
    status: "ok",
    appliedRule: applied,
    manufactureYear: chosen.year,
    manufactureMonth: chosen.month ?? null,
    manufactureWeek: chosen.week ?? null,
    ageYears: computeAgeYears(chosen.year, chosen.month, now),
    confidence: label,
    confidencePercent: label === "High" ? 95 : 70,
    candidates: uniq(allCandidates.length ? allCandidates : [chosen]),
    breakdown,
    corroboration: ctx.corroboration,
    steps: rule?.steps?.(serial, chosen) ?? [
      { label: "Rule used", value: applied.name, detail: applied.id },
      { label: "Serial", value: serial },
      { label: "Production date", value: `${chosen.month ? `${chosen.month}/` : ""}${chosen.year}`, detail: breakdown },
    ],
    rejected: ctx.rejected,
    validation: match?.checks ?? [],
    confidenceBreakdown: simpleBreakdown(label === "High" ? 95 : 70, label),
    attemptedRules: ctx.attemptedRules,
    dateSource: sel.source,
    normalizedSerial: serial,
  };
}
