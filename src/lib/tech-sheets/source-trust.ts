import type { SourceTrust } from "./types";
import { TRUST_RANK } from "./types";

/** OEM hostnames (substring match, case-insensitive). */
const OEM_HOSTS = [
  "whirlpool.com",
  "maytag.com",
  "kitchenaid.com",
  "jennair.com",
  "amana.com",
  "ge.com",
  "geappliances.com",
  "samsung.com",
  "lg.com",
  "frigidaire.com",
  "electrolux",
  "bosch-home.com",
  "boschappliances.com",
  "bosch-home.us",
  "fisherpaykel.com",
  "miele.com",
  "haier.com",
  "speedqueen.com",
  "subzero.com",
  "wolfappliance.com",
];

/** Trusted-but-non-OEM technical references. */
const TRUSTED_HOSTS = [
  "appliantology.org",
  "applianceblog.com",
  "manualslib.com",
  "manualowl.com",
  "appliancepartspros.com",
  "repairclinic.com",
  "searspartsdirect.com",
];

export function classifySourceTrust(url: string | null | undefined): SourceTrust {
  if (!url) return "community";
  const u = url.toLowerCase();
  if (OEM_HOSTS.some((h) => u.includes(h))) return "oem";
  if (TRUSTED_HOSTS.some((h) => u.includes(h))) return "trusted_reference";
  return "community";
}

export function trustRank(trust: SourceTrust | string): number {
  return TRUST_RANK[trust] ?? 0;
}

/**
 * Pick the highest-trust candidate. Ties broken by input order
 * (Firecrawl/search ranking).
 */
export function pickBestCandidate<T extends { url: string }>(
  candidates: T[],
): T | null {
  if (!candidates.length) return null;
  let best = candidates[0];
  let bestRank = trustRank(classifySourceTrust(best.url));
  for (let i = 1; i < candidates.length; i++) {
    const r = trustRank(classifySourceTrust(candidates[i].url));
    if (r > bestRank) {
      best = candidates[i];
      bestRank = r;
    }
  }
  return best;
}