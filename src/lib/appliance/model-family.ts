import { matchPlatformFamily } from "@/lib/tech-sheets/platform-families";

export function normalizeModel(m: string): string {
  return (m || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function normalizeBrand(b: string): string {
  return (b || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Mirror of public.community_family_key() in the community migration. */
export function modelFamilyKey(brand: string, model: string): string {
  const b = normalizeBrand(brand);
  const m = normalizeModel(model);
  const stem = m.length > 4 ? m.slice(0, Math.max(4, m.length - 2)) : m;
  return `${b}:${stem}`;
}

export type MatchTier = "exact" | "family" | "brand_type" | "brand";

export const MATCH_TIER_WEIGHT: Record<MatchTier, number> = {
  exact: 1.0,
  family: 0.75,
  brand_type: 0.5,
  brand: 0.3,
};

export interface ModelCandidates {
  exact: string;
  familyStem: string;
  familyKey: string;
  platformName: string | null;
}

export function candidateModels(brand: string, model: string): ModelCandidates {
  const exact = normalizeModel(model);
  const platform = matchPlatformFamily(brand, model);
  let familyStem: string;
  if (platform) {
    const matched = platform.prefixes
      .map((p) => normalizeModel(p))
      .filter((p) => exact.startsWith(p))
      .sort((a, b) => b.length - a.length)[0];
    familyStem = matched ?? (exact.length > 4 ? exact.slice(0, Math.max(4, exact.length - 2)) : exact);
  } else {
    familyStem = exact.length > 4 ? exact.slice(0, Math.max(4, exact.length - 2)) : exact;
  }
  return {
    exact,
    familyStem,
    familyKey: `${normalizeBrand(brand)}:${familyStem}`,
    platformName: platform?.family ?? null,
  };
}