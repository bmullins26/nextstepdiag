import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type OutcomeScope =
  | "exact_model"
  | "platform_family"
  | "manufacturer_type"
  | "manufacturer"
  | "none";

export type OutcomeStats = {
  scope: OutcomeScope;
  scopeLabel: string;
  sampleSize: number;
  exactModelCount: number;
  totals: { confirmed: number; incorrect: number; partial: number };
  ranked: Array<{ failure: string; share: number; weightedCount: number; rawCount: number }>;
};

type Row = {
  manufacturer: string | null;
  model_number: string | null;
  appliance_type: string | null;
  platform: string | null;
  complaint: string | null;
  recommended_failure: string | null;
  actual_failure: string | null;
  outcome: string;
};

const SCOPE_LABEL: Record<OutcomeScope, string> = {
  exact_model: "exact model",
  platform_family: "platform family",
  manufacturer_type: "manufacturer + appliance type",
  manufacturer: "manufacturer",
  none: "no historical data",
};

const WEIGHT: Record<Exclude<OutcomeScope, "none">, number> = {
  exact_model: 1.0,
  platform_family: 0.75,
  manufacturer_type: 0.5,
  manufacturer: 0.25,
};

function normalize(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

function complaintMatches(a: string, b: string): boolean {
  // Coarse complaint match — share a meaningful token to count as "similar"
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = new Set(a.split(/\W+/).filter((t) => t.length >= 4));
  for (const tok of b.split(/\W+/)) {
    if (tok.length >= 4 && ta.has(tok)) return true;
  }
  return false;
}

export async function loadOutcomeStats(
  supabase: SupabaseClient<Database>,
  input: {
    manufacturer: string;
    modelNumber?: string | null;
    applianceType: string;
    platform?: string | null;
    complaint: string;
  },
): Promise<OutcomeStats> {
  const mfg = normalize(input.manufacturer);
  const model = normalize(input.modelNumber);
  const type = normalize(input.applianceType);
  const platform = normalize(input.platform);
  const complaint = normalize(input.complaint);

  if (!mfg) {
    return {
      scope: "none",
      scopeLabel: SCOPE_LABEL.none,
      sampleSize: 0,
      exactModelCount: 0,
      totals: { confirmed: 0, incorrect: 0, partial: 0 },
      ranked: [],
    };
  }

  // Pull all candidate rows for this manufacturer that are resolved
  // (RLS already scopes to the caller; for the LLM we just need user-visible history)
  const { data: rows, error } = await supabase
    .from("diagnostic_outcomes")
    .select(
      "manufacturer,model_number,appliance_type,platform,complaint,recommended_failure,actual_failure,outcome",
    )
    .in("outcome", ["confirmed", "incorrect", "partial"])
    .ilike("manufacturer", input.manufacturer)
    .limit(2000);

  if (error || !rows || rows.length === 0) {
    return {
      scope: "none",
      scopeLabel: SCOPE_LABEL.none,
      sampleSize: 0,
      exactModelCount: 0,
      totals: { confirmed: 0, incorrect: 0, partial: 0 },
      ranked: [],
    };
  }

  // Tier rows + apply weighted contribution per failure
  const weighted = new Map<string, { weighted: number; raw: number }>();
  const totals = { confirmed: 0, incorrect: 0, partial: 0 };
  let exactModelCount = 0;
  let bestScope: OutcomeScope = "none";

  function bumpScope(s: Exclude<OutcomeScope, "none">) {
    const order: OutcomeScope[] = [
      "manufacturer",
      "manufacturer_type",
      "platform_family",
      "exact_model",
    ];
    if (order.indexOf(s) > order.indexOf(bestScope)) bestScope = s;
  }

  function addFailure(label: string | null | undefined, weight: number, raw: number) {
    const f = (label ?? "").trim();
    if (!f) return;
    const prev = weighted.get(f) ?? { weighted: 0, raw: 0 };
    weighted.set(f, { weighted: prev.weighted + weight, raw: prev.raw + raw });
  }

  for (const r of rows as Row[]) {
    const rMfg = normalize(r.manufacturer);
    const rModel = normalize(r.model_number);
    const rType = normalize(r.appliance_type);
    const rPlatform = normalize(r.platform);
    const rComplaint = normalize(r.complaint);
    if (rMfg !== mfg) continue;
    if (!complaintMatches(rComplaint, complaint)) continue;

    let tier: Exclude<OutcomeScope, "none"> | null = null;
    if (model && rModel === model) tier = "exact_model";
    else if (platform && rPlatform === platform && type && rType === type) tier = "platform_family";
    else if (type && rType === type) tier = "manufacturer_type";
    else tier = "manufacturer";

    bumpScope(tier);
    const w = WEIGHT[tier];
    if (tier === "exact_model") exactModelCount += 1;

    if (r.outcome === "confirmed") {
      totals.confirmed += 1;
      addFailure(r.recommended_failure, w, 1);
    } else if (r.outcome === "incorrect") {
      totals.incorrect += 1;
      addFailure(r.actual_failure ?? "(unspecified)", w, 1);
    } else if (r.outcome === "partial") {
      totals.partial += 1;
      addFailure(r.recommended_failure, w * 0.5, 0.5);
      if (r.actual_failure) addFailure(r.actual_failure, w * 0.5, 0.5);
    }
  }

  const sampleSize = totals.confirmed + totals.incorrect + totals.partial;
  if (sampleSize === 0) {
    return {
      scope: "none",
      scopeLabel: SCOPE_LABEL.none,
      sampleSize: 0,
      exactModelCount: 0,
      totals,
      ranked: [],
    };
  }

  const totalWeight = Array.from(weighted.values()).reduce((s, v) => s + v.weighted, 0) || 1;
  const ranked = Array.from(weighted.entries())
    .map(([failure, v]) => ({
      failure,
      share: Math.round((v.weighted / totalWeight) * 100),
      weightedCount: Math.round(v.weighted * 100) / 100,
      rawCount: Math.round(v.raw * 10) / 10,
    }))
    .sort((a, b) => b.weightedCount - a.weightedCount)
    .slice(0, 8);

  return {
    scope: bestScope,
    scopeLabel: SCOPE_LABEL[bestScope],
    sampleSize,
    exactModelCount,
    totals,
    ranked,
  };
}