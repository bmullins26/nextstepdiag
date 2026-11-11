// Server-only: grounded parts catalog for a model.
// Order: 1) NextStep's own saved catalog (permanent, shared by every tech)
//        2) V&V Appliance Parts  3) PartSelect fallback.
// Whatever an outside site returns is written back once, so the next lookup is internal.
import { getModelParts as getVvParts, scrape } from "./vv/catalog.server";
import { PS_BASE, parseVariantLinks, parsePartSelectParts } from "./partselect/parse";
import { usefulParts, type VvPart } from "./vv/parse";

export type GroundedCatalog = {
  parts: VvPart[];
  modelUrl: string | null;
  provider: string | null; // "V&V Appliance Parts" | "PartSelect"
  internal: boolean;       // served from NextStep's saved catalog
  diagrams: string[];
};

const EMPTY: GroundedCatalog = { parts: [], modelUrl: null, provider: null, internal: false, diagrams: [] };
export const modelKey = (m: string) => m.toUpperCase().replace(/[^A-Z0-9]/g, "");

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Saved catalog only — never touches outside sites. */
export async function readSavedCatalog(model: string): Promise<GroundedCatalog | null> {
  const key = modelKey(model);
  if (key.length < 4) return null;
  const db = await admin();
  const { data } = await db.from("model_parts_catalogs").select("*").eq("model_key", key).maybeSingle();
  if (!data || data.part_count === 0) return null;
  void db.from("model_parts_catalogs").update({ hit_count: data.hit_count + 1, last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return {
    parts: data.parts as unknown as VvPart[],
    modelUrl: data.model_url,
    provider: data.provider,
    internal: true,
    diagrams: (data.diagrams as unknown as string[]) ?? [],
  };
}

async function fetchPartSelect(model: string, capMs = 20000): Promise<{ parts: VvPart[]; modelUrl: string | null }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), capMs);
  try {
    const m = encodeURIComponent(model.toUpperCase());
    const overview = await scrape(`${PS_BASE}/Models/${m}/`, ctl.signal);
    if (!overview) return { parts: [], modelUrl: null };
    const base = parseVariantLinks(overview)[0] ?? `${PS_BASE}/Models/${m}/`;
    const partsUrl = `${base}Parts/`;
    const pages = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      scrape(n === 1 ? partsUrl : `${partsUrl}?start=${n}`, ctl.signal).then((md) => (md ? parsePartSelectParts(md) : []))));
    return { parts: usefulParts(pages.flat()), modelUrl: partsUrl };
  } finally { clearTimeout(t); }
}

export async function getGroundedCatalog(model: string, brand?: string): Promise<GroundedCatalog> {
  try {
    const saved = await readSavedCatalog(model);
    if (saved) return saved;
    const key = modelKey(model);
    if (key.length < 4) return EMPTY;

    let provider = "V&V Appliance Parts";
    let res = await getVvParts(model).catch(() => ({ parts: [] as VvPart[], modelUrl: null }));
    if (!res.parts.length) {
      provider = "PartSelect";
      res = await fetchPartSelect(model).catch(() => ({ parts: [] as VvPart[], modelUrl: null }));
    }
    if (!res.parts.length) return EMPTY;
    const diagrams = [...new Set(res.parts.map((p) => p.diagram))];
    const db = await admin();
    await db.from("model_parts_catalogs").upsert({
      model_key: key, model_display: model.toUpperCase(), brand: brand ?? null, provider,
      model_url: res.modelUrl, diagrams, parts: res.parts as never, part_count: res.parts.length,
      fetched_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "model_key" });
    return { parts: res.parts, modelUrl: res.modelUrl, provider, internal: false, diagrams };
  } catch (e) {
    console.warn("[parts] grounded catalog failed", e);
    return EMPTY;
  }
}

/** Short grounding block for diagnostic prompts. */
export function catalogGroundingBlock(c: GroundedCatalog, max = 120): string {
  if (!c.parts.length) return "";
  return `REAL PARTS ON THIS EXACT MODEL (from its parts diagrams). Use these exact component names in questions, tests and parts; never mention components that are not on this list:\n${c.parts.slice(0, max).map((p) => `- ${p.partNumber} | ${p.description} | ${p.diagram}`).join("\n")}`;
}
