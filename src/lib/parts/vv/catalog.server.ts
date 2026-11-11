// Server-only: fetches the real parts list for a model from V&V Appliance Parts
// (free public lookup). The site sits behind a bot wall, so pages are read through
// Firecrawl. Best-effort with a hard time cap — never blocks the service call.
import { VV_BASE, parseDiagramLinks, parseModelLinks, parsePartsTable, usefulParts, type VvPart } from "./parse";

const FIRECRAWL = "https://api.firecrawl.dev/v2/scrape";
const cache = new Map<string, { at: number; parts: VvPart[]; modelUrl: string | null }>();
const TTL = 1000 * 60 * 60 * 12;

export async function scrape(url: string, signal: AbortSignal): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(FIRECRAWL, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: false, maxAge: 1000 * 60 * 60 * 24 * 7 }),
    });
    if (!res.ok) { console.warn("[vv] scrape", res.status, url); return null; }
    const j = (await res.json()) as { data?: { markdown?: string } };
    return j.data?.markdown ?? null;
  } catch { return null; }
}

export async function getModelParts(model: string, capMs = 20000): Promise<{ parts: VvPart[]; modelUrl: string | null }> {
  const m = model.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (m.length < 4) return { parts: [], modelUrl: null };
  const c = cache.get(m);
  if (c && Date.now() - c.at < TTL) return c;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), capMs);
  try {
    let modelUrl = `${VV_BASE}/lookup?search=${encodeURIComponent(m)}`;
    let md = await scrape(modelUrl, ctl.signal);
    if (!md) return { parts: [], modelUrl: null };
    let diagrams = parseDiagramLinks(md);
    if (!diagrams.length) {
      // Several models matched — pick the exact one.
      const pick = parseModelLinks(md).find((l) => l.title.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(m.replace(/-/g, "")));
      if (pick) { modelUrl = pick.url; md = await scrape(pick.url, ctl.signal); diagrams = md ? parseDiagramLinks(md) : []; }
    }
    const pages = await Promise.all(diagrams.slice(0, 14).map(async (d) => {
      const dm = await scrape(d.url, ctl.signal);
      return dm ? parsePartsTable(dm, d.title) : [];
    }));
    const parts = usefulParts(pages.flat());
    const out = { parts, modelUrl: diagrams.length ? modelUrl : null };
    if (parts.length) cache.set(m, { at: Date.now(), ...out });
    return out;
  } finally { clearTimeout(t); }
}
