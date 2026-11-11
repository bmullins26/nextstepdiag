// Pure parsers for V&V Appliance Parts (vvapplianceparts.com) pages rendered as markdown.
// Kept pure so they are unit-testable without network access.
import { aliasWords, ACCESSORY } from "../aliases";

export const VV_BASE = "https://www.vvapplianceparts.com";

export type VvDiagram = { title: string; url: string };
export type VvPart = {
  partNumber: string;
  description: string;
  replaces: string | null;
  price: number | null;
  inStock: boolean;
  diagram: string;
  url: string;
};

/** Diagram links on a model page: /lookup/{modelId}/{diagramId}. */
export function parseDiagramLinks(md: string): VvDiagram[] {
  const out = new Map<string, VvDiagram>();
  const re = /\]\((https:\/\/www\.vvapplianceparts\.com\/lookup\/\d+\/\d+)\s+"([^"]+)"\)/g;
  for (const m of md.matchAll(re)) if (!out.has(m[1])) out.set(m[1], { url: m[1], title: m[2] });
  return [...out.values()];
}

/** When a search hits several models, links look like /lookup/{modelId}. */
export function parseModelLinks(md: string): { url: string; title: string }[] {
  const re = /\]\((https:\/\/www\.vvapplianceparts\.com\/lookup\/\d+)\s+"([^"]+)"\)/g;
  return [...md.matchAll(re)].map((m) => ({ url: m[1], title: m[2] }));
}

/** Parts table rows: | n | [PN](url "Part PN") | | Desc (Replaces: X) | | stock | | $ 1.23 | */
export function parsePartsTable(md: string, diagram: string): VvPart[] {
  const parts: VvPart[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/\[([A-Z0-9-]+)\]\((https:\/\/www\.vvapplianceparts\.com\/parts\/[^\s)]+)/i);
    if (!m) continue;
    const cells = line.split("|").map((c) => c.trim());
    const descCell = cells.find((c, i) => i > cells.findIndex((x) => x.includes(m[0])) && c && !c.startsWith("!")) ?? "";
    const rep = descCell.match(/\(Replaces:\s*([^)]+)\)/i);
    const description = descCell.replace(/\(Replaces:[^)]*\)/i, "").replace(/\s+/g, " ").trim();
    const priceM = line.match(/\$\s*([\d,]+\.\d{2})/);
    parts.push({
      partNumber: m[1].toUpperCase(),
      description,
      replaces: rep ? rep[1].trim() : null,
      price: priceM ? Number(priceM[1].replace(/,/g, "")) : null,
      inStock: /in-stock/i.test(line),
      diagram,
      url: m[2],
    });
  }
  return parts;
}

const HARDWARE = /^(screw|bolt|nut|washer,? (flat|lock)|clip|clamp|rivet|spacer|label|manual|literature|tie|strap)\b/i;

/** Dedupe by part number and drop small hardware the AI should never "recommend". */
export function usefulParts(parts: VvPart[]): VvPart[] {
  const seen = new Map<string, VvPart>();
  for (const p of parts) {
    if (!p.description || HARDWARE.test(p.description)) continue;
    if (!seen.has(p.partNumber)) seen.set(p.partNumber, p);
  }
  return [...seen.values()];
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const GENERIC = new Set(["assembly", "assy", "kit", "drive", "motor", "main", "control", "part", "replacement", "oem", "washer", "dryer", "and", "with"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !GENERIC.has(w));

/**
 * Snap an AI-suggested part onto the real model parts list. Returns the matching
 * catalog part (by number, superseded number, or best name overlap) or null.
 */
export function matchToCatalog(name: string, partNumber: string, catalog: VvPart[]): VvPart | null {
  const pn = norm(partNumber);
  if (pn) {
    const hit = catalog.find((c) => norm(c.partNumber) === pn || norm(c.partNumber) === `WP${pn}` || `WP${norm(c.partNumber)}` === pn
      || (c.replaces ?? "").split(/[,\s]+/).some((r) => r && norm(r) === pn));
    if (hit) return hit;
  }
  // Expand technician vocabulary to OEM diagram wording (e.g. user interface -> fascia/HMI).
  const base = words(name);
  const alias = aliasWords(name);
  if (!base.length && !alias.length) return null;
  const wantsAccessory = ACCESSORY.test(name);
  let best: VvPart | null = null;
  let bestScore = 0;
  for (const c of catalog) {
    const desc = c.description.toLowerCase();
    const have = new Set(words(c.description));
    const direct = base.length ? base.filter((w) => have.has(w) || have.has(w.replace(/s$/, ""))).length / base.length : 0;
    const aliasHit = alias.some((a) => desc.includes(a)) ? 0.6 : 0;
    let score = Math.max(direct, aliasHit) + (direct > 0 && aliasHit > 0 ? 0.2 : 0);
    // A harness/bracket must never outrank the actual component the tech asked for.
    if (!wantsAccessory && ACCESSORY.test(c.description)) score *= 0.4;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 0.5 ? best : null;
}
