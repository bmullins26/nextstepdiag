/**
 * Server-only: corroborate decoded year candidates with web evidence.
 * Uses Firecrawl /search + light excerpt scoring. Cached for 90 days in
 * public.age_decode_corroborations.
 */

import type { Corroboration, SourceHit, SourceTrust } from "./types";
import { classifySourceTrust } from "@/lib/tech-sheets/source-trust";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

type SearchResult = {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
};

async function firecrawlSearch(query: string, limit = 8): Promise<SearchResult[]> {
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

export type CorroborateInput = {
  brandKey: string;
  modelNumber: string;
  candidateYears: number[];
};

/** Pure corroboration call — does NOT touch the cache. The server fn wraps it. */
export async function corroborateAge(input: CorroborateInput): Promise<Corroboration> {
  const { brandKey, modelNumber, candidateYears } = input;
  if (!modelNumber || !candidateYears.length) {
    return { used: false, cached: false, hits: [], yearBoosts: {} };
  }

  const query = `"${modelNumber}" ${brandKey} (manual OR review OR discontinued OR "released" OR "year")`;
  const results = await firecrawlSearch(query, 6);

  const now = new Date().getFullYear();
  const hits: SourceHit[] = [];
  const yearBoosts: Record<number, number> = {};

  for (const r of results.slice(0, 6)) {
    const trust = classifySourceTrust(r.url);
    const text = [r.title, r.description, r.markdown].filter(Boolean).join("\n\n");
    const mentions = extractYearMentions(text, modelNumber, candidateYears, trust, now);
    if (!mentions.length) {
      // Still record the hit so we can show "searched X sources".
      hits.push({ url: r.url, title: r.title, trust });
      continue;
    }
    // Best year mention for this source.
    const best = mentions.sort((a, b) => b.weight - a.weight)[0];
    hits.push({
      url: r.url,
      title: r.title,
      trust,
      year: best.year,
      excerpt: best.excerpt,
    });
    yearBoosts[best.year] = (yearBoosts[best.year] ?? 0) + best.weight * 0.25;
  }

  return {
    used: true,
    cached: false,
    query,
    hits,
    yearBoosts,
  };
}