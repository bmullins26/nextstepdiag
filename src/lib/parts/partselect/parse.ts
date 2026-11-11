// Pure parsers for PartSelect model pages rendered as markdown (fallback parts source).
import type { VvPart } from "../vv/parse";

export const PS_BASE = "https://www.partselect.com";

/** Variant links on a model overview page: /Models/{M}/MFGModelNumber/{v}/ */
export function parseVariantLinks(md: string): string[] {
  const re = /\((https:\/\/www\.partselect\.com\/Models\/[^/\s)]+\/MFGModelNumber\/[^/\s)]+\/)\)/g;
  return [...new Set([...md.matchAll(re)].map((m) => m[1]))];
}

/** Part tiles: [![Name – Part Number: PN](img)](url "...") then "$12.34". */
export function parsePartSelectParts(md: string, diagram = "Parts"): VvPart[] {
  const out: VvPart[] = [];
  const re = /\[!\[([^\]]+?)\s+[–-]\s+Part Number:\s*([A-Z0-9-]+)\]\([^)]*\)\]\((https:\/\/www\.partselect\.com\/PS[^\s)]+)/gi;
  const hits = [...md.matchAll(re)];
  hits.forEach((m, i) => {
    const end = hits[i + 1]?.index ?? md.length;
    const tail = md.slice((m.index ?? 0) + m[0].length, end);
    const price = tail.match(/\$\s*([\d,]+\.\d{2})/);
    out.push({
      partNumber: m[2].toUpperCase(),
      description: m[1].trim(),
      replaces: null,
      price: price ? Number(price[1].replace(/,/g, "")) : null,
      inStock: /In Stock/i.test(tail.slice(0, 200)),
      diagram,
      url: m[3].split("?")[0],
    });
  });
  return out;
}
