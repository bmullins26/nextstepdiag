import type {
  DateCandidate,
  Rule,
  Confidence,
  Corroboration,
  SourceTrust,
} from "./types";

export type ScoreOptions = {
  now?: Date;
  modelHints?: { earliestYear?: number; latestYear?: number };
};

/**
 * Pick the best candidate deterministically.
 *
 * Heuristics (all deterministic, no AI):
 *  - Discard candidates strictly in the future (> now + 1 year).
 *  - If modelHints constrain a year range, keep only matches in range.
 *  - Prefer the most recent candidate not in the future (typical service-call appliance).
 *  - Tie-breaker: higher candidate.score wins; then later year; then earlier month.
 */
export function pickBestCandidate(
  candidates: DateCandidate[],
  opts: ScoreOptions = {},
): DateCandidate | null {
  if (!candidates.length) return null;
  const now = opts.now ?? new Date();
  const cutoff = now.getFullYear() + 1;

  let pool = candidates.filter((c) => c.year <= cutoff);
  if (!pool.length) pool = candidates.slice();

  if (opts.modelHints?.earliestYear != null) {
    const e = opts.modelHints.earliestYear;
    const filtered = pool.filter((c) => c.year >= e);
    if (filtered.length) pool = filtered;
  }
  if (opts.modelHints?.latestYear != null) {
    const l = opts.modelHints.latestYear;
    const filtered = pool.filter((c) => c.year <= l);
    if (filtered.length) pool = filtered;
  }

  pool = pool.slice().sort((a, b) => {
    const sa = a.score ?? 0;
    const sb = b.score ?? 0;
    if (sb !== sa) return sb - sa;
    if (b.year !== a.year) return b.year - a.year;
    return (a.month ?? 12) - (b.month ?? 12);
  });

  return pool[0] ?? null;
}

export function computeAgeYears(
  year: number,
  month: number | null | undefined,
  now: Date = new Date(),
): number {
  const refMonth = month && month >= 1 && month <= 12 ? month : 6;
  const date = new Date(year, refMonth - 1, 1);
  const ms = now.getTime() - date.getTime();
  return Math.max(0, ms / (365.25 * 24 * 3600 * 1000));
}

/** Homespy methodology: confidence is capped at 80% by design. */
export const MAX_CONFIDENCE_PERCENT = 80;

const TRUST_BOOST: Record<SourceTrust, number> = {
  oem: 0.30,
  trusted_reference: 0.20,
  community: 0.10,
};

/** Mutate-free: add corroboration evidence into each candidate's score + sources. */
export function applyCorroboration(
  candidates: DateCandidate[],
  corroboration: Corroboration,
): DateCandidate[] {
  if (!corroboration?.used || !candidates.length) return candidates;
  const hitsByYear = new Map<number, typeof corroboration.hits>();
  for (const h of corroboration.hits) {
    if (h.year == null) continue;
    const arr = hitsByYear.get(h.year) ?? [];
    arr.push(h);
    hitsByYear.set(h.year, arr);
  }
  return candidates.map((c) => {
    const boost = corroboration.yearBoosts[c.year] ?? 0;
    const sources = hitsByYear.get(c.year) ?? [];
    return {
      ...c,
      score: (c.score ?? 0) + boost,
      sources,
    };
  });
}

/** Convert raw score to confidence label + percent, capped at 80%. */
export function scoreConfidence(opts: {
  rule: Rule;
  candidates: DateCandidate[];
  chosen: DateCandidate;
  corroboration: Corroboration;
}): { confidence: Confidence; percent: number } {
  const { rule, candidates, chosen, corroboration } = opts;

  let raw = (chosen.score ?? 0.3) * rule.weight;

  // Single-candidate serials are highly disambiguated.
  if (candidates.length === 1) raw += 0.20;

  // Add the strongest trust tier bonus that actually corroborated the chosen year.
  if (corroboration.used) {
    const hitsForYear = corroboration.hits.filter((h) => h.year === chosen.year);
    if (hitsForYear.length) {
      const bestTrust = hitsForYear.reduce<SourceTrust>(
        (best, h) => (TRUST_BOOST[h.trust] > TRUST_BOOST[best] ? h.trust : best),
        "community",
      );
      raw += TRUST_BOOST[bestTrust];
    } else {
      // Searched but no evidence for chosen year → penalty.
      raw -= 0.15;
    }
  }

  // Spread bonus: clear winner among candidates.
  if (candidates.length > 1) {
    const sorted = candidates.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = sorted[0]?.score ?? 0;
    const next = sorted[1]?.score ?? 0;
    if (sorted[0] === chosen && top - next >= 0.3) raw += 0.10;
  }

  const clamped = Math.max(0, Math.min(1, raw));
  const percent = Math.min(MAX_CONFIDENCE_PERCENT, Math.round(clamped * 100));

  let confidence: Confidence;
  if (percent >= 65) confidence = "High";
  else if (percent >= 40) confidence = "Medium";
  else confidence = "Low";

  return { confidence, percent };
}