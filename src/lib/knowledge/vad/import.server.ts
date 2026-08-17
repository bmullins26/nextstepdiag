import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestSource, type IngestResult } from "../pipeline.server";
import {
  VAD_BASE_URL,
  VAD_LICENSE,
  VAD_SOURCE_NAME,
  buildCategoryDocument,
  buildModelDocument,
  parseVadFixPage,
  parseVadModelPage,
  sanitizeCatalogProduct,
  type VadCatalogIdentity,
} from "./parse";

/**
 * Verified Appliance Data → Knowledge Intelligence Engine.
 *
 * This importer only prepares a sanitized, scope-tagged document and hands it
 * to the EXISTING pipeline (extraction → normalization → facts → chunks →
 * embeddings). No separate embedding or retrieval architecture is created.
 *
 * Authority: `external_verified_source`. Deliberately NOT
 * `manufacturer_verified` and NOT `technician_verified_repair` — publishing a
 * repair page does not make a publisher an OEM or a technician.
 *
 * Idempotency / refresh: a source row is keyed by its URL plus the content
 * hash of the sanitized document. Re-running with unchanged content is a
 * no-op; changed content creates a new source version and supersedes the old
 * one (old facts and extractions are preserved for provenance, only their
 * retrieval chunks are retired).
 */

export const VAD_REF_TABLE = "verified_appliance_data";
const UA = "NextStepDiagKnowledgeBot/1.0 (+https://nextstepdiag.com)";

export type VadTargetKind = "model" | "category";
export type VadTarget = { url: string; kind: VadTargetKind };

async function fetchText(url: string, accept = "text/html"): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

function sitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
}

/** Every repair-relevant page the source publishes, model pages first. */
export async function listVadTargets(): Promise<VadTarget[]> {
  const [repairXml, fixXml] = await Promise.all([
    fetchText(`${VAD_BASE_URL}/fix/repair/sitemap.xml`, "application/xml").catch(() => ""),
    fetchText(`${VAD_BASE_URL}/fix/sitemap.xml`, "application/xml").catch(() => ""),
  ]);

  const models = sitemapUrls(repairXml).filter((u) => {
    const p = u.replace(VAD_BASE_URL, "").split("/").filter(Boolean);
    return p[0] === "fix" && p[1] === "repair" && p.length === 4; // fix/repair/brand/model
  });
  const categories = sitemapUrls(fixXml).filter((u) => {
    const p = u.replace(VAD_BASE_URL, "").split("/").filter(Boolean);
    return p[0] === "fix" && p[1] !== "repair" && p.length === 4; // fix/brand/type/symptom
  });

  return [
    ...models.map((url) => ({ url, kind: "model" as const })),
    ...categories.map((url) => ({ url, kind: "category" as const })),
  ];
}

// ------------------------------------------------------- catalogue identity

let catalogCache: { at: number; byModel: Map<string, VadCatalogIdentity>; excluded: number } | null = null;
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

function modelKey(brand: string, model: string): string {
  const n = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `${n(brand)}:${n(model)}`;
}

/**
 * Loads the source's CC-BY catalogue and keeps ONLY identification, physical
 * and electrical fields. Energy/efficiency and computed running-cost fields
 * are dropped here and counted for the import report.
 */
export async function loadVadCatalog(): Promise<{ byModel: Map<string, VadCatalogIdentity>; excluded: number }> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache;
  const byModel = new Map<string, VadCatalogIdentity>();
  let excluded = 0;
  try {
    const raw = await fetchText(`${VAD_BASE_URL}/dataset.json`, "application/json");
    const parsed = JSON.parse(raw) as { products?: Record<string, any>[] };
    for (const row of parsed.products ?? []) {
      const id = sanitizeCatalogProduct(row);
      excluded += id.excludedEnergyFields;
      if (!id.modelNumber) continue;
      byModel.set(modelKey(id.brand, id.modelNumberNorm || id.modelNumber), id);
    }
  } catch (e) {
    console.warn("[vad] catalogue load failed — importing without identity enrichment", e);
  }
  catalogCache = { at: Date.now(), byModel, excluded };
  return catalogCache;
}

/** Longest-prefix identity match: service model numbers carry trailing suffixes. */
export function matchIdentity(
  byModel: Map<string, VadCatalogIdentity>,
  brand: string,
  model: string,
): VadCatalogIdentity | null {
  const key = modelKey(brand, model);
  const exact = byModel.get(key);
  if (exact) return exact;
  const [b, m] = key.split(":") as [string, string];
  let best: VadCatalogIdentity | null = null;
  let bestLen = 0;
  for (const [k, v] of byModel) {
    if (!k.startsWith(`${b}:`)) continue;
    const cand = k.slice(b.length + 1);
    if (cand.length < 5 || !m.startsWith(cand)) continue;
    if (cand.length > bestLen) {
      best = v;
      bestLen = cand.length;
    }
  }
  return best;
}

// ------------------------------------------------------------- ingestion

export type VadPageResult = {
  url: string;
  kind: VadTargetKind;
  state: "imported" | "refreshed" | "duplicate" | "skipped" | "failed";
  reason?: string;
  brand?: string;
  modelNumber?: string | null;
  applianceType?: string | null;
  scope?: "model" | "category";
  facts?: number;
  chunks?: number;
  needsReview?: number;
  excludedEnergy?: number;
  excludedShopping?: number;
};

async function priorSources(admin: SupabaseClient, url: string) {
  const { data } = await admin
    .from("knowledge_sources")
    .select("id,content_hash,created_at")
    .eq("source_url", url)
    .eq("ref_table", VAD_REF_TABLE)
    .order("created_at", { ascending: false });
  return (data ?? []) as { id: string; content_hash: string | null; created_at: string }[];
}

/**
 * Retire an older version of the same URL: its facts and extractions stay for
 * provenance, but its chunks leave the retrieval index so the diagnostic
 * engine never sees two versions of the same external page.
 */
async function supersede(admin: SupabaseClient, oldIds: string[], newSourceId: string) {
  if (oldIds.length === 0) return;
  await admin.from("knowledge_chunks").delete().in("source_id", oldIds);
  for (const id of oldIds) {
    const { data } = await admin.from("knowledge_sources").select("metadata").eq("id", id).maybeSingle();
    const meta = ((data as any)?.metadata ?? {}) as Record<string, unknown>;
    await admin
      .from("knowledge_sources")
      .update({
        metadata: {
          ...meta,
          superseded_by_source_id: newSourceId,
          superseded_at: new Date().toISOString(),
        },
      })
      .eq("id", id);
  }
}

export async function importVadPage(
  admin: SupabaseClient,
  target: VadTarget,
  opts: { uploadedBy: string; refresh: boolean; dryRun: boolean; identityIndex?: Map<string, VadCatalogIdentity> },
): Promise<VadPageResult> {
  const retrievedAt = new Date().toISOString().slice(0, 10);
  let html: string;
  try {
    html = await fetchText(target.url);
  } catch (e) {
    return { url: target.url, kind: target.kind, state: "failed", reason: e instanceof Error ? e.message : String(e) };
  }

  let content: string;
  let meta: Record<string, unknown>;
  let brand: string;
  let modelNumber: string | null = null;
  let applianceType: string | null = null;
  let scope: "model" | "category";
  let excludedEnergy = 0;
  let excludedShopping = 0;

  if (target.kind === "model") {
    const rec = parseVadModelPage(html, target.url);
    if (!rec) return { url: target.url, kind: target.kind, state: "skipped", reason: "Page did not parse as a model repair page" };
    if (rec.failures.length === 0 && rec.symptoms.length === 0)
      return { url: target.url, kind: target.kind, state: "skipped", reason: "No repair-relevant content on page" };

    const identity = opts.identityIndex ? matchIdentity(opts.identityIndex, rec.brand, rec.modelNumber) : null;
    content = buildModelDocument(rec, identity, retrievedAt);
    brand = rec.brand;
    modelNumber = rec.modelNumber;
    applianceType = rec.applianceType;
    scope = "model";
    excludedEnergy = rec.excluded.energy + (identity?.excludedEnergyFields ?? 0);
    excludedShopping = rec.excluded.shopping;
    meta = {
      source_name: VAD_SOURCE_NAME,
      source_url: rec.url,
      retrieval_date: retrievedAt,
      license: VAD_LICENSE,
      scope: "model",
      slug: rec.slug,
      failure_points: rec.failures.length,
      symptoms: rec.symptoms.length,
      manual_references: rec.manuals.map((m) => ({ title: m.title, url: m.url })),
      part_numbers: rec.failures.flatMap((f) => f.partNumbers.map((p) => p.part_number)).slice(0, 100),
      catalogue_identity: identity
        ? { slug: identity.slug, upc: identity.upc, category: identity.category, specs: identity.specs }
        : null,
      excluded_energy_fields: excludedEnergy,
      excluded_shopping_fields: excludedShopping,
      publisher_source_note: rec.sourceNote,
    };
  } else {
    const rec = parseVadFixPage(html, target.url);
    if (!rec) return { url: target.url, kind: target.kind, state: "skipped", reason: "Page did not parse as a repair guide" };
    if (rec.causes.length === 0)
      return { url: target.url, kind: target.kind, state: "skipped", reason: "No repair-relevant content on page" };

    content = buildCategoryDocument(rec, retrievedAt);
    brand = rec.brand;
    applianceType = rec.applianceType;
    scope = "category";
    excludedEnergy = rec.excluded.energy;
    excludedShopping = rec.excluded.shopping;
    meta = {
      source_name: VAD_SOURCE_NAME,
      source_url: rec.url,
      retrieval_date: retrievedAt,
      license: VAD_LICENSE,
      // Category-level knowledge must never be attached to a single model.
      scope: "category",
      symptom: rec.symptom,
      causes: rec.causes.length,
      excluded_energy_fields: excludedEnergy,
      excluded_shopping_fields: excludedShopping,
    };
  }

  const prior = await priorSources(admin, target.url);

  if (opts.dryRun) {
    return {
      url: target.url,
      kind: target.kind,
      state: prior.length ? (opts.refresh ? "refreshed" : "duplicate") : "imported",
      brand,
      modelNumber,
      applianceType,
      scope,
      excludedEnergy,
      excludedShopping,
      reason: "dry run",
    };
  }

  if (prior.length && !opts.refresh) {
    return { url: target.url, kind: target.kind, state: "duplicate", reason: "Already imported", brand, modelNumber, scope };
  }

  let res: IngestResult;
  try {
    res = await ingestSource(admin, {
      source_type: "external_repair_data",
      source_authority: "external_verified_source",
      title:
        target.kind === "model"
          ? `${VAD_SOURCE_NAME} — ${brand} ${modelNumber}`
          : `${VAD_SOURCE_NAME} — ${brand} ${applianceType} (category guide)`,
      brand,
      manufacturer: brand,
      appliance_type: applianceType,
      model_number: modelNumber,
      source_url: target.url,
      ref_table: VAD_REF_TABLE,
      metadata: meta,
      uploaded_by: opts.uploadedBy,
      content,
    });
  } catch (e) {
    return { url: target.url, kind: target.kind, state: "failed", reason: e instanceof Error ? e.message : String(e) };
  }

  if (res.status === "failed")
    return { url: target.url, kind: target.kind, state: "failed", reason: res.error ?? "Pipeline failed", brand, modelNumber };

  if (res.reused)
    return { url: target.url, kind: target.kind, state: "duplicate", reason: "Content unchanged", brand, modelNumber, scope };

  await supersede(
    admin,
    prior.map((p) => p.id).filter((id) => id !== res.source_id),
    res.source_id,
  );

  return {
    url: target.url,
    kind: target.kind,
    state: prior.length ? "refreshed" : "imported",
    brand,
    modelNumber,
    applianceType,
    scope,
    facts: res.facts,
    chunks: res.chunks,
    needsReview: res.needs_review,
    excludedEnergy,
    excludedShopping,
  };
}

export type VadImportReport = {
  dryRun: boolean;
  sourceRecordsFound: number;
  attempted: number;
  imported: number;
  refreshed: number;
  duplicatesSkipped: number;
  skipped: number;
  failed: number;
  modelsIdentified: number;
  modelsImported: number;
  facts: number;
  chunks: number;
  embeddings: number;
  needsReview: number;
  excludedEnergyFields: number;
  excludedShoppingFields: number;
  byApplianceType: Record<string, number>;
  results: VadPageResult[];
  remaining: number;
};

/** Batched import/refresh. Never processes an unbounded set in one call. */
export async function importVerifiedApplianceData(
  admin: SupabaseClient,
  opts: {
    uploadedBy: string;
    limit: number;
    dryRun: boolean;
    refresh: boolean;
    kind?: VadTargetKind | "all";
    withIdentity?: boolean;
  },
): Promise<VadImportReport> {
  const all = await listVadTargets();
  const targets = all.filter((t) => !opts.kind || opts.kind === "all" || t.kind === opts.kind);

  const { data: existing } = await admin
    .from("knowledge_sources")
    .select("source_url")
    .eq("ref_table", VAD_REF_TABLE);
  const done = new Set((existing ?? []).map((r: any) => r.source_url as string));

  const queue = opts.refresh ? targets : targets.filter((t) => !done.has(t.url));
  const batch = queue.slice(0, opts.limit);

  let identityIndex: Map<string, VadCatalogIdentity> | undefined;
  let catalogueExcluded = 0;
  if (opts.withIdentity !== false && batch.some((t) => t.kind === "model")) {
    const cat = await loadVadCatalog();
    identityIndex = cat.byModel;
  }

  const results: VadPageResult[] = [];
  for (const t of batch) {
    results.push(
      await importVadPage(admin, t, {
        uploadedBy: opts.uploadedBy,
        refresh: opts.refresh,
        dryRun: opts.dryRun,
        identityIndex,
      }),
    );
  }

  const byApplianceType: Record<string, number> = {};
  for (const r of results) {
    if (r.state !== "imported" && r.state !== "refreshed") continue;
    const key = (r.applianceType ?? "unknown").toLowerCase();
    byApplianceType[key] = (byApplianceType[key] ?? 0) + 1;
  }

  const sum = (f: (r: VadPageResult) => number) => results.reduce((a, r) => a + f(r), 0);

  return {
    dryRun: opts.dryRun,
    sourceRecordsFound: targets.length,
    attempted: batch.length,
    imported: results.filter((r) => r.state === "imported").length,
    refreshed: results.filter((r) => r.state === "refreshed").length,
    duplicatesSkipped: results.filter((r) => r.state === "duplicate").length,
    skipped: results.filter((r) => r.state === "skipped").length,
    failed: results.filter((r) => r.state === "failed").length,
    modelsIdentified: new Set(results.filter((r) => r.modelNumber).map((r) => `${r.brand}:${r.modelNumber}`)).size,
    modelsImported: new Set(
      results.filter((r) => r.modelNumber && (r.state === "imported" || r.state === "refreshed")).map((r) => `${r.brand}:${r.modelNumber}`),
    ).size,
    facts: sum((r) => r.facts ?? 0),
    chunks: sum((r) => r.chunks ?? 0),
    // Every chunk carries exactly one embedding from the shared pipeline.
    embeddings: sum((r) => r.chunks ?? 0),
    needsReview: sum((r) => r.needsReview ?? 0),
    excludedEnergyFields: sum((r) => r.excludedEnergy ?? 0) + catalogueExcluded,
    excludedShoppingFields: sum((r) => r.excludedShopping ?? 0),
    byApplianceType,
    results,
    remaining: Math.max(0, queue.length - batch.length),
  };
}

/** Owner-console rollup for the Verified Appliance Data source. */
export async function vadKnowledgeStats(admin: SupabaseClient) {
  const { data: sources } = await admin
    .from("knowledge_sources")
    .select("id,model_number,appliance_type,metadata,created_at,updated_at")
    .eq("ref_table", VAD_REF_TABLE)
    .order("created_at", { ascending: false });

  const rows = (sources ?? []) as any[];
  const active = rows.filter((r) => !(r.metadata ?? {})["superseded_by_source_id"]);
  const ids = rows.map((r) => r.id);

  const [{ data: jobs }, { data: facts }, { data: chunks }] = ids.length
    ? await Promise.all([
        admin.from("knowledge_processing_jobs").select("source_id,status,created_at").in("source_id", ids),
        admin.from("knowledge_facts").select("source_id,needs_review").in("source_id", ids),
        admin.from("knowledge_chunks").select("id").in("source_id", ids),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }];

  const jobStatus = new Map<string, string>();
  for (const j of (jobs ?? []) as any[]) {
    const prev = jobStatus.get(j.source_id);
    if (!prev || prev === "failed") jobStatus.set(j.source_id, j.status);
  }

  const byApplianceType: Record<string, number> = {};
  for (const r of active) {
    const key = (r.appliance_type ?? "unknown").toLowerCase();
    byApplianceType[key] = (byApplianceType[key] ?? 0) + 1;
  }

  const dates = rows.map((r) => r.created_at as string).sort();
  const activeSourceIds = new Set(active.map((r) => r.id));

  return {
    sourceName: VAD_SOURCE_NAME,
    license: VAD_LICENSE,
    records: active.length,
    supersededRecords: rows.length - active.length,
    models: new Set(active.filter((r) => r.model_number).map((r) => r.model_number)).size,
    categoryGuides: active.filter((r) => (r.metadata ?? {})["scope"] === "category").length,
    facts: (facts ?? []).filter((f: any) => activeSourceIds.has(f.source_id)).length,
    pending: (facts ?? []).filter((f: any) => activeSourceIds.has(f.source_id) && f.needs_review).length,
    chunks: (chunks ?? []).length,
    failed: [...jobStatus.values()].filter((s) => s === "failed").length,
    excludedEnergyFields: active.reduce((a, r) => a + Number((r.metadata ?? {})["excluded_energy_fields"] ?? 0), 0),
    excludedShoppingFields: active.reduce((a, r) => a + Number((r.metadata ?? {})["excluded_shopping_fields"] ?? 0), 0),
    firstImport: dates[0] ?? null,
    lastImport: dates[dates.length - 1] ?? null,
    byApplianceType,
  };
}
