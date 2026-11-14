import type { EvidenceItem, EvidenceProviderCtx, EvidenceQuery } from "./types";
import { getEvidenceProviders } from "./registry";
import { confidenceCapFor, internalTierFor } from "./types";

/** Provenance for reasoning providers; internal codes never become UI labels. */
export function provenanceBlock(items: EvidenceItem[], limit = 12): string {
  if (!items.length) return "(no NextStep Knowledge Engine evidence for this session)";
  return items
    .slice(0, limit)
    .map((it) => {
      const meta = it.metadata as { model?: string; sourceUrl?: string; matchTier?: string } | undefined;
      return [
        "SOURCE: NextStep Knowledge Engine",
        `SOURCE TYPE: ${internalTierFor(it)}`,
        meta?.model ? `MODEL: ${meta.model}` : null,
        `TITLE: ${it.title}`,
        `FACT: ${it.summary}`,
        it.detail ? `DETAIL: ${it.detail.slice(0, 600)}` : null,
        `CONFIDENCE: ${Math.min(it.confidence, confidenceCapFor(it)).toFixed(2)}`,
        meta?.matchTier ? `MATCH: ${meta.matchTier}` : null,
        it.link ? `REFERENCE: ${it.link}` : null,
        `LAST UPDATED: ${it.lastUpdated}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n---\n");
}

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
  const flat = results.flat().map((item) => ({
    ...item,
    confidence: Math.min(item.confidence, confidenceCapFor(item)),
  }));
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
  const byTier = new Map<string, EvidenceItem[]>();
  for (const item of items) {
    const tier = internalTierFor(item);
    const arr = byTier.get(tier) ?? [];
    arr.push(item);
    byTier.set(tier, arr);
  }
  const order = [
    "T1_OEM",
    "T2_LIT",
    "T3_REPAIR",
    "T3_PATTERN",
    "T4_COMMUNITY",
    "T4_DISCUSSION",
    "T4_TECHNOTE",
    "T4_EXTERNAL",
    "T5_EXTERNAL",
    "T5_FALLBACK",
  ];
  const parts: string[] = [];
  for (const tier of order) {
    const arr = byTier.get(tier);
    if (!arr?.length) continue;
    parts.push(`### ${tier}`);
    for (const item of arr.slice(0, 5)) {
      const conf = Math.round(Math.min(item.confidence, confidenceCapFor(item)) * 100);
      const meta = item.metadata as { matchTier?: string } | undefined;
      const tierNote = meta?.matchTier ? ` (match: ${meta.matchTier})` : "";
      parts.push(`- [conf ${conf}%] ${item.title} — ${item.summary}${tierNote}`);
    }
  }
  return parts.join("\n");
}
