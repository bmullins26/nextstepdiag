export function normalizeComplaint(s: string): string {
  const t = (s || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function normalizeBrandDisplay(s: string): string {
  return (s || "").trim();
}

export function normalizeTypeDisplay(s: string): string {
  return (s || "").trim();
}

export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const out = new Set<string>();
  for (const raw of tags) {
    const t = (raw || "").trim().toLowerCase().replace(/\s+/g, "-");
    if (t) out.add(t);
  }
  return Array.from(out).slice(0, 8);
}

export const DISCUSSION_TYPES = [
  "general",
  "repair_tip",
  "question",
  "confirmed_repair",
  "diagnostic_advice",
  "part_recommendation",
  "installation_tip",
  "tech_sheet",
  "service_bulletin",
] as const;

export type DiscussionType = (typeof DISCUSSION_TYPES)[number];

export const DISCUSSION_TYPE_LABEL: Record<DiscussionType, string> = {
  general: "General",
  repair_tip: "Repair Tip",
  question: "Question",
  confirmed_repair: "Confirmed Repair",
  diagnostic_advice: "Diagnostic Advice",
  part_recommendation: "Part Recommendation",
  installation_tip: "Installation Tip",
  tech_sheet: "Tech Sheet",
  service_bulletin: "Service Bulletin",
};