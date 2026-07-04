import type { EvidenceItem, EvidenceProviderCtx, EvidenceQuery } from "./types";
import { getEvidenceProviders } from "./registry";

export async function gatherEvidence(
  query: EvidenceQuery,
  ctx: EvidenceProviderCtx,
): Promise<EvidenceItem[]> {
  const providers = getEvidenceProviders();
  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        return await p.fetch(query, ctx);
      } catch (err) {
        console.warn(`[evidence] provider ${p.sourceType} failed`, err);
        return [] as EvidenceItem[];
      }
    }),
  );
  const flat = results.flat();
  const tierMap = Object.fromEntries(providers.map((p) => [p.sourceType, p.priority]));
  flat.sort((a, b) => {
    const pa = tierMap[a.sourceType] ?? 99;
    const pb = tierMap[b.sourceType] ?? 99;
    if (pa !== pb) return pa - pb;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return (b.lastUpdated || "").localeCompare(a.lastUpdated || "");
  });
  return flat;
}

export function tieredPromptBlock(items: EvidenceItem[]): string {
  if (!items.length) return "(no evidence gathered for this diagnosis)";
  const bySource = new Map<string, EvidenceItem[]>();
  for (const it of items) {
    const arr = bySource.get(it.sourceType) ?? [];
    arr.push(it);
    bySource.set(it.sourceType, arr);
  }
  const LABELS: Record<string, string> = {
    manufacturer_doc: "MANUFACTURER DOCUMENTATION (highest priority)",
    tech_sheet: "TECH SHEET",
    service_bulletin: "SERVICE BULLETIN",
    verified_repair: "VERIFIED REPAIR OUTCOMES",
    community_verified: "COMMUNITY — VERIFIED REPAIRS",
    community_discussion: "COMMUNITY — DISCUSSIONS (corroborating only)",
    external_repair_guide: "EXTERNAL REPAIR GUIDES",
  };
  const order = [
    "manufacturer_doc",
    "tech_sheet",
    "service_bulletin",
    "verified_repair",
    "community_verified",
    "community_discussion",
    "external_repair_guide",
  ];
  const parts: string[] = [];
  for (const key of order) {
    const arr = bySource.get(key);
    if (!arr || !arr.length) continue;
    parts.push(`### ${LABELS[key]}`);
    for (const it of arr.slice(0, 5)) {
      const conf = Math.round(it.confidence * 100);
      const meta = it.metadata as { matchTier?: string } | undefined;
      const tierNote = meta?.matchTier ? ` (match: ${meta.matchTier})` : "";
      parts.push(`- [conf ${conf}%] ${it.title} — ${it.summary}${tierNote}`);
    }
  }
  return parts.join("\n");
}