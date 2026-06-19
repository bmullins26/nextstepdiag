/**
 * Server-only: corroborate decoded year candidates with web evidence.
 *
 * Homespy-style data point taxonomy: 4 typed Firecrawl searches in parallel,
 * each with its own query template and trust weight. Results aggregated into
 * per-year score boosts plus an optional retailer signal (discontinued / in-stock).
 * Cached 90 days in public.age_decode_corroborations.
 */

import type {
  Corroboration,
  SourceHit,
  SourceTrust,
  SourceType,
} from "./types";
import { classifySourceTrust } from "@/lib/tech-sheets/source-trust";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

type SearchResult = {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
};

async function firecrawlSearch(query: string, limit = 6): Promise<SearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { web?: SearchResult[] } | SearchResult[] };
    const raw = Array.isArray(json.data)
      ? json.data
      : json.data?.web ?? [];
    return raw.filter((r) => r && r.url);
  } catch {
    return [];
  }
}

const TRUST_WEIGHT: Record<SourceTrust, number> = {
  oem: 1.0,
  trusted_reference: 0.6,
  community: 0.3,
};

/**
 * Homespy-style per-source weight. Multiplied with the per-hit trust weight
 * before scoring. Manufacturer is the strongest signal; general web sweep
 * is the weakest.
 */
const SOURCE_WEIGHT: Record<SourceType, number> = {
  manufacturer: 1.0,
  retailer: 0.7,
  review: 0.5,
  general: 0.2,
};

/** Domain hints used to build a `(site:a OR site:b)` Firecrawl query fragment. */
const RETAILER_SITES = [
  "homedepot.com",
  "lowes.com",
  "bestbuy.com",
  "ajmadison.com",
  "appliancesconnection.com",
];

const REVIEW_SITES = [
  "consumerreports.org",
  "amazon.com",
  "reddit.com",
  "applianceblog.com",
];

/** OEM domain hint per canonical brand key. Used in the manufacturer query. */
const OEM_DOMAIN: Record<string, string> = {
  whirlpool: "whirlpool.com",
  ge: "geappliances.com",
  frigidaire: "frigidaire.com",
  lg: "lg.com",
  samsung: "samsung.com",
  bosch: "bosch-home.com",
  fisherpaykel: "fisherpaykel.com",
  miele: "miele.com",
};

function siteOr(sites: string[]): string {
  return `(${sites.map((s) => `site:${s}`).join(" OR ")})`;
}

function buildQuery(
  sourceType: SourceType,
  brandKey: string,
  modelNumber: string,
): string {
  const q = `"${modelNumber}"`;
  switch (sourceType) {
    case "manufacturer": {
      const oem = OEM_DOMAIN[brandKey];
      const scope = oem ? `site:${oem}` : `${brandKey} (official OR manufacturer)`;
      return `${q} ${scope} (manual OR specifications OR "date of manufacture" OR "released")`;
    }
    case "retailer":
      return `${q} ${siteOr(RETAILER_SITES)} (discontinued OR "no longer available" OR "in stock" OR "currently sold")`;
    case "review":
      return `${q} ${siteOr(REVIEW_SITES)} (review OR "bought in" OR "purchased")`;
    case "general":
    default:
      return `${q} ${brandKey} (manual OR review OR discontinued OR "released" OR "year")`;
  }
}

/**
 * Pull years (1990–now+1) mentioned within ~120 chars of the model number
 * in the page markdown. Each mention scored by source trust.
 */
function extractYearMentions(
  markdown: string,
  modelNumber: string,
  candidateYears: number[],
  trust: SourceTrust,
  now: number,
): { year: number; weight: number; excerpt: string }[] {
  if (!markdown) return [];
  const text = markdown.toLowerCase();
  const model = modelNumber.toLowerCase();
  const out: { year: number; weight: number; excerpt: string }[] = [];
  const candidateSet = new Set(candidateYears);
  const yearRe = /\b(19[9]\d|20[0-3]\d)\b/g;

  let modelIdx = text.indexOf(model);
  // If model isn't present, fall back to scanning whole doc with reduced weight.
  const docScale = modelIdx >= 0 ? 1.0 : 0.5;
  while (true) {
    const windowStart = modelIdx >= 0 ? Math.max(0, modelIdx - 200) : 0;
    const windowEnd = modelIdx >= 0 ? Math.min(text.length, modelIdx + 400) : text.length;
    const slice = text.slice(windowStart, windowEnd);
    let m: RegExpExecArray | null;
    yearRe.lastIndex = 0;
    while ((m = yearRe.exec(slice))) {
      const year = parseInt(m[1], 10);
      if (!candidateSet.has(year)) continue;
      if (year > now + 1) continue;
      out.push({
        year,
        weight: TRUST_WEIGHT[trust] * docScale,
        excerpt: slice.slice(Math.max(0, m.index - 40), Math.min(slice.length, m.index + 40)),
      });
    }
    if (modelIdx < 0) break;
    const nextIdx = text.indexOf(model, modelIdx + model.length);
    if (nextIdx < 0) break;
    modelIdx = nextIdx;
  }
  return out;
}

/** Detect retailer-side availability signal from a markdown excerpt. */
function detectRetailerSignal(
  markdown: string,
): "discontinued" | "in_stock" | null {
  if (!markdown) return null;
  const t = markdown.toLowerCase();
  if (/(discontinued|no longer available|out of production)/.test(t)) {
    return "discontinued";
  }
  if (/(in stock|add to cart|currently sold|available now|ships in)/.test(t)) {
    return "in_stock";
  }
  return null;
}

export type CorroborateInput = {
  brandKey: string;
  modelNumber: string;
  candidateYears: number[];
  /** Subset of source types to query. Defaults to all 4. */
  sourceTypes?: SourceType[];
};

/** Run one typed source search and fold results into hits + yearBoosts. */
async function runSource(
  sourceType: SourceType,
  brandKey: string,
  modelNumber: string,
  candidateYears: number[],
  now: number,
): Promise<{
  hits: SourceHit[];
  yearBoosts: Record<number, number>;
  retailerSignal: "discontinued" | "in_stock" | null;
  query: string;
}> {
  const query = buildQuery(sourceType, brandKey, modelNumber);
  const results = await firecrawlSearch(query, 4);
  const sourceWeight = SOURCE_WEIGHT[sourceType];

  const hits: SourceHit[] = [];
  const yearBoosts: Record<number, number> = {};
  let retailerSignal: "discontinued" | "in_stock" | null = null;

  for (const r of results) {
    const trust = classifySourceTrust(r.url);
    const text = [r.title, r.description, r.markdown].filter(Boolean).join("\n\n");
    const mentions = extractYearMentions(text, modelNumber, candidateYears, trust, now);

    // Retailer signal — only meaningful from retailer queries.
    if (sourceType === "retailer" && r.markdown) {
      const sig = detectRetailerSignal(r.markdown);
      // First definitive signal wins.
      if (sig && !retailerSignal) retailerSignal = sig;
    }

    if (!mentions.length) {
      hits.push({ url: r.url, title: r.title, trust, sourceType });
      continue;
    }
    const best = mentions.sort((a, b) => b.weight - a.weight)[0];
    hits.push({
      url: r.url,
      title: r.title,
      trust,
      sourceType,
      year: best.year,
      excerpt: best.excerpt,
    });
    yearBoosts[best.year] =
      (yearBoosts[best.year] ?? 0) + best.weight * sourceWeight * 0.25;
  }

  return { hits, yearBoosts, retailerSignal, query };
}

/** Pure corroboration call — does NOT touch the cache. The server fn wraps it. */
export async function corroborateAge(
  input: CorroborateInput,
): Promise<Corroboration> {
  const { brandKey, modelNumber, candidateYears } = input;
  if (!modelNumber || !candidateYears.length) {
    return { used: false, cached: false, hits: [], yearBoosts: {} };
  }

  const sourceTypes: SourceType[] =
    input.sourceTypes ?? ["manufacturer", "retailer", "review", "general"];
  const now = new Date().getFullYear();

  // Run all source queries in parallel.
  const results = await Promise.all(
    sourceTypes.map((st) => runSource(st, brandKey, modelNumber, candidateYears, now)),
  );

  const hits: SourceHit[] = [];
  const yearBoosts: Record<number, number> = {};
  let retailerSignal: "discontinued" | "in_stock" | null = null;

  for (const r of results) {
    hits.push(...r.hits);
    for (const [yearStr, boost] of Object.entries(r.yearBoosts)) {
      const y = Number(yearStr);
      yearBoosts[y] = (yearBoosts[y] ?? 0) + boost;
    }
    if (r.retailerSignal && !retailerSignal) retailerSignal = r.retailerSignal;
  }

  // Retailer-signal narrowing: nudge year ranges based on availability.
  if (retailerSignal === "discontinued") {
    // Discontinued ≥ 2 yrs ago — penalize candidate years too recent.
    for (const y of candidateYears) {
      if (y > now - 2) {
        yearBoosts[y] = (yearBoosts[y] ?? 0) - 0.15;
      }
    }
  } else if (retailerSignal === "in_stock") {
    // Still sold — penalize candidate years too old.
    for (const y of candidateYears) {
      if (y < now - 5) {
        yearBoosts[y] = (yearBoosts[y] ?? 0) - 0.10;
      }
    }
  }

  // Cross-source agreement bonus: if 2+ source types cite the same year, boost it.
  const yearSourceTypes: Record<number, Set<SourceType>> = {};
  for (const h of hits) {
    if (h.year == null || !h.sourceType) continue;
    (yearSourceTypes[h.year] ??= new Set()).add(h.sourceType);
  }
  for (const [yearStr, types] of Object.entries(yearSourceTypes)) {
    if (types.size >= 2) {
      const y = Number(yearStr);
      yearBoosts[y] = (yearBoosts[y] ?? 0) + 0.15 * (types.size - 1);
    }
  }

  return {
    used: true,
    cached: false,
    query: results.map((r) => r.query).join(" | "),
    hits,
    yearBoosts,
    sourceTypes,
    retailerSignal,
  };
}