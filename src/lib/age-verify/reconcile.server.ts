/**
 * Age reconciler — cross-references the RapidAPI provider, the local
 * deterministic decoder, Firecrawl web corroboration, and any user-submitted
 * ground truth. Picks the highest-scoring year and reports every source that
 * contributed so the UI can show them.
 *
 * This is the layer that fixes "one source lies and we believed it": no
 * source can win alone when the others disagree.
 */

import type { DecodeOutcome, Corroboration } from "@/lib/age-decoder";
import type { NormalizedAgeResult } from "@/lib/appliance-age-api.server";

export type ReconcileSource = {
  kind: "ground_truth" | "appliance_age_api" | "local_decoder" | "web_manufacturer" | "web_retailer" | "web_review" | "web_general";
  year: number;
  month?: number | null;
  weight: number;      // 0..1 — base credibility of the source
  confidence: number;  // 0..1 — this source's confidence in the year
  label: string;       // human-readable
  detail?: string;
  url?: string;
};

export type ReconcileResult = {
  bestYear: number | null;
  bestMonth: number | null;
  confidencePercent: number;   // 0..100
  confidenceLabel: "High" | "Medium" | "Low" | "Unknown";
  agreementCount: number;      // # of distinct source kinds agreeing on bestYear
  disagreement: boolean;       // true when top-2 candidates are both meaningful
  sources: ReconcileSource[];
  scoresByYear: Record<number, number>;
  chosenSourceKinds: ReconcileSource["kind"][];
};

const KIND_LABEL: Record<ReconcileSource["kind"], string> = {
  ground_truth: "User-verified data plate",
  appliance_age_api: "Appliance Age Finder API",
  local_decoder: "Serial-number rule",
  web_manufacturer: "Manufacturer site",
  web_retailer: "Retailer listing",
  web_review: "Owner review",
  web_general: "Web reference",
};

function corroborationKind(sourceType?: string): ReconcileSource["kind"] {
  switch (sourceType) {
    case "manufacturer": return "web_manufacturer";
    case "retailer": return "web_retailer";
    case "review": return "web_review";
    default: return "web_general";
  }
}

const KIND_WEIGHT: Record<ReconcileSource["kind"], number> = {
  ground_truth: 1.0,
  web_manufacturer: 0.9,
  appliance_age_api: 0.85,
  web_retailer: 0.55,
  local_decoder: 0.55,
  web_review: 0.35,
  web_general: 0.25,
};

export type ReconcileInput = {
  api: NormalizedAgeResult | null;
  apiOk: boolean;
  local: DecodeOutcome | null;
  corroboration: Corroboration | null;
  groundTruth?: { year: number; month?: number | null; source?: string | null } | null;
};

export function reconcileAge(input: ReconcileInput): ReconcileResult {
  const sources: ReconcileSource[] = [];

  if (input.groundTruth) {
    sources.push({
      kind: "ground_truth",
      year: input.groundTruth.year,
      month: input.groundTruth.month ?? null,
      weight: KIND_WEIGHT.ground_truth,
      confidence: 1.0,
      label: KIND_LABEL.ground_truth,
      detail: input.groundTruth.source
        ? `Reported from ${input.groundTruth.source.replace("_", " ")}`
        : "Reported by a technician",
    });
  }

  if (input.apiOk && input.api?.manufactureYear) {
    const conf = (input.api.confidencePercent ?? 60) / 100;
    sources.push({
      kind: "appliance_age_api",
      year: input.api.manufactureYear,
      month: input.api.manufactureMonth ?? null,
      weight: KIND_WEIGHT.appliance_age_api,
      confidence: Math.max(0.1, Math.min(1, conf)),
      label: KIND_LABEL.appliance_age_api,
      detail: input.api.description ?? undefined,
    });
    for (const alt of input.api.alternativeYears ?? []) {
      sources.push({
        kind: "appliance_age_api",
        year: alt.year,
        month: alt.month ?? null,
        weight: KIND_WEIGHT.appliance_age_api * 0.5,
        confidence: Math.max(0.05, Math.min(1, (alt.confidencePercent ?? 20) / 100)),
        label: `${KIND_LABEL.appliance_age_api} · alternate`,
      });
    }
  }

  if (input.local && input.local.status === "ok") {
    const primary = input.local.manufactureYear;
    const primaryConf = (input.local.confidencePercent ?? 40) / 100;
    sources.push({
      kind: "local_decoder",
      year: primary,
      month: input.local.manufactureMonth ?? null,
      weight: KIND_WEIGHT.local_decoder,
      confidence: Math.max(0.15, Math.min(1, primaryConf)),
      label: `${KIND_LABEL.local_decoder} · ${input.local.appliedRule.name}`,
      detail: input.local.breakdown,
    });
    for (const c of input.local.candidates) {
      if (c.year === primary) continue;
      sources.push({
        kind: "local_decoder",
        year: c.year,
        month: c.month ?? null,
        weight: KIND_WEIGHT.local_decoder * 0.6,
        confidence: Math.max(0.05, Math.min(1, c.score ?? 0.2)),
        label: `${KIND_LABEL.local_decoder} · alternate`,
      });
    }
  }

  if (input.corroboration?.used && input.corroboration.hits.length) {
    for (const hit of input.corroboration.hits) {
      if (!hit.year) continue;
      const kind = corroborationKind(hit.sourceType);
      sources.push({
        kind,
        year: hit.year,
        weight: KIND_WEIGHT[kind],
        confidence: 0.5, // per-hit confidence baked into corroboration weight
        label: KIND_LABEL[kind],
        detail: hit.title ?? hit.excerpt,
        url: hit.url,
      });
    }
    // Also fold in aggregated year boosts (cross-source agreement bonuses,
    // retailer signal, etc.) — these are already normalized in corroborateAge.
    // Applied later as a bonus, not as its own source row.
  }

  // Score aggregation.
  const scoresByYear: Record<number, number> = {};
  const kindsByYear: Record<number, Set<ReconcileSource["kind"]>> = {};
  for (const s of sources) {
    scoresByYear[s.year] = (scoresByYear[s.year] ?? 0) + s.weight * s.confidence;
    (kindsByYear[s.year] ??= new Set()).add(s.kind);
  }
  // Fold corroboration yearBoosts as additive nudges.
  if (input.corroboration?.yearBoosts) {
    for (const [yStr, boost] of Object.entries(input.corroboration.yearBoosts)) {
      const y = Number(yStr);
      if (!Number.isFinite(y)) continue;
      scoresByYear[y] = (scoresByYear[y] ?? 0) + boost;
    }
  }
  // Agreement bonus: each additional distinct kind agreeing on a year boosts it.
  for (const [yStr, kinds] of Object.entries(kindsByYear)) {
    const y = Number(yStr);
    if (kinds.size > 1) {
      scoresByYear[y] += 0.35 * (kinds.size - 1);
    }
  }

  const ranked = Object.entries(scoresByYear)
    .map(([y, s]) => ({ year: Number(y), score: s }))
    .filter((r) => Number.isFinite(r.year))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return {
      bestYear: null,
      bestMonth: null,
      confidencePercent: 0,
      confidenceLabel: "Unknown",
      agreementCount: 0,
      disagreement: false,
      sources: [],
      scoresByYear: {},
      chosenSourceKinds: [],
    };
  }

  const top = ranked[0];
  const second = ranked[1];
  const topKinds = Array.from(kindsByYear[top.year] ?? []);
  const bestMonthSource = sources
    .filter((s) => s.year === top.year && s.month != null)
    .sort((a, b) => b.weight * b.confidence - a.weight * a.confidence)[0];

  // Ground truth is authoritative — lock the answer to it.
  const gt = sources.find((s) => s.kind === "ground_truth");
  const bestYear = gt ? gt.year : top.year;
  const bestMonth = gt ? gt.month ?? null : bestMonthSource?.month ?? null;

  const spread = second ? top.score - second.score : top.score;
  const disagreement = !!second && second.score > 0.35 && spread < 0.25;

  let confidencePercent: number;
  let confidenceLabel: ReconcileResult["confidenceLabel"];
  if (gt) {
    confidencePercent = 99;
    confidenceLabel = "High";
  } else if (topKinds.length >= 2 && !disagreement) {
    confidencePercent = Math.min(95, 65 + Math.round(spread * 30));
    confidenceLabel = "High";
  } else if (topKinds.length >= 1 && !disagreement) {
    confidencePercent = Math.min(75, 45 + Math.round(spread * 25));
    confidenceLabel = "Medium";
  } else {
    confidencePercent = Math.max(20, Math.min(55, Math.round(top.score * 40)));
    confidenceLabel = "Low";
  }

  return {
    bestYear,
    bestMonth,
    confidencePercent,
    confidenceLabel,
    agreementCount: topKinds.length,
    disagreement,
    sources,
    scoresByYear,
    chosenSourceKinds: topKinds,
  };
}