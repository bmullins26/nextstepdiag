// Server-side lookup of model production windows + technician cross-checks.
import type { CrossChecks, ModelWindow } from "./types";

function normalizeModel(model: string): string {
  return (model || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Finds the most specific production window whose prefix the model starts with.
 * Falls back to null when nothing is on file (validation then skips the check).
 */
export async function loadModelWindow(
  supabase: any,
  manufacturer: string,
  model: string,
): Promise<ModelWindow | null> {
  const norm = normalizeModel(model);
  if (!norm) return null;
  try {
    const { data, error } = await supabase
      .from("model_production_windows")
      .select("manufacturer, brand, model_prefix, introduced_year, discontinued_year, replacement_series")
      .ilike("manufacturer", manufacturer);
    if (error || !data?.length) return null;
    const matches = (data as any[])
      .filter((r) => norm.startsWith(normalizeModel(r.model_prefix)))
      .sort((a, b) => normalizeModel(b.model_prefix).length - normalizeModel(a.model_prefix).length);
    const best = matches[0];
    if (!best) return null;
    return {
      manufacturer: best.manufacturer,
      brand: best.brand,
      modelPrefix: best.model_prefix,
      introducedYear: best.introduced_year,
      discontinuedYear: best.discontinued_year,
      replacementSeries: best.replacement_series,
    };
  } catch {
    return null;
  }
}

/**
 * Technician confirmations + prior successful decodes for the same model family.
 * Never throws — cross-checks are strictly additive evidence.
 */
export async function loadCrossChecks(opts: {
  supabase: any;
  manufacturer: string;
  model: string;
  serial: string;
  apiYear?: number | null;
}): Promise<CrossChecks> {
  const out: CrossChecks = {
    apiYear: opts.apiYear ?? null,
    confirmedYear: null,
    communityConfirmations: 0,
    historicalYears: [],
  };
  try {
    const { data } = await opts.supabase
      .from("age_decode_ground_truth")
      .select("known_year, serial_number, model_number")
      .ilike("manufacturer", opts.manufacturer)
      .eq("serial_number", opts.serial);
    const rows = (data ?? []) as { known_year: number }[];
    if (rows.length) {
      // Most-confirmed year wins.
      const tally = new Map<number, number>();
      for (const r of rows) tally.set(r.known_year, (tally.get(r.known_year) ?? 0) + 1);
      const [year, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]!;
      out.confirmedYear = year;
      out.communityConfirmations = count;
    }
  } catch {
    /* ignore */
  }
  try {
    const norm = normalizeModel(opts.model).slice(0, 6);
    if (norm) {
      const { data } = await opts.supabase
        .from("age_decode_attempts")
        .select("manufacture_year")
        .eq("status", "ok")
        .ilike("manufacturer", opts.manufacturer)
        .ilike("model_number", `${norm}%`)
        .not("manufacture_year", "is", null)
        .limit(50);
      out.historicalYears = [
        ...new Set(((data ?? []) as { manufacture_year: number }[]).map((r) => r.manufacture_year)),
      ];
    }
  } catch {
    /* ignore */
  }
  return out;
}
