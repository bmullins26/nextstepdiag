/**
 * Server-only tech-sheet fetcher. Uses Firecrawl's search + scrape API
 * to find authoritative service literature for a given brand + model.
 * Falls back to platform-family then manufacturer-family static sources.
 */

import type {
  Confidence,
  FaultCode,
  SourceTrust,
  TechSheet,
  TestPoint,
} from "./types";
import { classifySourceTrust, pickBestCandidate } from "./source-trust";
import {
  matchManufacturerFamily,
  matchPlatformFamily,
} from "./platform-families";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

type SearchCandidate = {
  url: string;
  title?: string;
  description?: string;
};

async function firecrawlSearch(query: string, limit = 8): Promise<SearchCandidate[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) {
      console.warn(`[tech-sheets] firecrawl search failed: ${res.status}`);
      return [];
    }
    const json: any = await res.json();
    const results: any[] =
      json?.data?.web ?? json?.data ?? json?.results ?? json?.web ?? [];
    return (Array.isArray(results) ? results : [])
      .map((r: any) => ({ url: r.url, title: r.title, description: r.description }))
      .filter((r) => typeof r.url === "string");
  } catch (err) {
    console.warn(`[tech-sheets] firecrawl search error:`, err);
    return [];
  }
}

type ScrapeResult = {
  markdown: string;
  extracted: { faultCodes: FaultCode[]; testPoints: TestPoint[] } | null;
};

async function firecrawlScrape(url: string): Promise<ScrapeResult | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: [
          "markdown",
          {
            type: "json",
            prompt:
              "Extract appliance service-literature data. Return only what is explicitly stated. faultCodes: array of {code, meaning, test?}. testPoints: array of {label, connector?, pins?, expected?, condition?}. Return empty arrays if none present.",
            schema: {
              type: "object",
              properties: {
                faultCodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      code: { type: "string" },
                      meaning: { type: "string" },
                      test: { type: "string" },
                    },
                    required: ["code", "meaning"],
                  },
                },
                testPoints: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      connector: { type: "string" },
                      pins: { type: "string" },
                      expected: { type: "string" },
                      condition: { type: "string" },
                    },
                    required: ["label"],
                  },
                },
              },
            },
          },
        ],
        onlyMainContent: true,
      }),
    });
    if (!res.ok) {
      console.warn(`[tech-sheets] firecrawl scrape failed: ${res.status} for ${url}`);
      return null;
    }
    const json: any = await res.json();
    const data = json?.data ?? json;
    const markdown: string = data?.markdown ?? "";
    const extracted = data?.json ?? data?.extract ?? null;
    return {
      markdown: markdown.slice(0, 80_000),
      extracted: extracted
        ? {
            faultCodes: Array.isArray(extracted.faultCodes) ? extracted.faultCodes : [],
            testPoints: Array.isArray(extracted.testPoints) ? extracted.testPoints : [],
          }
        : null,
    };
  } catch (err) {
    console.warn(`[tech-sheets] firecrawl scrape error:`, err);
    return null;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function hostnameSourceType(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.endsWith(".pdf") || url.toLowerCase().endsWith(".pdf")) return "manufacturer_pdf";
    if (h.includes("appliantology")) return "appliantology";
    if (h.includes("applianceblog")) return "applianceblog";
    if (h.includes("manualslib")) return "manualslib";
    return h;
  } catch {
    return "other";
  }
}

/**
 * Top-level orchestrator. Returns the best available TechSheet for the
 * brand + model + appliance type, ranked by source trust then confidence.
 */
export async function fetchTechSheet(input: {
  brand: string;
  modelNumber: string;
  applianceType?: string;
}): Promise<TechSheet> {
  const { brand, modelNumber } = input;
  const applianceType = input.applianceType ?? "";
  const trustedDomains =
    "site:appliantology.org OR site:applianceblog.com OR site:manualslib.com";
  const oemHint = `${brand.toLowerCase()} service manual OR tech sheet OR mini manual`;

  // ----- Pass 1: exact model -----
  const exactQueries = [
    `${brand} ${modelNumber} tech sheet`,
    `${brand} ${modelNumber} service manual`,
    `${brand} ${modelNumber} mini manual`,
    `${brand} ${modelNumber} ${trustedDomains}`,
  ];

  let candidates: SearchCandidate[] = [];
  for (const q of exactQueries) {
    const results = await firecrawlSearch(q, 5);
    candidates.push(...results);
    if (candidates.length >= 8) break;
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  candidates = candidates.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  const best = pickBestCandidate(candidates);
  if (best) {
    const scrape = await firecrawlScrape(best.url);
    if (scrape && (scrape.markdown.length > 200 || scrape.extracted)) {
      const trust: SourceTrust = classifySourceTrust(best.url);
      return {
        brand,
        modelNumber,
        platformFamily: matchPlatformFamily(brand, modelNumber)?.family ?? null,
        sourceUrl: best.url,
        sourceType: hostnameSourceType(best.url),
        sourceTrust: trust,
        contentMarkdown: scrape.markdown,
        faultCodes: scrape.extracted?.faultCodes ?? [],
        testPoints: scrape.extracted?.testPoints ?? [],
        confidence: "exact_model",
        fetchedAt: nowIso(),
      };
    }
  }

  // ----- Pass 2: platform family -----
  const platform = matchPlatformFamily(brand, modelNumber);
  if (platform) {
    // Try web search for platform-family docs
    const platformQuery = `${platform.family} service manual ${oemHint}`;
    const platformCandidates = await firecrawlSearch(platformQuery, 5);
    const bestPlatform = pickBestCandidate(platformCandidates);
    if (bestPlatform) {
      const scrape = await firecrawlScrape(bestPlatform.url);
      if (scrape && (scrape.markdown.length > 200 || scrape.extracted)) {
        const trust: SourceTrust = classifySourceTrust(bestPlatform.url);
        return {
          brand,
          modelNumber,
          platformFamily: platform.family,
          sourceUrl: bestPlatform.url,
          sourceType: hostnameSourceType(bestPlatform.url),
          sourceTrust: trust,
          contentMarkdown: scrape.markdown,
          faultCodes: scrape.extracted?.faultCodes ?? [],
          testPoints: scrape.extracted?.testPoints ?? [],
          confidence: "platform_family",
          fetchedAt: nowIso(),
        };
      }
    }
    // Static platform fallback
    return {
      brand,
      modelNumber,
      platformFamily: platform.family,
      sourceUrl: platform.referenceUrl ?? null,
      sourceType: "platform_family",
      sourceTrust: "trusted_reference",
      contentMarkdown: platform.summary,
      faultCodes: [],
      testPoints: [],
      confidence: "platform_family",
      fetchedAt: nowIso(),
    };
  }

  // ----- Pass 3: manufacturer family -----
  const mfgFamily = matchManufacturerFamily(brand, applianceType);
  if (mfgFamily) {
    return {
      brand,
      modelNumber,
      platformFamily: mfgFamily.displayLabel,
      sourceUrl: null,
      sourceType: "manufacturer_family",
      sourceTrust: "trusted_reference",
      contentMarkdown: mfgFamily.summary,
      faultCodes: [],
      testPoints: [],
      confidence: "manufacturer_family",
      fetchedAt: nowIso(),
    };
  }

  // ----- Low confidence -----
  return {
    brand,
    modelNumber,
    platformFamily: null,
    sourceUrl: null,
    sourceType: "none",
    sourceTrust: "community",
    contentMarkdown: "",
    faultCodes: [],
    testPoints: [],
    confidence: "low",
    fetchedAt: nowIso(),
  };
}

export type { TechSheet };

export function freshnessWindowDays(confidence: Confidence): number {
  // Low confidence rows expire faster so we can retry web lookup soon.
  return confidence === "low" ? 7 : 90;
}