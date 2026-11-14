// Server-side production windows + prior data-plate reports.
// Windows are keyed by canonical registry brand key + windowModelKey(model),
// identically on read and write. Provenance is internal only.
import type { ModelWindow, YearMonth } from "./types";
import { staticModelWindow } from "./oem-timelines";
import { canonicalBrandKey, windowModelKey } from "./registry";
import { normalizeSerial } from "./decode";

export async function loadModelWindow(
  supabase: any,
  brand: string,
  model: string,
): Promise<ModelWindow | null> {
  const brandKey = canonicalBrandKey(brand, model);
  if (!brandKey) return null; // e.g. unknown Kenmore prefix: no window read
  const fromDb = await loadDbModelWindow(supabase, brandKey, model);
  // Official Sub-Zero Group timeline (see SUBZERO_WOLF_SOURCES) is the fallback.
  return fromDb ?? staticModelWindow(brand, model);
}

async function loadDbModelWindow(supabase: any, brandKey: string, model: string): Promise<ModelWindow | null> {
  const norm = windowModelKey(model);
  if (!norm) return null;
  try {
    const { data, error } = await supabase
      .from("model_production_windows")
      .select("manufacturer, brand, model_prefix, introduced_year, discontinued_year, replacement_series, source, evidence_count, observed_min_year, observed_max_year")
      .eq("brand_key", brandKey);
    if (error || !data?.length) return null;
    const best = (data as any[])
      .filter((r) => norm.startsWith(String(r.model_prefix).toUpperCase()))
      .sort((a, b) => String(b.model_prefix).length - String(a.model_prefix).length)[0];
    if (!best) return null;
    return {
      manufacturer: best.manufacturer,
      brand: best.brand,
      modelPrefix: best.model_prefix,
      introducedYear: best.introduced_year,
      discontinuedYear: best.discontinued_year,
      replacementSeries: best.replacement_series,
      kind: best.source === "tech_confirmed" ? "tech_confirmed" : "owner",
      evidenceCount: best.evidence_count ?? 0,
      observedMinYear: best.observed_min_year,
      observedMaxYear: best.observed_max_year,
    };
  } catch {
    return null;
  }
}

/**
 * Record a plate-confirmed build year. Service role only (server side).
 * Widens observed min/max and bumps evidence_count. Never throws.
 */
export async function recordWindowConfirmation(opts: { brand: string; model: string | null | undefined; year: number }): Promise<void> {
  const brandKey = canonicalBrandKey(opts.brand, opts.model);
  const prefix = windowModelKey(opts.model);
  if (!brandKey || !prefix) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("model_production_windows")
      .select("id, source, evidence_count, observed_min_year, observed_max_year")
      .eq("brand_key", brandKey)
      .ilike("model_prefix", prefix);
    const row = rows?.[0];
    if (row) {
      await supabaseAdmin.from("model_production_windows").update({
        evidence_count: (row.evidence_count ?? 0) + 1,
        observed_min_year: Math.min(row.observed_min_year ?? opts.year, opts.year),
        observed_max_year: Math.max(row.observed_max_year ?? opts.year, opts.year),
      }).eq("id", row.id);
    } else {
      await supabaseAdmin.from("model_production_windows").insert({
        brand_key: brandKey,
        manufacturer: brandKey,
        model_prefix: prefix,
        source: "tech_confirmed",
        evidence_count: 1,
        observed_min_year: opts.year,
        observed_max_year: opts.year,
      });
    }
  } catch (e) {
    console.warn("[age-decoder] window confirmation failed:", e);
  }
}

/**
 * Earlier data-plate reports for the identical canonical brand + normalized
 * serial. Only source = data_plate counts. Receipts return as an upper bound.
 */
export async function loadPriorReports(opts: { supabase: any; brand: string; model: string; serial: string }): Promise<{ plate: YearMonth[]; receiptBy: YearMonth | null }> {
  const out = { plate: [] as YearMonth[], receiptBy: null as YearMonth | null };
  const key = canonicalBrandKey(opts.brand, opts.model);
  const serial = normalizeSerial(opts.serial);
  if (!key || !serial) return out;
  try {
    const { data } = await opts.supabase
      .from("age_decode_ground_truth")
      .select("manufacturer, model_number, serial_number, known_year, known_month, source")
      .ilike("serial_number", serial)
      .in("source", ["data_plate", "receipt"]);
    for (const r of (data ?? []) as any[]) {
      if (normalizeSerial(r.serial_number) !== serial) continue;
      if (canonicalBrandKey(r.manufacturer, r.model_number ?? opts.model) !== key) continue;
      const ym = { year: r.known_year, month: r.known_month ?? null };
      if (r.source === "data_plate") out.plate.push(ym);
      else if (!out.receiptBy || ym.year < out.receiptBy.year) out.receiptBy = ym;
    }
  } catch {
    /* ignore */
  }
  return out;
}
