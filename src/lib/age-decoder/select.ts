/**
 * Strict date-selection order. Never presents a guess as the answer.
 *   a. plate-printed date confirmed by the tech (now, or an earlier data-plate report)
 *   b. manufacturer build date (factory record)
 *   c. upper bounds: shipped date, receipt/invoice date (remove later candidates)
 *   d. production window — only when every candidate pair is ≥ 5 years apart
 *   e. one candidate left → ok; more → ambiguous (all candidates, no pick)
 * No recency preference, no score summing, no community/history bonuses.
 */
import type { DateCandidate, DateSource, DecodeEvidence, ModelWindow, YearMonth } from "./types";

export const WINDOW_MIN_GAP_YEARS = 5;

export type Selection =
  | { kind: "ok"; chosen: DateCandidate; source: DateSource }
  | { kind: "ambiguous"; candidates: DateCandidate[]; source: "serial" | "plate_printed_prior" }
  | { kind: "none"; reason: "no_candidate_fits" };

const key = (c: DateCandidate) => `${c.year}-${c.month ?? ""}-${c.week ?? ""}`;
const afterBound = (c: DateCandidate, b: YearMonth) =>
  c.year > b.year || (c.year === b.year && b.month != null && c.month != null && c.month > b.month);

export function dedupe(cands: DateCandidate[]): DateCandidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => (seen.has(key(c)) ? false : (seen.add(key(c)), true)));
}

/** Bounds a window may narrow to, or null when the window may not be used. */
export function windowBounds(w: ModelWindow | null | undefined, now: Date): [number, number] | null {
  if (!w) return null;
  if (w.kind === "tech_confirmed") {
    if ((w.evidenceCount ?? 0) < 1 || w.observedMinYear == null || w.observedMaxYear == null) return null;
    return [w.observedMinYear, w.observedMaxYear];
  }
  // Owner-curated or official OEM timeline (e.g. Sub-Zero/Wolf, see
  // data/subzero-wolf-timeline.ts SUBZERO_WOLF_SOURCES). last = null → current.
  const lo = w.introducedYear ?? w.observedMinYear ?? null;
  if (lo == null) return null;
  const hi = w.discontinuedYear != null ? w.discontinuedYear + 1 : now.getUTCFullYear();
  const obsLo = w.observedMinYear ?? lo;
  const obsHi = w.observedMaxYear ?? hi;
  return [Math.min(lo, obsLo), Math.max(hi, obsHi)];
}

export function minYearGap(cands: DateCandidate[]): number {
  const ys = [...new Set(cands.map((c) => c.year))].sort((a, b) => a - b);
  let g = Infinity;
  for (let i = 1; i < ys.length; i++) g = Math.min(g, ys[i]! - ys[i - 1]!);
  return g;
}

export function selectDate(
  candidates: DateCandidate[],
  ev: DecodeEvidence | null | undefined,
  window: ModelWindow | null | undefined,
  now: Date,
): Selection {
  const e = ev ?? {};
  if (e.plateDate) return { kind: "ok", chosen: { year: e.plateDate.year, month: e.plateDate.month ?? undefined }, source: "plate_printed" };
  const prior = dedupe((e.priorPlate ?? []).map((p) => ({ year: p.year, month: p.month ?? undefined })));
  if (prior.length === 1) return { kind: "ok", chosen: prior[0]!, source: "plate_printed_prior" };
  if (prior.length > 1) return { kind: "ambiguous", candidates: prior, source: "plate_printed_prior" };
  if (e.factory) return { kind: "ok", chosen: { year: e.factory.year, month: e.factory.month ?? undefined }, source: "factory_record" };

  let pool = dedupe(candidates);
  if (e.shippedBy) pool = pool.filter((c) => !afterBound(c, e.shippedBy!));
  if (e.receiptBy) pool = pool.filter((c) => !afterBound(c, e.receiptBy!));
  if (!pool.length) return { kind: "none", reason: "no_candidate_fits" };

  const b = windowBounds(window, now);
  if (b && pool.length > 1 && minYearGap(pool) >= WINDOW_MIN_GAP_YEARS) {
    const inside = pool.filter((c) => c.year >= b[0] && c.year <= b[1]);
    if (inside.length) pool = inside;
  }
  if (pool.length === 1) return { kind: "ok", chosen: pool[0]!, source: "serial" };
  return { kind: "ambiguous", candidates: pool, source: "serial" };
}

/**
 * Parse a date printed on the plate: 2019.03, 03/2019, 3/2019, MFD 2019-03,
 * 2019-03, 201903, or an FD code (FD0103 → Mar 2021). Returns null if unclear.
 */
export function parsePlateDate(raw: string | null | undefined, now: Date = new Date()): YearMonth | null {
  const s = (raw ?? "").toUpperCase().replace(/^\s*(MFD|MFG|DATE|MANUFACTURED)[:\s]*/, "").trim();
  if (!s) return null;
  let year: number | null = null;
  let month: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^FD\s*(\d{2})(\d{2})/))) {
    const yy = Number(m[1]);
    year = yy <= 59 ? 2020 + yy : 1920 + yy;
    month = Number(m[2]);
  } else if ((m = s.match(/^(\d{4})[.\-/\s](\d{1,2})$/)) || (m = s.match(/^(\d{4})(\d{2})$/))) {
    year = Number(m[1]); month = Number(m[2]);
  } else if ((m = s.match(/^(\d{1,2})[.\-/\s](\d{4})$/))) {
    month = Number(m[1]); year = Number(m[2]);
  } else if ((m = s.match(/^(\d{4})$/))) {
    year = Number(m[1]);
  }
  if (year == null || year < 1950 || year > now.getUTCFullYear()) return null;
  if (month != null && (month < 1 || month > 12)) return null;
  return { year, month };
}
