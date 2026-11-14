// Manufacturer-published production windows shipped with the decoder (pure, no I/O).
// Used when the database has no window on file. Only brands whose OEM publishes
// official first/last production years are included here.
import type { ModelWindow } from "./types";
import { resolveBrand } from "./registry";
import { SUBZERO_WOLF_TIMELINE } from "./data/subzero-wolf-timeline";

const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Narrowing source: official Sub-Zero Group model-number timelines. Row-level
 * citations live in data/subzero-wolf-timeline.ts (SUBZERO_WOLF_SOURCES).
 * Index pages:
 *   https://www.subzero-wolf.com/assistance/answers/sub-zero/common/sub-zero-model-number-timeline
 *   https://www.subzero-wolf.com/assistance/answers/wolf/common/wolf-model-number-timeline
 * Treated like an owner window: first/last bound candidates (last = null →
 * current production), same ≥5-year-gap rule in select.ts.
 */
export function staticModelWindow(brand: string, model?: string | null): ModelWindow | null {
  const m = norm(model ?? "");
  if (!m || resolveBrand(brand) !== "subzero") return null;
  let best: (typeof SUBZERO_WOLF_TIMELINE)[number] | null = null;
  for (const r of SUBZERO_WOLF_TIMELINE) {
    if (m.startsWith(r.prefix) && (!best || r.prefix.length > best.prefix.length)) best = r;
  }
  if (!best) return null;
  return {
    manufacturer: "Sub-Zero Group",
    brand: best.brand === "wolf" ? "Wolf" : "Sub-Zero",
    modelPrefix: best.prefix,
    introducedYear: best.first,
    discontinuedYear: best.last,
    replacementSeries: `${best.series} — official Sub-Zero Group timeline`,
    kind: "oem_timeline",
  };
}
