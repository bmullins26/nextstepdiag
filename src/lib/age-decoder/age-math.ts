/** Pure date helpers for displaying manufacture ranges and age. */
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Date range a decode actually supports: week > month > whole year. */
export function manufactureRange(year: number, month: number | null, week: number | null) {
  if (week != null && week >= 1 && week <= 53) {
    const start = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const end = new Date(Math.min(start.getTime() + 6 * 864e5, Date.UTC(year, 11, 31)));
    return { start: iso(start), end: iso(end), month: start.getUTCMonth() + 1 };
  }
  if (month != null) {
    return { start: iso(new Date(Date.UTC(year, month - 1, 1))), end: iso(new Date(Date.UTC(year, month, 0))), month };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, month: null };
}

/** Full years elapsed since the start date (no rounding up). */
export function completedYears(startIso: string, now: Date): number {
  const s = new Date(startIso + "T00:00:00Z");
  let y = now.getUTCFullYear() - s.getUTCFullYear();
  if (now.getUTCMonth() < s.getUTCMonth() || (now.getUTCMonth() === s.getUTCMonth() && now.getUTCDate() < s.getUTCDate())) y--;
  return Math.max(0, y);
}

/**
 * Technician-facing age text. Always floored.
 *   month or week known → "X yr"; year only → "X–Y yr"; ambiguous → null.
 */
export function formatAge(
  d: { year: number; month?: number | null; week?: number | null } | null | undefined,
  now: Date,
  ambiguous = false,
): string | null {
  if (!d || ambiguous) return null;
  if (d.week != null || d.month != null) {
    const r = manufactureRange(d.year, d.month ?? null, d.week ?? null);
    return `${completedYears(r.start, now)} yr`;
  }
  const lo = completedYears(`${d.year}-12-31`, now);
  const hi = completedYears(`${d.year}-01-01`, now);
  return lo === hi ? `${lo} yr` : `${lo}–${hi} yr`;
}

/** Stored age (e.g. history rows) displayed as whole years, floored. */
export function formatStoredAge(ageYears: number | null | undefined): string | null {
  return ageYears == null || !Number.isFinite(ageYears) ? null : `${Math.max(0, Math.floor(ageYears))} yr`;
}
