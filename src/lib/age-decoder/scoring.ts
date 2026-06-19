import type { DateCandidate } from "./types";

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