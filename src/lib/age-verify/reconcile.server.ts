/**
 * Age reconciler — maps the decoder's strict-order result to display sources.
 * The decoder (select.ts) already applied: plate date → factory record →
 * upper bounds → production window → ambiguity. There is NO score summing
 * and NO winner picked from alternates here.
 */
import type { DecodeOutcome } from "@/lib/age-decoder";

export type ReconcileSource = {
  kind: "plate_printed" | "plate_printed_prior" | "factory_record" | "local_decoder";
  year: number;
  month?: number | null;
  label: string;
  detail?: string;
};

export type ReconcileResult = {
  status: "ok" | "ambiguous" | "unknown";
  bestYear: number | null;
  bestMonth: number | null;
  bestWeek: number | null;
  sources: ReconcileSource[];
  /** Internal provenance of the chosen date. */
  dateSource: string | null;
};

const KIND_LABEL: Record<ReconcileSource["kind"], string> = {
  plate_printed: "Data plate (you entered)",
  plate_printed_prior: "Data plate (reported earlier)",
  factory_record: "Whirlpool factory record",
  local_decoder: "Serial-number rule",
};

export function reconcileAge(input: { local: DecodeOutcome | null; factoryDetail?: string | null }): ReconcileResult {
  const o = input.local;
  if (!o || o.status === "unknown") {
    return { status: "unknown", bestYear: null, bestMonth: null, bestWeek: null, sources: [], dateSource: null };
  }
  if (o.status === "ambiguous") {
    return {
      status: "ambiguous", bestYear: null, bestMonth: null, bestWeek: null, dateSource: null,
      sources: o.candidates.map((c) => ({ kind: "local_decoder" as const, year: c.year, month: c.month ?? null, label: KIND_LABEL.local_decoder })),
    };
  }
  const kind: ReconcileSource["kind"] =
    o.dateSource === "plate_printed" ? "plate_printed"
    : o.dateSource === "plate_printed_prior" ? "plate_printed_prior"
    : o.dateSource === "factory_record" ? "factory_record"
    : "local_decoder";
  return {
    status: "ok",
    bestYear: o.manufactureYear,
    bestMonth: o.manufactureMonth,
    bestWeek: o.manufactureWeek,
    dateSource: o.dateSource,
    sources: [{
      kind, year: o.manufactureYear, month: o.manufactureMonth,
      label: kind === "local_decoder" ? `${KIND_LABEL.local_decoder} · ${o.appliedRule.name}` : KIND_LABEL[kind],
      detail: kind === "factory_record" ? input.factoryDetail ?? undefined : o.breakdown,
    }],
  };
}
